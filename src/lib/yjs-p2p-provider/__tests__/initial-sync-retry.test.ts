/**
 * Defect C: the initial sync_step1 was sent exactly once, unacked, at
 * construction — the coldest moment for the channel. If it was lost,
 * syncState sat in 'awaiting_step1_response' for ever: a "syncing" spinner
 * that never cleared, and the 5s health sweep never re-initiated. The sweep
 * now retries the handshake (throttled by YJS_SYNC_COOLDOWN_MS) until the
 * first sync completes, and stops once it has.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { eventEmitter } from '@/lib/event-emitter';
import { decodePayload, type OutboxEntry } from './wire-harness';

const outbox: OutboxEntry[] = [];

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendP2PMessageBytes: (own: bigint, peer: bigint, bytes: Uint8Array): Promise<void> => {
      outbox.push({ from: own.toString(), to: peer.toString(), bytes });
      return Promise.resolve();
    },
  },
}));

import { YjsP2PProvider } from '../provider';

function countStep1(): number {
  return outbox.filter((e: OutboxEntry): boolean => decodePayload(e).sub_type === 'sync_step1').length;
}

beforeEach(() => {
  outbox.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('initial sync retry (defect C)', () => {
  it('re-sends sync_step1 from the health sweep when the first one is lost', () => {
    const doc: Y.Doc = new Y.Doc();
    const provider: YjsP2PProvider = new YjsP2PProvider('doc-c', '2', doc, '1', '1');

    expect(countStep1()).toBe(1);
    expect(provider.isSynced).toBe(false);

    // Nothing is ever delivered (the step1 is "lost"). Sweeps run at 5s
    // (inside the 10s cooldown: throttled), 10s (retries) and 15s
    // (throttled again) — so exactly one retry, proving both the retry and
    // its throttling.
    vi.advanceTimersByTime(15_100);
    expect(countStep1()).toBe(2);

    provider.destroy();
  });

  it('stops re-initiating once the initial sync completes', () => {
    const doc: Y.Doc = new Y.Doc();
    const provider: YjsP2PProvider = new YjsP2PProvider('doc-c2', '2', doc, '1', '1');

    // Peer answers with a (trivial) sync_step2 — the handshake completes.
    const emptyDiff: number[] = Array.from(Y.encodeStateAsUpdate(new Y.Doc()));
    eventEmitter.emit('yjs:p2p-command', {
      peerCid: 2n,
      payload: {
        type: 'yjs_sync',
        sub_type: 'sync_step2',
        document_id: 'doc-c2',
        data: emptyDiff,
        message_id: 'peer-step2',
      },
    });
    expect(provider.isSynced).toBe(true);
    const step1sAtSync: number = countStep1();

    vi.advanceTimersByTime(30_000);
    expect(countStep1()).toBe(step1sAtSync);

    provider.destroy();
  });
});
