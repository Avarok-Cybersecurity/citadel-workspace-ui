import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { Extensions } from '@tiptap/core';
import type * as Y from 'yjs';
import { createCollaboratorCursor, type CursorUser } from './CollaboratorCursor';

/** What the remote-cursor layer needs from the provider: its awareness channel. */
export interface CursorLayer {
  provider: { awareness: unknown };
  user: CursorUser;
}

/**
 * The editor's extension set.
 *
 * ProseMirror's own history is off because it would fight Yjs. Undo and redo are
 * the Collaboration extension's: it installs y-prosemirror's yUndoPlugin, whose
 * UndoManager tracks only transactions that originate in this editor, so a peer's
 * edit is never rolled back by your Cmd+Z. Adding a second yUndoPlugin here would
 * give the document two undo stacks.
 */
export function collaborativeExtensions(doc: Y.Doc, cursor?: CursorLayer): Extensions {
  return [
    StarterKit.configure({ history: false }),
    Collaboration.configure({ document: doc }),
    ...(cursor ? [
      CollaborationCursor.configure({
        provider: cursor.provider as { awareness: never },
        user: cursor.user,
        render: createCollaboratorCursor,
      }),
    ] : []),
  ];
}
