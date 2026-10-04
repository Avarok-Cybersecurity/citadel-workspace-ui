import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  DOC_TITLE_MAX_LENGTH, validateDocTitle, readDocTitle, writeDocTitle, observeDocTitle,
} from '../doc-title';

/** Two peers' docs, joined the way the P2P provider joins them: relayed updates. */
const RELAY: string = 'relay';
function peers(): [Y.Doc, Y.Doc] {
  const a: Y.Doc = new Y.Doc();
  const b: Y.Doc = new Y.Doc();
  a.on('update', (u: Uint8Array, o: unknown) => { if (o !== RELAY) Y.applyUpdate(b, u, RELAY); });
  b.on('update', (u: Uint8Array, o: unknown) => { if (o !== RELAY) Y.applyUpdate(a, u, RELAY); });
  return [a, b];
}

describe('validateDocTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(validateDocTitle('  Q3 \n plan\t ')).toEqual({ ok: true, title: 'Q3 plan' });
  });
  it.each(['', '   ', '\n\t'])('rejects blank %j', (raw) => {
    expect(validateDocTitle(raw).ok).toBe(false);
  });
  it('accepts exactly the maximum and rejects one more', () => {
    expect(validateDocTitle('x'.repeat(DOC_TITLE_MAX_LENGTH)).ok).toBe(true);
    expect(validateDocTitle('x'.repeat(DOC_TITLE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe('a rename travels through the Yjs map', () => {
  it('reaches the peer and fires its observer', () => {
    const [a, b] = peers();
    const seen: string[] = [];
    observeDocTitle(b, (t) => seen.push(t));
    writeDocTitle(a, '  Roadmap  ');
    expect(readDocTitle(b)).toBe('Roadmap');
    expect(seen).toEqual(['Roadmap']);
  });

  it('observes a local rename too, so the mirrors have one trigger', () => {
    const [a] = peers();
    const seen: string[] = [];
    observeDocTitle(a, (t) => seen.push(t));
    writeDocTitle(a, 'Mine');
    expect(seen).toEqual(['Mine']);
  });

  it('converges when both peers rename at once', () => {
    const [a, b] = peers();
    writeDocTitle(a, 'From A');
    writeDocTitle(b, 'From B');
    expect(readDocTitle(a)).toBe(readDocTitle(b));
  });

  it('refuses to write an invalid title', () => {
    const [a] = peers();
    expect(() => writeDocTitle(a, '   ')).toThrow();
    expect(readDocTitle(a)).toBeNull();
  });

  it('does not trust what a peer wrote: non-strings are ignored, long ones cut', () => {
    const doc: Y.Doc = new Y.Doc();
    doc.getMap('cdoc').set('title', 42);
    expect(readDocTitle(doc)).toBeNull();
    doc.getMap('cdoc').set('title', 'y'.repeat(500));
    expect(readDocTitle(doc)).toBe('y'.repeat(DOC_TITLE_MAX_LENGTH));
  });

  it('ignores other attribute changes', () => {
    const [a] = peers();
    const seen: string[] = [];
    observeDocTitle(a, (t) => seen.push(t));
    a.getMap('cdoc').set('author', 'x');
    expect(seen).toEqual([]);
  });
});
