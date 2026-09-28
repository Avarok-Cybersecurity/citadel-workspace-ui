/**
 * Yjs updates and awareness cross the wire as CBOR byte strings.
 *
 * They were sent as `Array.from(update)`, a CBOR array of small integers:
 * each byte above 23 costs two bytes, so a 10 KB snapshot went out as about
 * 20.7 KB (measured, 2026-09-28). A `Uint8Array` is encoded as a byte string
 * at one byte per byte.
 *
 * Older builds still send the array form, and receivers must keep applying
 * it. `new Uint8Array(x)` on the receiving side accepts both.
 *
 * Real: the provider pair, the CBOR codec and the event path. Mocked: the
 * socket send, which has no socket in this process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { YJS_UPDATE_COALESCE_MS } from '../constants';
import { pump, decodePayload, type OutboxEntry } from './wire-harness';
import { eventEmitter } from '@/lib/event-emitter';
import { serializeP2PCommand, deserializeP2PCommand, type P2PCommand } from '@/types/p2p-commands';

const outbox: OutboxEntry[] = [];
const live: YjsP2PProvider[] = [];

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendP2PMessageBytes: (own: bigint, peer: bigint, bytes: Uint8Array): Promise<void> => {
      outbox.push({ from: own.toString(), to: peer.toString(), bytes });
      return Promise.resolve();
    },
  },
}));

import { YjsP2PProvider } from '../provider';

beforeEach(() => {
  outbox.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  for (const provider of live.splice(0)) provider.destroy();
  vi.useRealTimers();
});

function syncedPair(): { aDoc: Y.Doc; bDoc: Y.Doc; a: YjsP2PProvider; b: YjsP2PProvider } {
  const aDoc: Y.Doc = new Y.Doc();
  const bDoc: Y.Doc = new Y.Doc();
  const a: YjsP2PProvider = new YjsP2PProvider('doc-bytes', '2', aDoc, '1', '1');
  const b: YjsP2PProvider = new YjsP2PProvider('doc-bytes', '1', bDoc, '2', '1');
  live.push(a, b);
  pump(outbox);
  return { aDoc, bDoc, a, b };
}

function takeFirst(sub: string): OutboxEntry {
  const index: number = outbox.findIndex((e: OutboxEntry): boolean => {
    const p: Record<string, unknown> = decodePayload(e);
    return p.type === 'yjs_sync' && p.sub_type === sub;
  });
  expect(index, `no ${sub} on the wire`).toBeGreaterThanOrEqual(0);
  return outbox.splice(index, 1)[0];
}

describe('Yjs traffic is sent as bytes', () => {
  it('an update carries a byte string, which is smaller than the array form', () => {
    const { aDoc } = syncedPair();
    aDoc.getText('t').insert(0, 'the quick brown fox jumps over the lazy dog '.repeat(20));
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);

    const entry: OutboxEntry = takeFirst('update');
    const command: P2PCommand = deserializeP2PCommand(entry.bytes);
    const data: unknown = (command.payload as unknown as { data: unknown }).data;
    expect(ArrayBuffer.isView(data), 'data went out as an array of numbers').toBe(true);

    const asArray: P2PCommand = { ...command, payload: { ...command.payload, data: Array.from(data as Uint8Array) } } as P2PCommand;
    expect(entry.bytes.length).toBeLessThan(serializeP2PCommand(asArray).length);
  });

  it('awareness carries a byte string', () => {
    const { a } = syncedPair();
    outbox.length = 0;
    a.setLocalState({ user: { name: 'alice' } });
    const awareness: Record<string, unknown> | undefined = outbox
      .map(decodePayload)
      .find((p: Record<string, unknown>): boolean => p.type === 'yjs_awareness');
    expect(awareness, 'no awareness on the wire').toBeDefined();
    expect(ArrayBuffer.isView(awareness?.awareness)).toBe(true);
  });

  it('an update in the array form an older build sends is still applied', () => {
    const { aDoc, bDoc } = syncedPair();
    aDoc.getText('t').insert(0, 'from an older build');
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);

    const entry: OutboxEntry = takeFirst('update');
    const payload: Record<string, unknown> = decodePayload(entry);
    const legacy: Record<string, unknown> = { ...payload, data: Array.from(payload.data as ArrayLike<number>) };
    eventEmitter.emit('yjs:p2p-command', { peerCid: BigInt(entry.from), payload: legacy });
    pump(outbox);

    expect(bDoc.getText('t').toString()).toBe('from an older build');
  });
});
