/**
 * "Turn this message into a document" passed the typed text all the way to the
 * last function and dropped it: the parameter was underscore-ignored and
 * createDocument was called with no initial doc, while the compose box was
 * cleared regardless. Work destroyed on every use.
 *
 * The shape matters as much as the presence. TipTap's Collaboration extension
 * binds to getXmlFragment('default') and expects ProseMirror's model, so a
 * plain Y.Text insert would persist, round-trip, and still render an empty page
 * — the same loss with more steps. These assert the fragment, not just that
 * something was written.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { seedDocument, readSeededText } from '../seed-document';

describe('seedDocument', () => {
  it('puts the text where the editor actually looks for it', () => {
    const doc = seedDocument('hello world');

    const fragment = doc.getXmlFragment('default');
    expect(fragment.length).toBe(1);
    // A Y.Text insert would leave this fragment empty and the page blank.
    expect(readSeededText(doc)).toContain('hello world');
  });

  it('uses paragraph elements, which is what ProseMirror expects', () => {
    const node = seedDocument('a').getXmlFragment('default').get(0);

    expect(node).toBeInstanceOf(Y.XmlElement);
    expect((node as Y.XmlElement).nodeName).toBe('paragraph');
  });

  it('keeps the user\'s line structure, including blank lines', () => {
    const doc = seedDocument('first\n\nthird');

    expect(doc.getXmlFragment('default').length).toBe(3);
  });

  it('survives the encode/decode that persistence puts it through', () => {
    // The editor mints its OWN Y.Doc on mount and loads persisted state into
    // it, so a seed that does not survive this round trip is not a seed.
    const encoded = Y.encodeStateAsUpdate(seedDocument('carried across'));

    const loaded = new Y.Doc();
    Y.applyUpdate(loaded, encoded);

    expect(readSeededText(loaded)).toContain('carried across');
  });

  it('produces an empty document for empty input rather than a blank paragraph soup', () => {
    expect(seedDocument('').getXmlFragment('default').length).toBe(1);
  });
});
