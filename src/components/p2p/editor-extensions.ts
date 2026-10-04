import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import type { Extensions } from '@tiptap/core';
import type * as Y from 'yjs';

/**
 * The editor's extension set, minus the remote-cursor layer.
 *
 * ProseMirror's own history is off because it would fight Yjs. Undo and redo are
 * the Collaboration extension's: it installs y-prosemirror's yUndoPlugin, whose
 * UndoManager tracks only transactions that originate in this editor, so a peer's
 * edit is never rolled back by your Cmd+Z.
 */
export function collaborativeExtensions(doc: Y.Doc): Extensions {
  return [
    StarterKit.configure({ history: false }),
    Collaboration.configure({ document: doc }),
  ];
}
