import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { YjsP2PProvider, createYjsP2PProvider } from '@/lib/yjs-p2p-provider';
import { eventEmitter } from '@/lib/event-emitter';
import type { FlashComment } from './CollaboratorCursor';

/** Shape of awareness state entries set via provider.setLocalState() */
interface AwarenessState {
  user?: { name: string; color: string };
  cursor?: unknown;
  lastUpdate?: number;
  flashComment?: FlashComment | null;
}

function getRandomColor() {
  const colors = [
    '#6E59A5', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

interface UseCollaborativeEditorParams {
  documentId: string;
  peerCid: string;
  currentUserCid: string;
  currentUserName: string;
  creatorCid?: string;
}

export function useCollaborativeEditor({
  documentId,
  peerCid,
  currentUserCid,
  currentUserName,
  creatorCid,
}: UseCollaborativeEditorParams) {
  const [doc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<YjsP2PProvider | null>(null);
  const [userColor] = useState(() => getRandomColor());
  const [connectedUsers, setConnectedUsers] = useState<{ name: string; isActive: boolean }[]>([{ name: currentUserName, isActive: true }]);
  const [syncState, setSyncState] = useState<string>('connecting');
  const [flashComments, setFlashComments] = useState<FlashComment[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Create provider on mount
  useEffect(() => {
    const effectiveCreatorCid = creatorCid ?? currentUserCid;
    const newProvider = createYjsP2PProvider(documentId, peerCid, currentUserCid, doc, effectiveCreatorCid);

    newProvider.setLocalState({
      user: { name: currentUserName, color: userColor },
    });

    setProvider(newProvider);
    setSyncState('syncing');

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

  // Track connected users from awareness
  useEffect(() => {
    if (!provider) return;

    let prevUsersKey = '';

    const updateUsers = () => {
      const states = provider.getStates();
      const users: { name: string; isActive: boolean }[] = [];
      const now = Date.now();

      states.forEach((rawState) => {
        const state = rawState as AwarenessState;
        if (state.user?.name) {
          const hasCursor = state.cursor !== undefined && state.cursor !== null;
          const hasRecentActivity = state.lastUpdate && (now - state.lastUpdate) < 30000;
          const isActive = hasCursor || hasRecentActivity || state.user.name === currentUserName;
          users.push({ name: state.user.name, isActive });
        }
      });

      if (!users.find(u => u.name === currentUserName)) {
        users.unshift({ name: currentUserName, isActive: true });
      }

      const finalUsers = users.length > 0 ? users : [{ name: currentUserName, isActive: true }];
      const newUsersKey = finalUsers.map(u => `${u.name}:${u.isActive}`).join('|');
      if (newUsersKey !== prevUsersKey) {
        prevUsersKey = newUsersKey;
        setConnectedUsers(finalUsers);
      }
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();

    const activityInterval = setInterval(updateUsers, 10000);

    return () => {
      provider.awareness.off('change', updateUsers);
      clearInterval(activityInterval);
    };
  }, [provider, currentUserName]);

  // Listen for flash comments from awareness/P2P
  useEffect(() => {
    const handleSendFlashComment = (comment: FlashComment) => {
      if (provider) {
        provider.setLocalState({
          user: { name: currentUserName, color: userColor },
          flashComment: comment,
        });

        setTimeout(() => {
          provider.setLocalState({
            user: { name: currentUserName, color: userColor },
            flashComment: null,
          });
        }, 10000);
      }
    };

    let prevCommentsKey = '';

    const handleAwarenessChange = () => {
      if (!provider) return;

      const states = provider.getStates();
      const newComments: FlashComment[] = [];

      states.forEach((rawState, _clientId) => {
        const state = rawState as AwarenessState;
        if (state.flashComment && state.user?.name !== currentUserName) {
          newComments.push({
            ...state.flashComment,
            userName: state.user?.name || 'Unknown',
            userColor: state.user?.color || '#6E59A5',
          });
        }
      });

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

  const dismissFlashComment = useCallback((commentId: string) => {
    setFlashComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  return {
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
  };
}
