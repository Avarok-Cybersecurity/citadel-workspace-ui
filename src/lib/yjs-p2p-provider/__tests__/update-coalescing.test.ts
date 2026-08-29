/**
 * Edits are coalesced before they go on the wire.
 *
 * Yjs emits an update per transaction, so typing produced one P2P message per
 * keystroke. Each waits on its own ACK, and the transport beneath is
 * stop-and-wait per peer, so a burst of typing becomes a queue of serialised
 * round trips and the later edits time out before their turn. A live-doc run
 * shows exactly 28 first-attempt ACK timeouts locally and the same 28 in CI,
 * where all three retries expire and those edits are abandoned.
 *
 * The correctness requirement is that batching changes only HOW MANY messages
 * carry the edits, never which edits arrive — so these assert the merged
 * payload reconstructs the document, not merely that fewer sends happened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { YJS_UPDATE_COALESCE_MS } from '../constants';

const sent: Uint8Array[] = [];

vi.mock('../sending', () => ({
  sendUpdate: (_ctx: unknown, update: Uint8Array): void => {
    sent.push(update);
  },
  sendSyncMessage: (): undefined => undefined,
  broadcastAwareness: (): undefined => undefined,
}));
vi.mock('@/lib/event-emitter', () => ({
  eventEmitter: { on: (): () => undefined => (): undefined => undefined, off: (): undefined => undefined, emit: (): undefined => undefined },
}));

import { YjsP2PProvider } from '../provider';

function makeProvider(doc: Y.Doc): YjsP2PProvider {
  return new YjsP2PProvider('doc-1', '2', doc, '1', '1');
}

beforeEach(() => {
  sent.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('yjs update coalescing', () => {
  it('sends one message for a burst of edits, not one per keystroke', () => {
    const doc: Y.Doc = new Y.Doc();
    const provider: YjsP2PProvider = makeProvider(doc);
    sent.length = 0;

    const text: ReturnType<typeof doc.getText> = doc.getText('t');
    for (const ch of 'hello world') {
      text.insert(text.length, ch);
    }

    // Nothing on the wire until the window closes.
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);

    expect(sent).toHaveLength(1);
    provider.destroy();
  });

  it('the merged update reconstructs the document exactly', () => {
    const doc = new Y.Doc();
    const provider: YjsP2PProvider = makeProvider(doc);
    sent.length = 0;

    const text: ReturnType<typeof doc.getText> = doc.getText('t');
    for (const ch of 'hello world') {
      text.insert(text.length, ch);
    }
    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);

    // The assertion that matters: a peer applying what we sent ends up with
    // our document. Counting sends alone would pass on a batcher that dropped
    // edits.
    const peer = new Y.Doc();
    for (const update of sent) Y.applyUpdate(peer, update);
    expect(peer.getText('t').toString()).toBe('hello world');

    provider.destroy();
  });

  it('flushes buffered edits on destroy rather than dropping them', () => {
    const doc = new Y.Doc();
    const provider: YjsP2PProvider = makeProvider(doc);
    sent.length = 0;

    doc.getText('t').insert(0, 'unsaved');
    expect(sent).toHaveLength(0);

    // Closing a document immediately after typing is ordinary use; those edits
    // must not die in the buffer.
    provider.destroy();

    expect(sent).toHaveLength(1);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, sent[0]);
    expect(peer.getText('t').toString()).toBe('unsaved');
  });

  it('ignores remote-origin updates, which must not be echoed back', () => {
    const doc = new Y.Doc();
    const provider: YjsP2PProvider = makeProvider(doc);
    sent.length = 0;

    const other = new Y.Doc();
    other.getText('t').insert(0, 'from the peer');
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), 'remote');

    vi.advanceTimersByTime(YJS_UPDATE_COALESCE_MS + 5);
    expect(sent).toHaveLength(0);

    provider.destroy();
  });
});
