import { describe, it, expect, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import { collaborativeExtensions } from '../editor-extensions';

/**
 * Undo/redo on a collaborative document.
 *
 * `history: false` is correct (ProseMirror history must not run beside Yjs), but it
 * leaves undo to the Collaboration extension's yUndoPlugin. These tests drive the
 * real extension set over real Y.Docs; nothing is mocked. The two docs stand in
 * for two peers, joined by relaying updates exactly as the P2P provider does.
 */
const REMOTE_ORIGIN: string = 'remote-peer';

function mount(doc: Y.Doc): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: collaborativeExtensions(doc),
  });
}

function link(a: Y.Doc, b: Y.Doc): void {
  a.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== REMOTE_ORIGIN) Y.applyUpdate(b, u, REMOTE_ORIGIN); });
  b.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== REMOTE_ORIGIN) Y.applyUpdate(a, u, REMOTE_ORIGIN); });
}

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach((e) => e.destroy()); });

describe('undo and redo', () => {
  it('reverts a local edit and redo restores it', () => {
    const editor: Editor = mount(new Y.Doc());
    editors.push(editor);
    editor.commands.insertContent('hello');
    expect(editor.getText()).toBe('hello');
    expect(editor.can().undo()).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe('');
    expect(editor.can().redo()).toBe(true);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getText()).toBe('hello');
  });

  it('does not offer undo before the user has typed', () => {
    const editor: Editor = mount(new Y.Doc());
    editors.push(editor);
    expect(editor.can().undo()).toBe(false);
  });

  it('never undoes a remote peer edit', () => {
    const docA: Y.Doc = new Y.Doc();
    const docB: Y.Doc = new Y.Doc();
    link(docA, docB);
    const alice: Editor = mount(docA);
    const bob: Editor = mount(docB);
    editors.push(alice, bob);

    alice.commands.insertContent('alice');
    bob.commands.insertContent(' bob');
    expect(alice.getText()).toContain('bob');

    alice.commands.undo();
    expect(alice.getText()).toContain('bob');
    expect(alice.getText()).not.toContain('alice');
    expect(bob.getText()).toBe(alice.getText());
  });

  it('has nothing to undo when the only edit came from a peer', () => {
    const docA: Y.Doc = new Y.Doc();
    const docB: Y.Doc = new Y.Doc();
    link(docA, docB);
    const alice: Editor = mount(docA);
    const bob: Editor = mount(docB);
    editors.push(alice, bob);

    bob.commands.insertContent('only bob');
    expect(alice.can().undo()).toBe(false);
    alice.commands.undo();
    expect(alice.getText()).toBe('only bob');
  });
});
