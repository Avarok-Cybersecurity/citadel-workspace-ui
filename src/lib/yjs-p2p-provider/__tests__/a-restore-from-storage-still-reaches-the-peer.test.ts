/**
 * A restore from storage must still reach the peer.
 *
 * The apply is tagged `persisted-load` so it is distinguishable — but the
 * provider deliberately treats it as sendable, and this pins that, because the
 * opposite was tried and was wrong.
 *
 * Suppressing it removes a full-document push at every editor mount, which looks
 * like a clear win. It is also the only thing that carries a restored document
 * to the peer: `handleSyncStep1` sends the peer what THEY lack only when THEY
 * send step1, which happens at their construction — before our asynchronous load
 * from storage lands. The step1 retry runs only while `!initialSyncComplete`,
 * and the periodic hash_check was removed as a never-initiated protocol. So with
 * the restore suppressed, an edit made offline reaches the peer on the next
 * keystroke and not before, and never for someone who reads without typing.
 *
 * The origins that ARE suppressed are asserted alongside, so a rule that sent
 * everything would not satisfy this file.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { PERSISTED_LOAD_ORIGIN } from '../types';
import { isLocalEdit } from '../provider';

function originsSeen(apply: (doc: Y.Doc) => void): unknown[] {
  const doc: Y.Doc = new Y.Doc();
  const seen: unknown[] = [];
  doc.on('update', (_u: Uint8Array, origin: unknown): void => { seen.push(origin); });
  apply(doc);
  return seen;
}

function restoredState(): Uint8Array {
  const source: Y.Doc = new Y.Doc();
  source.getText('t').insert(0, 'edited while offline');
  return Y.encodeStateAsUpdate(source);
}

describe('restoring a document from storage', () => {
  it('is tagged, so its origin is distinguishable', (): void => {
    const seen: unknown[] = originsSeen((doc) =>
      Y.applyUpdate(doc, restoredState(), PERSISTED_LOAD_ORIGIN));

    expect(seen).toEqual([PERSISTED_LOAD_ORIGIN]);
  });

  it('is still sent to the peer, because nothing else would carry it', (): void => {
    expect(isLocalEdit(PERSISTED_LOAD_ORIGIN)).toBe(true);
  });

  it('does not send back what the peer just sent us', (): void => {
    for (const origin of ['remote', 'creator-resync', 'merkle-reconstruct']) {
      expect(isLocalEdit(origin)).toBe(false);
    }
  });

  it('still sends a genuine local edit', (): void => {
    const seen: unknown[] = originsSeen((doc) => { doc.getText('t').insert(0, 'typed'); });

    expect(seen).toHaveLength(1);
    expect(isLocalEdit(seen[0] as never)).toBe(true);
  });
});
