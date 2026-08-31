/**
 * Defect A: the doc_hash shipped with an update must be the POST-update hash.
 *
 * The sender's Merkle tree used to be updated AFTER the update was sent, so
 * every non-empty update carried the PRE-update hash; the receiver compares
 * AFTER applying, so the hashes mismatched on 100% of real edits and every
 * 300ms keystroke batch triggered a full-document resync. Worse than the
 * cost: real divergence had no distinct signal, because the "diverged" path
 * WAS the normal path.
 *
 * The property pinned here is about the PATH TAKEN on the wire, not hash
 * equality: a normal update must not put 'request_full'/'full_state' on the
 * wire — and (opposite direction) a genuinely diverged pair still must.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { YJS_UPDATE_COALESCE_MS } from '../constants';
import { pump, kinds, type OutboxEntry } from './wire-harness';

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

interface Pair {
  aDoc: Y.Doc;
  bDoc: Y.Doc;
  a: YjsP2PProvider;
  b: YjsP2PProvider;
}

/** Two providers, creator '1' and collaborator '2', initial sync completed. */
function makeSyncedPair(): Pair {
  const aDoc: Y.Doc = new Y.Doc();
  const bDoc: Y.Doc = new Y.Doc();
  const a: YjsP2PProvider = new YjsP2PProvider('doc-hash', '2', aDoc, '1', '1');
  const b: YjsP2PProvider = new YjsP2PProvider('doc-hash', '1', bDoc, '2', '1');
  pump(outbox); // step1/step2/ack exchange
  expect(a.isSynced).toBe(true);
  expect(b.isSynced).toBe(true);
  return { aDoc, bDoc, a, b };
}

beforeEach(() => {
  outbox.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('update hash verification (defect A)', () => {
  it('a normal update does NOT take the full-state resync path', () => {
    const { aDoc, bDoc, a, b }: Pair = makeSyncedPair();

    aDoc.getText('t').insert(0, 'hello');
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);
    const traffic: string[] = kinds(pump(outbox));

    // The edit arrived...
    expect(bDoc.getText('t').toString()).toBe('hello');
    // ...as an update + ack, with NO divergence recovery. Before the fix
    // this contained 'request_full' and 'full_state' for every batch.
    expect(traffic).toContain('update');
    expect(traffic).not.toContain('request_full');
    expect(traffic).not.toContain('full_state');
    // And no renewed sync handshake either.
    expect(traffic).not.toContain('sync_step1');

    a.destroy();
    b.destroy();
  });

  it('several sequential batches in both directions stay on the update path', () => {
    const { aDoc, bDoc, a, b }: Pair = makeSyncedPair();

    for (const [doc, word] of [[aDoc, 'one'], [bDoc, 'two'], [aDoc, 'three']] as const) {
      const text: Y.Text = doc.getText('t');
      text.insert(text.length, word);
      vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);
      const traffic: string[] = kinds(pump(outbox));
      expect(traffic).not.toContain('request_full');
      expect(traffic).not.toContain('full_state');
    }
    expect(aDoc.getText('t').toString()).toBe('onetwothree');
    expect(bDoc.getText('t').toString()).toBe('onetwothree');

    a.destroy();
    b.destroy();
  });

  it('a genuinely diverged pair still resyncs (opposite direction)', () => {
    const { aDoc, bDoc, a, b }: Pair = makeSyncedPair();

    // Genuine divergence, the real way it happens: an update is LOST on the
    // wire. B now lacks content A has, and B's next hash cannot match.
    aDoc.getText('t').insert(0, 'lost');
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);
    outbox.length = 0; // the update never arrives
    expect(bDoc.getText('t').toString()).toBe('');

    // The next normal edit exposes the divergence...
    const aText: Y.Text = aDoc.getText('t');
    aText.insert(aText.length, 'x');
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);
    const traffic: string[] = kinds(pump(outbox));

    // ...and recovery MUST fire: collaborator requests, creator broadcasts.
    // Without this test, a provider that never resyncs would pass the tests
    // above while silently diverging for ever.
    expect(traffic).toContain('request_full');
    expect(traffic).toContain('full_state');
    // Creator-authority full state carries everything; the docs converge.
    expect(bDoc.getText('t').toString()).toBe('lostx');

    a.destroy();
    b.destroy();
  });
});
