/**
 * Restoring a document from storage must not be broadcast to the peer.
 *
 * `useDocumentPersistence` applies the stored state to the SAME Y.Doc the
 * editor uses, and that doc has the P2P provider attached. The apply carried no
 * origin, so the provider's update handler saw it as a local edit and pushed the
 * whole document at the peer every time an editor mounted — over a transport the
 * handler's own comment says is overrun by one message per keystroke.
 *
 * Nothing is lost by not sending it: the provider's initial sync exchanges state
 * vectors and asks for what the peer actually lacks.
 *
 * Both directions are pinned. A handler that ignored every origin would satisfy
 * the restore case while silencing real edits, so a genuine local edit is
 * asserted to still go out.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { PERSISTED_LOAD_ORIGIN } from '../types';

import { isLocalEdit } from '../provider';

/** The provider's own rule, not a copy: a copy would drift and keep passing. */
const providerWouldBroadcast: (origin: unknown) => boolean = (origin) =>
  isLocalEdit(origin as never);

function originsSeen(apply: (doc: Y.Doc) => void): unknown[] {
  const doc: Y.Doc = new Y.Doc();
  const seen: unknown[] = [];
  doc.on('update', (_u: Uint8Array, origin: unknown): void => { seen.push(origin); });
  apply(doc);
  return seen;
}

describe('restoring a document from storage', () => {
  it('is tagged with an origin the provider ignores', (): void => {
    const source: Y.Doc = new Y.Doc();
    source.getText('t').insert(0, 'restored content');
    const state: Uint8Array = Y.encodeStateAsUpdate(source);

    const seen: unknown[] = originsSeen((doc) => Y.applyUpdate(doc, state, PERSISTED_LOAD_ORIGIN));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe('persisted-load');
    expect(providerWouldBroadcast(seen[0])).toBe(false);
  });

  it('would have been broadcast when applied untagged', (): void => {
    // The defect, stated as a fact about the old call rather than as prose.
    const source: Y.Doc = new Y.Doc();
    source.getText('t').insert(0, 'restored content');
    const state: Uint8Array = Y.encodeStateAsUpdate(source);

    const seen: unknown[] = originsSeen((doc) => Y.applyUpdate(doc, state));

    expect(providerWouldBroadcast(seen[0])).toBe(true);
  });

  it('still broadcasts a genuine local edit', (): void => {
    const seen: unknown[] = originsSeen((doc) => { doc.getText('t').insert(0, 'typed'); });

    expect(seen).toHaveLength(1);
    expect(providerWouldBroadcast(seen[0])).toBe(true);
  });
});
