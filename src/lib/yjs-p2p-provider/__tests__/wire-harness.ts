/**
 * Wire harness for YjsP2PProvider pair tests.
 *
 * Test files mock `@/lib/websocket-service` so `sendP2PMessageBytes` pushes
 * into an outbox instead of touching a socket. This module owns the OTHER
 * half: decoding those CBOR envelopes with the real `deserializeP2PCommand`
 * (so the actual wire round-trip is exercised) and delivering them through
 * the real event emitter, exactly as `lib/p2p/message-handler.ts` does in
 * production. Providers filter by sender CID themselves, so one emit reaches
 * the right provider of a pair.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { deserializeP2PCommand } from '@/types/p2p-commands';

export interface OutboxEntry {
  from: string;
  to: string;
  bytes: Uint8Array;
}

export function decodePayload(entry: OutboxEntry): Record<string, unknown> {
  return deserializeP2PCommand(entry.bytes).payload as unknown as Record<string, unknown>;
}

/**
 * Deliver every queued message until the wire is quiet; deliveries may
 * enqueue replies, which are delivered in turn. Returns the decoded payloads
 * in delivery order so tests can assert on WHICH message kinds crossed the
 * wire — the resync property is about the path taken, not about hashes.
 * The guard turns a protocol ping-pong into a test failure instead of a hang.
 */
export function pump(outbox: OutboxEntry[]): Record<string, unknown>[] {
  const delivered: Record<string, unknown>[] = [];
  let guard: number = 0;
  while (outbox.length > 0) {
    if (++guard > 500) throw new Error('wire did not quiesce - protocol ping-pong');
    const entry: OutboxEntry | undefined = outbox.shift();
    if (!entry) break;
    const payload: Record<string, unknown> = decodePayload(entry);
    delivered.push(payload);
    eventEmitter.emit('yjs:p2p-command', { peerCid: BigInt(entry.from), payload });
  }
  return delivered;
}

/** Collapse payloads to their kind: sub_type for yjs_sync, type otherwise. */
export function kinds(payloads: Record<string, unknown>[]): string[] {
  return payloads.map((p: Record<string, unknown>): string =>
    p.type === 'yjs_sync' ? String(p.sub_type) : String(p.type)
  );
}
