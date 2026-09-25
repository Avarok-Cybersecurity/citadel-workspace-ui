/**
 * A peer-group reaction reaches the open thread AND the stored transcript, is
 * applied once however often it is redelivered, and is still there after a
 * reload -- including one that arrived while the group was not open.
 *
 * Same harness as a-peer-group-keeps-its-history: the manager, the bindings and
 * the transcript store run for real; `storage-utils` is a Map round-tripped
 * through `structuredClone` (what IndexedDB does, so a bigint reactor that
 * would not survive the real store does not survive this one), and
 * `instanceManager` picks the signed-in account. A reload is
 * `vi.resetModules()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GroupMessage } from '@/types/workspace-entities';
import type { GroupReactionEvent } from '../peer-group-reaction-inbound';

const world: { store: Map<string, unknown>; cid: bigint | null } = vi.hoisted(() => ({
  store: new Map<string, unknown>(), cid: null as bigint | null,
}));
vi.mock('@/lib/storage-utils', () => ({
  dbGet: async (_s: string, k: string): Promise<unknown> => (world.store.has(k) ? structuredClone(world.store.get(k)) : undefined),
  dbPut: async (_s: string, k: string, v: unknown): Promise<void> => { world.store.set(k, structuredClone(v)); },
}));
vi.mock('@/lib/multi-instance/instance-manager', () => ({
  instanceManager: { get cid(): bigint | null { return world.cid; } },
}));

const GROUP: string = '7:42';
const ALICE: bigint = 7n;

async function boot(): Promise<{
  thread: () => GroupMessage[];
  receive: (event: GroupReactionEvent) => Promise<void>;
  restore: () => Promise<void>;
  deliver: () => void;
  stop: () => void;
}> {
  vi.resetModules();
  const { groupMessagingManager } = await import('@/lib/group-messaging-manager');
  const { bindGroupTranscript } = await import('../bind-group-transcript');
  const { deliverPeerGroupMessage } = await import('../peer-group-delivery');
  const { applyGroupReaction } = await import('../group-reactions');
  const store: typeof import('../group-transcript-store') = await import('../group-transcript-store');
  const stop: () => void = bindGroupTranscript();
  return {
    thread: (): GroupMessage[] => groupMessagingManager.getMessages(GROUP).messages,
    // The binding's own body; applyGroupReaction is what `group:reaction-received` runs.
    receive: (event: GroupReactionEvent): Promise<void> => applyGroupReaction(event),
    restore: (): Promise<void> => store.restoreGroupTranscript(GROUP),
    deliver: (): void => deliverPeerGroupMessage({ groupId: GROUP, messageId: 'm1', senderId: '7', senderName: 'ada', content: 'hi', timestamp: 1 }),
    stop,
  };
}

const thumbs = (at: number, active: boolean = true): GroupReactionEvent => ({
  groupId: GROUP, messageId: 'm1', change: { emoji: '👍', reactorCid: ALICE, at, active },
});

/** Let the transcript's queued read-modify-write settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  world.store.clear();
  world.cid = 99n;
});

describe('a peer-group reaction', () => {
  it('shows in the open thread', async () => {
    const s: Awaited<ReturnType<typeof boot>> = await boot();
    s.deliver();
    await s.receive(thumbs(5));
    expect(s.thread()[0].reactions).toEqual([{ emoji: '👍', reactorCid: ALICE, at: 5, active: true }]);
    s.stop();
  });

  it('is still there after a reload', async () => {
    const before: Awaited<ReturnType<typeof boot>> = await boot();
    before.deliver();
    await settle();
    await before.receive(thumbs(5));
    before.stop();

    const after: Awaited<ReturnType<typeof boot>> = await boot();
    await after.restore();
    expect(after.thread()[0].reactions).toEqual([{ emoji: '👍', reactorCid: ALICE, at: 5, active: true }]);
    after.stop();
  });

  it('reaches the transcript when it arrives while the group is not open', async () => {
    const first: Awaited<ReturnType<typeof boot>> = await boot();
    first.deliver();
    await settle();
    first.stop();

    // A fresh session: nothing in memory for this group, only what is on disk.
    const closed: Awaited<ReturnType<typeof boot>> = await boot();
    await closed.receive(thumbs(5));
    await closed.restore();
    expect(closed.thread()[0].reactions?.map((r) => r.reactorCid)).toEqual([ALICE]);
    closed.stop();
  });

  it('is applied once, and a late copy of the add does not undo a removal', async () => {
    const s: Awaited<ReturnType<typeof boot>> = await boot();
    s.deliver();
    await settle();
    await s.receive(thumbs(5));
    await s.receive(thumbs(5));
    await s.receive(thumbs(6, false));
    await s.receive(thumbs(5));
    expect(s.thread()[0].reactions).toEqual([{ emoji: '👍', reactorCid: ALICE, at: 6, active: false }]);
    s.stop();

    const reloaded: Awaited<ReturnType<typeof boot>> = await boot();
    await reloaded.restore();
    expect(reloaded.thread()[0].reactions?.filter((r) => r.active)).toEqual([]);
    reloaded.stop();
  });

  it('is applied when it arrives as the group:reaction-received event', async () => {
    const s: Awaited<ReturnType<typeof boot>> = await boot();
    const { bindGroupReactions } = await import('../group-reactions');
    const { eventEmitter } = await import('@/lib/event-emitter');
    const unbind: () => void = bindGroupReactions();
    s.deliver();
    eventEmitter.emit('group:reaction-received', thumbs(5));
    await settle();
    expect(s.thread()[0].reactions?.map((r) => r.emoji)).toEqual(['👍']);
    unbind();
    s.stop();
  });
});
