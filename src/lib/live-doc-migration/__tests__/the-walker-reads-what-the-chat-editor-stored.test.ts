/**
 * The walker, over real-shaped Yjs: StarterKit documents written by y-prosemirror (and one by a
 * real TipTap editor with the chat's own extension set), read back with yjs alone.
 *
 * Two oracles, because they fail differently: ProseMirror's StarterKit schema (the walk must be
 * a VALID document that equals the input once defaults are filled in), and y-prosemirror's own
 * reader (the walk must match what the editor would have shown).
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Editor, type JSONContent } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { collaborativeExtensions } from '@/components/p2p/editor-extensions';
import { seedDocument } from '@/lib/live-document-store/seed-document';
import { walkYjsDoc, walkYjsState, YjsWalkError, TIPTAP_FRAGMENT, type WalkedDocument } from '../yjs-walker';
import { plainTextOf } from '../pm-json';
import { canonical, chatYDoc, STARTER_KIT_SCHEMA } from './fixtures';

const text = (t: string, marks?: JSONContent['marks']): JSONContent => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const para = (...content: JSONContent[]): JSONContent => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const item = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

const FIXTURES: Record<string, JSONContent> = {
  headings: doc(
    { type: 'heading', attrs: { level: 1 }, content: [text('One')] },
    { type: 'heading', attrs: { level: 2 }, content: [text('Two')] },
    { type: 'heading', attrs: { level: 6 }, content: [text('Six')] },
  ),
  nestedLists: doc(
    { type: 'bulletList', content: [
      item(para(text('a')), { type: 'orderedList', attrs: { start: 3 }, content: [item(para(text('a.3')), { type: 'bulletList', content: [item(para(text('deep')))] })] }),
      item(para(text('b'))),
    ] },
  ),
  marks: doc(para(
    text('plain '), text('bold', [{ type: 'bold' }]), text(' '), text('both', [{ type: 'bold' }, { type: 'italic' }]),
    text(' '), text('struck', [{ type: 'strike' }]), text(' '), text('code', [{ type: 'code' }]),
  )),
  blocks: doc(
    { type: 'blockquote', content: [para(text('quoted')), para(text('twice'))] },
    { type: 'codeBlock', attrs: { language: 'rust' }, content: [text('fn main() {}\n  // two lines')] },
    { type: 'horizontalRule' },
    para(text('line'), { type: 'hardBreak' }, text('break')),
  ),
  empty: { type: 'doc', content: [para()] },
  emptyParagraphs: doc(para(text('a')), para(), para(), para(text('b'))),
  unicodeRtl: doc(
    para(text('שלום עולם — مرحبا بالعالم')),
    para(text('👩🏽‍💻 family 👨‍👩‍👧‍👦 flags 🇩🇪 combining é ñ')),
    para(text('mixed ltr עברית rtl', [{ type: 'italic' }])),
  ),
};

function roundTrip(json: JSONContent): WalkedDocument {
  return walkYjsState(Y.encodeStateAsUpdate(chatYDoc(json, null)));
}

describe('the walker reads every StarterKit shape the chat editor stored', () => {
  for (const [name, json] of Object.entries(FIXTURES)) {
    it(`${name}: a valid StarterKit document equal to what was written`, () => {
      const walked: WalkedDocument = roundTrip(json);
      expect(canonical(walked.pm)).toEqual(canonical(json));
    });

    it(`${name}: what y-prosemirror itself reads from the same state`, () => {
      const ydoc: Y.Doc = chatYDoc(json, null);
      const oracle: unknown = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment(TIPTAP_FRAGMENT), STARTER_KIT_SCHEMA).toJSON();
      expect(canonical(walkYjsDoc(ydoc).pm)).toEqual(oracle);
    });
  }

  it('reads a document a real TipTap editor wrote through the chat’s own extensions', () => {
    const ydoc: Y.Doc = new Y.Doc();
    const editor: Editor = new Editor({ extensions: collaborativeExtensions(ydoc) });
    editor.commands.setContent(FIXTURES.nestedLists);
    editor.commands.insertContentAt(editor.state.doc.content.size, FIXTURES.marks.content ?? []);
    const shown: unknown = editor.getJSON();
    editor.destroy();
    expect(canonical(walkYjsState(Y.encodeStateAsUpdate(ydoc)).pm)).toEqual(canonical(shown));
  });

  it('reads the seeded "turn this message into a document" shape', () => {
    const walked: WalkedDocument = walkYjsState(Y.encodeStateAsUpdate(seedDocument('first\n\nthird')));
    expect(walked.pm).toEqual(doc(para(text('first')), para(), para(text('third'))));
  });

  it('carries the title from the document’s attributes map, and null when it has none', () => {
    expect(walkYjsState(Y.encodeStateAsUpdate(chatYDoc(FIXTURES.headings, 'Quarterly plan'))).title).toBe('Quarterly plan');
    expect(roundTrip(FIXTURES.headings).title).toBeNull();
  });

  it('keeps a large document whole, in bounded time', () => {
    const paragraphs: JSONContent[] = Array.from({ length: 3000 }, (_: unknown, i: number): JSONContent => para(text(`Paragraph ${i} `), text('bold', [{ type: 'bold' }])));
    const started: number = performance.now();
    const walked: WalkedDocument = roundTrip(doc(...paragraphs));
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(walked.pm.content).toHaveLength(3000);
    expect(canonical(walked.pm)).toEqual(canonical(doc(...paragraphs)));
  });

  it('merges neighbouring runs with the same marks, as y-prosemirror does on read', () => {
    const ydoc: Y.Doc = new Y.Doc();
    const paragraph: Y.XmlElement = new Y.XmlElement('paragraph');
    ydoc.getXmlFragment(TIPTAP_FRAGMENT).insert(0, [paragraph]);
    paragraph.insert(0, [new Y.XmlText('ab'), new Y.XmlText('cd')]);
    expect(walkYjsDoc(ydoc).pm).toEqual(doc(para(text('abcd'))));
  });

  it('reads a hashed mark name (a self-overlapping mark) as its type', () => {
    const ydoc: Y.Doc = new Y.Doc();
    const paragraph: Y.XmlElement = new Y.XmlElement('paragraph');
    ydoc.getXmlFragment(TIPTAP_FRAGMENT).insert(0, [paragraph]);
    const run: Y.XmlText = new Y.XmlText();
    paragraph.insert(0, [run]);
    run.insert(0, 'note', { 'comment--abcd1234': { id: 7 } });
    expect(walkYjsDoc(ydoc).pm).toEqual(doc(para(text('note', [{ type: 'comment', attrs: { id: 7 } }]))));
  });
});

describe('the walker refuses what it cannot read faithfully', () => {
  it('refuses a state whose updates depend on updates never stored', () => {
    const source: Y.Doc = chatYDoc(FIXTURES.marks, null);
    const before: Uint8Array = Y.encodeStateVector(source);
    source.getXmlFragment(TIPTAP_FRAGMENT).insert(1, [new Y.XmlElement('paragraph')]);
    const onlyTheLaterEdit: Uint8Array = Y.encodeStateAsUpdate(source, before);
    expect(() => walkYjsState(onlyTheLaterEdit)).toThrow(YjsWalkError);
    // Control: the same edit with its history reads fine.
    expect(() => walkYjsState(Y.encodeStateAsUpdate(source))).not.toThrow();
  });

  it('refuses bytes that are not a Yjs update', () => {
    expect(() => walkYjsState(new Uint8Array([1, 2, 3, 250, 251]))).toThrow(YjsWalkError);
  });

  it('refuses an embedded object in a text, which the chat editor never wrote', () => {
    const ydoc: Y.Doc = new Y.Doc();
    const paragraph: Y.XmlElement = new Y.XmlElement('paragraph');
    ydoc.getXmlFragment(TIPTAP_FRAGMENT).insert(0, [paragraph]);
    const run: Y.XmlText = new Y.XmlText('ok');
    paragraph.insert(0, [run]);
    run.insertEmbed(1, { image: 'x' });
    expect(() => walkYjsDoc(ydoc)).toThrow(YjsWalkError);
  });

  it('refuses text at the root, outside any block', () => {
    const ydoc: Y.Doc = new Y.Doc();
    ydoc.getXmlFragment(TIPTAP_FRAGMENT).insert(0, [new Y.XmlText('loose')]);
    expect(() => walkYjsDoc(ydoc)).toThrow(YjsWalkError);
  });
});

describe('the original as text', () => {
  it('keeps every word, a block per line, lists and quotes marked', () => {
    expect(plainTextOf(roundTrip(FIXTURES.nestedLists).pm)).toBe('- a\n  3. a.3\n     - deep\n- b');
    expect(plainTextOf(roundTrip(FIXTURES.blocks).pm)).toBe('> quoted\n> twice\nfn main() {}\n  // two lines\n---\nline\nbreak');
    expect(plainTextOf(roundTrip(FIXTURES.unicodeRtl).pm)).toContain('שלום עולם — مرحبا بالعالم');
  });
});
