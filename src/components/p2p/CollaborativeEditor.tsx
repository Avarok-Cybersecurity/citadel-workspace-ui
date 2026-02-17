import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useEffect, useCallback } from 'react';
import { createCollaboratorCursor, type FlashComment, type CursorUser } from './CollaboratorCursor';
import { MessageSquare } from 'lucide-react';
import { useCollaborativeEditor } from './useCollaborativeEditor';
import { EditorToolbar } from './EditorToolbar';

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
  peerName = 'Peer',
  creatorCid,
  onSave,
}: CollaborativeEditorProps) {
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
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[300px] p-4',
      },
    },
  }, [doc, provider]);

  // Auto-save on content change (debounced)
  useEffect(() => {
    if (!editor || !onSave) return;

    let timeout: NodeJS.Timeout;
    const handleUpdate = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        onSave(editor.getHTML());
      }, 1000);
    };

    editor.on('update', handleUpdate);
    return () => {
      clearTimeout(timeout);
      editor.off('update', handleUpdate);
    };
  }, [editor, onSave]);

  // Handle flash comment from context menu
  const handleFlashCommentFromContextMenu = useCallback(() => {
    if (!contextMenu || !editor) return;

    const cursorPos = editor.view.state.selection.from;
    const coords = editor.view.coordsAtPos(cursorPos);

    const comment: FlashComment = {
      id: `flash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: currentUserCid,
      userName: currentUserName,
      userColor: userColor,
      text: '',
      position: {
        top: coords.top,
        left: coords.left,
      },
      timestamp: Date.now(),
    };

    setContextMenu(null);
  }, [contextMenu, editor, currentUserCid, currentUserName, userColor, setContextMenu]);

  // Show loading state while provider initializes
  if (!provider) {
    return (
      <div className="h-full flex flex-col bg-[#1C1D28]">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#262C4A]/50 bg-[#1a1b26] relative z-10">
          <span className="text-xs text-gray-400">Collaborators:</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-[#6E59A5]/30 text-purple-300 ring-2 ring-green-500 ring-offset-1 ring-offset-[#1a1b26]">
            {currentUserName}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-[#6E59A5] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Connecting to document...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1C1D28]">
      {/* Connected users indicator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#262C4A]/50 bg-[#1a1b26]">
        <span className="text-xs text-gray-400">Collaborators:</span>
        <div className="flex items-center gap-2">
          {connectedUsers.map((user, i) => (
            <span
              key={i}
              className={`
                px-2 py-0.5 rounded-full text-xs bg-[#6E59A5]/30 text-purple-300
                transition-all duration-200
                ${user.isActive
                  ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-[#1a1b26]'
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
            ${syncState === 'synced' ? 'bg-green-500' :
              syncState === 'syncing' ? 'bg-yellow-500 animate-pulse' :
              'bg-gray-500'}
          `} />
          <span className="text-xs text-gray-400">
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
