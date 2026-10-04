import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import { EditorToolbar } from '../EditorToolbar';
import { collaborativeExtensions } from '../editor-extensions';

/** The real toolbar over a real collaborative editor: the buttons, not just the commands. */
function Harness({ doc, onEditor }: { doc: Y.Doc; onEditor: (e: Editor) => void }): JSX.Element {
  const editor: ReturnType<typeof useEditor> = useEditor({ extensions: collaborativeExtensions(doc) }, [doc]);
  if (editor) onEditor(editor);
  return <EditorToolbar editor={editor} />;
}

afterEach(cleanup);

describe('the toolbar Undo and Redo buttons', () => {
  it('are disabled until there is something to undo, then work', () => {
    let editor: Editor | null = null;
    render(<Harness doc={new Y.Doc()} onEditor={(e) => { editor = e; }} />);
    const undo: HTMLElement = screen.getByRole('button', { name: 'Undo' });
    const redo: HTMLElement = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    act(() => { editor?.commands.insertContent('draft'); });
    expect(undo).toBeEnabled();

    fireEvent.click(undo);
    expect(editor?.getText()).toBe('');
    expect(redo).toBeEnabled();

    fireEvent.click(redo);
    expect(editor?.getText()).toBe('draft');
  });
});
