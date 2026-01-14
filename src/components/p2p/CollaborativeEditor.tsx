import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { YjsP2PProvider, createYjsP2PProvider } from '@/lib/yjs-p2p-provider';
import { eventEmitter } from '@/lib/event-emitter';
import { createCollaboratorCursor, type FlashComment } from './CollaboratorCursor';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Quote,
  Code,
  Undo,
  Redo,
  MessageSquare,
} from 'lucide-react';

interface CollaborativeEditorProps {
  documentId: string;
  peerCid: string;
  currentUserCid: string;
  currentUserName: string;
  peerName?: string;
  /** CID of document creator - used for authority during divergence recovery */
  creatorCid?: string;
  onSave?: (content: string) => void;
}

// Random color for cursor
function getRandomColor() {
  const colors = [
    '#6E59A5', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
}

function ToolbarButton({ icon, onClick, active, disabled, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        p-1.5 rounded transition-colors
        ${active
          ? 'bg-[#6E59A5] text-white'
          : 'hover:bg-white/10 text-gray-400 hover:text-white'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={title}
    >
      {icon}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-[#262C4A]/50 bg-[#1a1b26]">
      <ToolbarButton
        icon={<Bold className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      />
      <ToolbarButton
        icon={<Strikethrough className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      />

      <div className="w-px h-5 bg-gray-600/50 mx-1" />

      <ToolbarButton
        icon={<Heading1 className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      />
      <ToolbarButton
        icon={<Heading2 className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      />

      <div className="w-px h-5 bg-gray-600/50 mx-1" />

      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
      />
      <ToolbarButton
        icon={<ListOrdered className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered List"
      />

      <div className="w-px h-5 bg-gray-600/50 mx-1" />

      <ToolbarButton
        icon={<Quote className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      />
      <ToolbarButton
        icon={<Code className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
      />

      <div className="flex-1" />

      <ToolbarButton
        icon={<Undo className="h-4 w-4" />}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      />
      <ToolbarButton
        icon={<Redo className="h-4 w-4" />}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      />
    </div>
  );
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
  const [doc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<YjsP2PProvider | null>(null);
  const [userColor] = useState(() => getRandomColor());
  const [connectedUsers, setConnectedUsers] = useState<{ name: string; isActive: boolean }[]>([{ name: currentUserName, isActive: true }]);
  const [syncState, setSyncState] = useState<string>('connecting');

  // Flash comments state
  const [flashComments, setFlashComments] = useState<FlashComment[]>([]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Create provider on mount
  useEffect(() => {
    // Use provided creatorCid, or default to currentUserCid (document creator)
    const effectiveCreatorCid = creatorCid ?? currentUserCid;
    const newProvider = createYjsP2PProvider(documentId, peerCid, currentUserCid, doc, effectiveCreatorCid);

    // Set initial awareness state
    newProvider.setLocalState({
      user: {
        name: currentUserName,
        color: userColor,
      },
    });

    setProvider(newProvider);
    setSyncState('syncing');

    // Listen for sync completion
    const handleSyncComplete = ({ documentId: docId }: { documentId: string }) => {
      if (docId === documentId) {
        setSyncState('synced');
      }
    };

    eventEmitter.on('yjs:sync-complete', handleSyncComplete);

    return () => {
      eventEmitter.off('yjs:sync-complete', handleSyncComplete);
      newProvider.destroy();
    };
  }, [documentId, peerCid, currentUserCid, currentUserName, userColor, doc, creatorCid]);

  // Track connected users from awareness - includes active status based on cursor/selection presence
  useEffect(() => {
    if (!provider) return;

    // Track previous state to avoid unnecessary re-renders
    let prevUsersKey = '';

    const updateUsers = () => {
      const states = provider.getStates();
      const users: { name: string; isActive: boolean }[] = [];
      const now = Date.now();

      states.forEach((state: any) => {
        if (state.user?.name) {
          // User is considered "active" if they have cursor info (indicates they're viewing the doc)
          // or if their state was recently updated (within last 30 seconds)
          const hasCursor = state.cursor !== undefined && state.cursor !== null;
          const hasRecentActivity = state.lastUpdate && (now - state.lastUpdate) < 30000;
          const isActive = hasCursor || hasRecentActivity || state.user.name === currentUserName;

          users.push({
            name: state.user.name,
            isActive
          });
        }
      });

      // Always show current user as active
      if (!users.find(u => u.name === currentUserName)) {
        users.unshift({ name: currentUserName, isActive: true });
      }

      const finalUsers = users.length > 0 ? users : [{ name: currentUserName, isActive: true }];

      // Only update state if users actually changed (prevents flickering)
      const newUsersKey = finalUsers.map(u => `${u.name}:${u.isActive}`).join('|');
      if (newUsersKey !== prevUsersKey) {
        prevUsersKey = newUsersKey;
        setConnectedUsers(finalUsers);
      }
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();

    // Update activity status periodically
    const activityInterval = setInterval(updateUsers, 10000);

    return () => {
      provider.awareness.off('change', updateUsers);
      clearInterval(activityInterval);
    };
  }, [provider, currentUserName]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Disable history - Yjs handles undo/redo
      }),
      Collaboration.configure({
        document: doc,
      }),
      ...(provider ? [
        CollaborationCursor.configure({
          provider: provider as any,
          user: {
            name: currentUserName,
            color: userColor,
          },
          render: (user) => createCollaboratorCursor(user),
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

  // Listen for flash comments from awareness/P2P
  useEffect(() => {
    // Handle incoming flash comments (from our own cursor clicks)
    const handleSendFlashComment = (comment: FlashComment) => {
      // Broadcast via awareness to all peers
      if (provider) {
        provider.setLocalState({
          user: {
            name: currentUserName,
            color: userColor,
          },
          flashComment: comment,
        });

        // Auto-clear the flash comment from awareness after a delay
        setTimeout(() => {
          provider.setLocalState({
            user: {
              name: currentUserName,
              color: userColor,
            },
            flashComment: null,
          });
        }, 10000); // Clear after 10 seconds
      }
    };

    // Handle receiving flash comments from peers via awareness
    // Track previous state to avoid unnecessary re-renders
    let prevCommentsKey = '';

    const handleAwarenessChange = () => {
      if (!provider) return;

      const states = provider.getStates();
      const newComments: FlashComment[] = [];

      states.forEach((state: any, clientId: number) => {
        // Skip our own flash comments in the display
        if (state.flashComment && state.user?.name !== currentUserName) {
          newComments.push({
            ...state.flashComment,
            userName: state.user?.name || 'Unknown',
            userColor: state.user?.color || '#6E59A5',
          });
        }
      });

      // Only update state if comments actually changed (prevents flickering)
      const newCommentsKey = newComments.map(c => c.id).join('|');
      if (newCommentsKey !== prevCommentsKey) {
        prevCommentsKey = newCommentsKey;
        setFlashComments(newComments);
      }
    };

    eventEmitter.on('flash-comment:send', handleSendFlashComment);

    if (provider) {
      provider.awareness.on('change', handleAwarenessChange);
    }

    return () => {
      eventEmitter.off('flash-comment:send', handleSendFlashComment);
      if (provider) {
        provider.awareness.off('change', handleAwarenessChange);
      }
    };
  }, [provider, currentUserName, userColor]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Handle flash comment from context menu
  const handleFlashCommentFromContextMenu = useCallback(() => {
    if (!contextMenu || !editor) return;

    // Create a flash comment at the current selection/cursor position
    const cursorPos = editor.view.state.selection.from;
    const coords = editor.view.coordsAtPos(cursorPos);

    const comment: FlashComment = {
      id: `flash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: currentUserCid,
      userName: currentUserName,
      userColor: userColor,
      text: '', // Will be filled by user
      position: {
        top: coords.top,
        left: coords.left,
      },
      timestamp: Date.now(),
    };

    // For context menu flash comment, we need to show an input
    // This will be handled by the cursor tooltip click - just close the menu
    setContextMenu(null);
  }, [contextMenu, editor, currentUserCid, currentUserName, userColor]);

  // Dismiss flash comment on hover
  const dismissFlashComment = useCallback((commentId: string) => {
    setFlashComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  // Show loading state while provider initializes
  // This ensures CollaborationCursor extension is always included when editor renders
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

      {/* Editor content - key forces recreation when provider changes */}
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
