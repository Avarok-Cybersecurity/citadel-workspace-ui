/**
 * Retention is applied to a chat when it is opened, and to every chat of this
 * account on a timer -- each with its own period, and never to a chat that
 * keeps everything.
 *
 * The deps stand in for the agent's LocalDB (via `RetentionPageIO`), the clock
 * and the timer; the settings store is real, over an in-memory port.
 */
import { describe, it, expect } from 'vitest';
import { createRetention, type RetentionDeps } from '../retention-runner';
import { ChatAdvancedSettingsStore, type ChatAdvancedSettings, type ChatSettingsStorage } from '../chat-advanced-settings';
import type { ConversationMetadata, MessagePage, P2PMessage } from '../p2p-types';

const OWN: bigint = 1n;
const BOB: bigint = 2n;
const CAROL: bigint = 3n;
const DAY: number = 24 * 60 * 60 * 1000;
const NOW: number = Date.UTC(2026, 8, 25);

function memory(): ChatSettingsStorage {
  const raw: Map<string, unknown> = new Map();
  return { get: async (k: string): Promise<unknown> => raw.get(k), put: async (k: string, v: ChatAdvancedSettings): Promise<void> => { raw.set(k, v); } };
}

function conversation(peer: bigint, ages: number[]): { meta: ConversationMetadata; page: MessagePage } {
  const messages: P2PMessage[] = ages.map((age: number, i: number) => ({
    id: `${peer}-${i}`, content: '', senderCid: peer, recipientCid: OWN, timestamp: NOW - age * DAY, index: i, status: 'delivered', message_type: 'text',
  }) as P2PMessage);
  const times: number[] = messages.map((m: P2PMessage) => m.timestamp);
  return {
    meta: { peerCid: peer, ownerCid: OWN, totalMessageCount: messages.length, oldestMessageTimestamp: Math.min(...times), newestMessageTimestamp: Math.max(...times), latestPage: 0, messagesPerPage: 50, unreadCount: 0, lastMessageIndex: 0, lastUpdated: 0 },
    page: { peerCid: peer, pageNumber: 0, messages, pageTimestamps: { minTimestamp: Math.min(...times), maxTimestamp: Math.max(...times) } },
  };
}

interface Rig { deps: RetentionDeps; data: Map<bigint, { meta: ConversationMetadata; page: MessagePage }>; expired: Array<[bigint, number]>; timers: Array<() => void>; store: ChatAdvancedSettingsStore }

function rig(): Rig {
  const data: Map<bigint, { meta: ConversationMetadata; page: MessagePage }> = new Map([[BOB, conversation(BOB, [10, 1])], [CAROL, conversation(CAROL, [10, 1])]]);
  const expired: Array<[bigint, number]> = [];
  const timers: Array<() => void> = [];
  const store: ChatAdvancedSettingsStore = new ChatAdvancedSettingsStore(memory());
  const deps: RetentionDeps = {
    now: (): number => NOW,
    currentCid: async (): Promise<bigint | null> => OWN,
    settings: store,
    peers: (): bigint[] => [BOB, CAROL],
    lock: <T>(_peer: bigint, op: () => Promise<T>): Promise<T> => op(),
    onExpired: (peer: bigint, cutoff: number): void => { expired.push([peer, cutoff]); },
    every: (_ms: number, tick: () => void): (() => void) => { timers.push(tick); return (): void => {}; },
    io: {
      loadMetadata: async (peer: bigint): Promise<ConversationMetadata | null> => structuredClone(data.get(peer)?.meta ?? null),
      loadPage: async (peer: bigint): Promise<MessagePage | null> => structuredClone(data.get(peer)?.page ?? null),
      savePage: async (peer: bigint, _n: number, p: MessagePage): Promise<void> => { const d: { meta: ConversationMetadata; page: MessagePage } | undefined = data.get(peer); if (d) d.page = structuredClone(p); },
      saveMetadata: async (peer: bigint, m: ConversationMetadata): Promise<void> => { const d: { meta: ConversationMetadata; page: MessagePage } | undefined = data.get(peer); if (d) d.meta = structuredClone(m); },
    },
  };
  return { deps, data, expired, timers, store };
}

const count = (r: Rig, peer: bigint): number => r.data.get(peer)?.page.messages.length ?? -1;

describe('applying retention', () => {
  it('prunes one chat by its own period and tells the open view', async () => {
    const r: Rig = rig();
    await r.store.set(OWN, BOB, { retention: 7 });
    expect(await createRetention(r.deps).applyRetention(BOB)).toBe(1);
    expect(count(r, BOB)).toBe(1);
    expect(r.expired).toEqual([[BOB, NOW - 7 * DAY]]);
  });

  it('leaves a chat that keeps everything untouched', async () => {
    const r: Rig = rig();
    expect(await createRetention(r.deps).applyRetention(CAROL)).toBe(0);
    expect(count(r, CAROL)).toBe(2);
    expect(r.expired).toEqual([]);
  });

  it('sweeps every chat when started, and again on each tick', async () => {
    const r: Rig = rig();
    await r.store.set(OWN, BOB, { retention: 30 });
    await r.store.set(OWN, CAROL, { retention: 7 });
    const retention: ReturnType<typeof createRetention> = createRetention(r.deps);

    await retention.sweepNow();
    expect([count(r, BOB), count(r, CAROL)]).toEqual([2, 1]);

    // Bob's period shortens; the next tick applies it without anyone opening the chat.
    await r.store.set(OWN, BOB, { retention: 1 });
    retention.start(60_000);
    expect(r.timers).toHaveLength(1);
    await retention.tick();
    expect(count(r, BOB)).toBe(1);
  });

  it('starts one timer however often it is started', () => {
    const r: Rig = rig();
    const retention: ReturnType<typeof createRetention> = createRetention(r.deps);
    retention.start(60_000);
    retention.start(60_000);
    expect(r.timers).toHaveLength(1);
  });
});
