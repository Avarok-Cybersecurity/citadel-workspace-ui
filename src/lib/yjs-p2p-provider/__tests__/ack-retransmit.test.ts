/**
 * Defect B: an ACK timeout must RETRANSMIT the message, not merely log
 * "retry n/3" and re-arm the timer. Before the fix, PendingAck did not even
 * store the payload, so a lost update was silently abandoned after the
 * retries "expired" — hidden only by defect A's constant full-state resync.
 * With A fixed, this retransmit is the delivery guarantee (the two fixes are
 * coupled; see ack-checker.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { YJS_ACK_TIMEOUT_MS, YJS_MAX_RETRIES } from '../constants';
import type { PendingAck } from '../types';
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

import { checkPendingAcks, type AckCheckerContext } from '../ack-checker';
import { sendSyncMessage } from '../sending';

function makeCtx(): AckCheckerContext {
  return {
    ownCid: '1',
    peerCid: '2',
    documentId: 'doc-retx',
    creatorCid: '1',
    revision: 0,
    merkleTree: null,
    pendingAcks: new Map<string, PendingAck>(),
    doc: new Y.Doc(),
    syncState: 'synced',
    initialSyncComplete: true, // isolate B from the initial-sync retry (defect C)
    initiateSync: vi.fn(),
  };
}

/** Age every pending entry past the ACK timeout. */
function expireAcks(ctx: AckCheckerContext): void {
  for (const pending of ctx.pendingAcks.values()) {
    pending.sentAt = Date.now() - (YJS_ACK_TIMEOUT_MS + 1);
  }
}

describe('ACK timeout retransmission (defect B)', () => {
  it('retransmits the exact same wire message on timeout', () => {
    outbox.length = 0;
    const ctx: AckCheckerContext = makeCtx();

    sendSyncMessage(ctx, 'update', new Uint8Array([1, 2, 3]), true);
    expect(outbox).toHaveLength(1);
    const original: Record<string, unknown> = decodePayload(outbox[0]);

    expireAcks(ctx);
    checkPendingAcks(ctx);

    // Before the fix, the sweep logged a retry and sent NOTHING.
    expect(outbox).toHaveLength(2);
    const retransmitted: Record<string, unknown> = decodePayload(outbox[1]);
    // Byte-identical intent: same message_id (so the eventual ACK still
    // clears the entry) and same data (Y.applyUpdate is idempotent, so a
    // duplicate arrival is harmless).
    expect(retransmitted).toEqual(original);
    expect(ctx.pendingAcks.get(String(original.message_id))?.retryCount).toBe(1);
  });

  it('gives up after YJS_MAX_RETRIES and stops sending', () => {
    outbox.length = 0;
    const ctx: AckCheckerContext = makeCtx();

    sendSyncMessage(ctx, 'update', new Uint8Array([9]), true);

    for (let i: number = 0; i < YJS_MAX_RETRIES + 2; i++) {
      expireAcks(ctx);
      checkPendingAcks(ctx);
    }

    // 1 original + YJS_MAX_RETRIES retransmits, then the entry is dropped;
    // extra sweeps send nothing more.
    expect(outbox).toHaveLength(1 + YJS_MAX_RETRIES);
    expect(ctx.pendingAcks.size).toBe(0);
  });

  it('an ACKed message is never retransmitted', () => {
    outbox.length = 0;
    const ctx: AckCheckerContext = makeCtx();

    sendSyncMessage(ctx, 'update', new Uint8Array([7]), true);
    const id: string = String(decodePayload(outbox[0]).message_id);
    ctx.pendingAcks.delete(id); // what handleAckMessage does on ACK

    expireAcks(ctx);
    checkPendingAcks(ctx);
    expect(outbox).toHaveLength(1);
  });
});
