import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useEffect, useCallback } from 'react';
import { createCollaboratorCursor, type CursorUser } from './CollaboratorCursor';
import { buildContextMenuFlashComment } from './collaborator-cursor-helpers';
import { MessageSquare } from 'lucide-react';
import { useCollaborativeEditor } from './useCollaborativeEditor';
import { EditorToolbar } from './EditorToolbar';
import { eventEmitter } from '@/lib/event-emitter';
import { activateOnKey } from '@/lib/a11y';
import { usePrompt } from '@/components/shared/prompt-dialog';

interface CollaborativeEditorProps {
  documentId: string;
  peerCid: string;
  currentUserCid: string;
  currentUserName: string;
  peerName?: string;
  creatorCid?: string;
  onSave?: (content: string) => void;
}

export function CollaborativeEditor({
  documentId,
  peerCid,
  currentUserCid,
  currentUserName,
  peerName: _peerName = 'Peer',
  creatorCid,
  onSave,
}: CollaborativeEditorProps) {
  const prompt = usePrompt();
  const {
    doc,
    provider,
    userColor,
    connectedUsers,
    syncState,
    flashComments,
    contextMenu,
    setContextMenu,
    editorContainerRef,
    handleContextMenu,
    dismissFlashComment,
  } = useCollaborativeEditor({
    documentId,
    peerCid,
    currentUserCid,
    currentUserName,
    creatorCid,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: doc,
      }),
      ...(provider ? [
        CollaborationCursor.configure({
          provider: provider as unknown as { awareness: typeof provider.awareness },
          user: {
            name: currentUserName,
            color: userColor,
          },
          render: (user: CursorUser) => createCollaboratorCursor(user),
        }),
      ] : []),
    ],
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm max-w-none focus:outline-none min-h-[300px] p-4',
      },
    },
  }, [doc, provider]);

  // Auto-save on content change (debounced)
  useEffect(() => {
    if (!editor || !onSave) return;

    let timeout: NodeJS.Timeout;
    const handleUpdate = (): void => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        onSave(editor.getHTML());
      }, 1000);
    };

    editor.on('update', handleUpdate);
    return (): void => {
      clearTimeout(timeout);
      editor.off('update', handleUpdate);
    };
  }, [editor, onSave]);

  // Handle flash comment from context menu. Delegates the build to a
  // pure helper so the empty-text guard (and shape) is unit-testable
  // without mounting Tiptap. See `buildContextMenuFlashComment`.
  const handleFlashCommentFromContextMenu: () => void = useCallback((): void => {
    if (!contextMenu || !editor) return;

    // Anchor captured BEFORE asking, which the native prompt made free and an
    // in-app dialog does not: the dialog takes focus, and the position the
    // comment belongs to is the one under the cursor when the menu was opened,
    // not wherever the selection sits once the dialog closes.
    const cursorPos: number = editor.view.state.selection.from;
    const coords = editor.view.coordsAtPos(cursorPos);
    setContextMenu(null);

    void (async (): Promise<void> => {
      const raw = await prompt({
        title: 'Flash comment',
        description: 'Shown to everyone in the document for a few seconds.',
        label: 'Comment',
        placeholder: 'Looks good to me',
        confirmLabel: 'Send',
      });
      const comment = buildContextMenuFlashComment(raw, coords, {
        userId: currentUserCid,
        userName: currentUserName,
        userColor: userColor,
      });
      if (!comment) return;

      // Subscriber: useCollaborativeEditor.ts:161 (handleSendFlashComment).
      eventEmitter.emit('flash-comment:send', comment);
    })();
  }, [contextMenu, editor, currentUserCid, currentUserName, userColor, setContextMenu, prompt]);

  // Show loading state while provider initializes
  if (!provider) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-surface/50 bg-background relative z-10">
          <span className="text-xs text-muted-foreground">Collaborators:</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-primary/30 text-primary-accent ring-2 ring-success ring-offset-1 ring-offset-background">
            {currentUserName}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Connecting to document...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Connected users indicator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface/50 bg-background">
        <span className="text-xs text-muted-foreground">Collaborators:</span>
        <div className="flex items-center gap-2">
          {connectedUsers.map((user, i) => (
            <span
              key={i}
              className={`
                px-2 py-0.5 rounded-full text-xs bg-primary/30 text-primary-accent
                transition-all duration-200
                ${user.isActive
                  ? 'ring-2 ring-success ring-offset-2 ring-offset-background'
                  : 'opacity-60'}
              `}
              title={user.isActive ? `${user.name} is actively viewing` : `${user.name} is connected`}
            >
              {user.name}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`
            w-2 h-2 rounded-full
            ${syncState === 'synced' ? 'bg-success' :
              syncState === 'syncing' ? 'bg-warning animate-pulse' :
                'bg-muted-foreground'}
          `} />
          <span className="text-xs text-muted-foreground">
            {syncState === 'synced' ? 'Synced' :
              syncState === 'syncing' ? 'Syncing...' :
                'Connecting...'}
          </span>
        </div>
      </div>

      {/* Editor toolbar */}
      <EditorToolbar editor={editor} />

      {/* Editor content */}
      <div
        ref={editorContainerRef}
        className="flex-1 overflow-auto relative"
        onContextMenu={handleContextMenu}
        key={`editor-${documentId}`}
      >
        <EditorContent editor={editor} className="h-full" />

        {/* Flash Comments Display */}
        {flashComments.map((comment) => (
          <div
            key={comment.id}
            className="flash-comment"
            style={{
              top: comment.position.top + 20,
              left: comment.position.left,
              backgroundColor: comment.userColor,
            }}
            onMouseEnter={() => dismissFlashComment(comment.id)}
          >
            <div className="flash-comment__header">{comment.userName}</div>
            <div className="flash-comment__text">{comment.text}</div>
            <div className="flash-comment__time">
              {new Date(comment.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="editor-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div
              className="editor-context-menu__item"
              onClick={handleFlashCommentFromContextMenu}
              role="button"
              tabIndex={0}
              onKeyDown={activateOnKey(handleFlashCommentFromContextMenu)}
            >
              <MessageSquare />
              Flash Comment
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
