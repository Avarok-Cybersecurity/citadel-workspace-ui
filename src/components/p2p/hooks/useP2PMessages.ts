/**
 * useP2PMessages Hook
 *
 * Manages P2P message state, subscriptions, and pagination.
 * Handles conversation loading, event listeners, and message operations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { P2PMessengerManager } from '@/lib/p2p';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { eventEmitter } from '@/lib/event-emitter';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { MessagingLayerType } from '@/types/messaging-layer';
import type { P2PMessage, PeerPresence } from '@/lib/p2p';

interface UseP2PMessagesProps {
  peerCid: bigint;
  activeTabIdRef: React.MutableRefObject<string>;
  scrollRef: React.RefObject<HTMLDivElement>;
  onUnreadMessage: () => void;
}

interface UseP2PMessagesReturn {
  messages: P2PMessage[];
  peerTyping: boolean;
  peerPresence: PeerPresence;
  isConnected: boolean;
  isRegistered: boolean;
  isLoadingMore: boolean;
  hasMorePages: boolean;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  handleRetryMessage: (message: P2PMessage) => Promise<void>;
}

export function useP2PMessages({
  peerCid,
  activeTabIdRef,
  scrollRef,
  onUnreadMessage,
}: UseP2PMessagesProps): UseP2PMessagesReturn {
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PeerPresence>({
    status: MessagingLayerType.Offline,
    lastUpdate: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const messenger = P2PMessengerManager.getInstance();

  // Main effect for conversation loading and subscriptions
  useEffect(() => {
    if (!peerCid) {
      setMessages([]);
      return;
    }

    const loadConversation = async () => {
      await messenger.waitForReady();
      await messenger.syncConnectionsFromBackend();

      const metadata = await messenger.getConversationMetadata(peerCid);
      if (metadata) {
        const latestMessages = await messenger.loadLatestMessages(peerCid);
        if (latestMessages.length > 0) {
          setMessages(prev => {
            if (prev.length === 0) return [...latestMessages];
            const existingIds = new Set(prev.map(m => m.id));
            const newFromStorage = latestMessages.filter(m => !existingIds.has(m.id));
            if (newFromStorage.length === 0) return prev;
            return [...prev, ...newFromStorage].sort((a, b) => a.timestamp - b.timestamp);
          });
        }
        setCurrentPage(metadata.latestPage);
        setHasMorePages(metadata.latestPage > 0);
      } else {
        const conversation = messenger.getConversation(peerCid);
        if (conversation) {
          setMessages(prev => {
            if (prev.length === 0) return [...conversation.messages];
            const existingIds = new Set(prev.map(m => m.id));
            const newFromCache = conversation.messages.filter(m => !existingIds.has(m.id));
            if (newFromCache.length === 0) return prev;
            return [...prev, ...newFromCache].sort((a, b) => a.timestamp - b.timestamp);
          });
          setPeerPresence(conversation.presence);
        }
        setCurrentPage(null);
        setHasMorePages(false);
      }

      const syncedConnected = messenger.isConnected(peerCid);
      if (syncedConnected) setIsConnected(true);

      const autoConnectConnected = await p2pAutoConnectService.isPeerConnected(peerCid);
      if (autoConnectConnected) {
        setIsConnected(true);
        setPeerPresence({ status: MessagingLayerType.Online, lastUpdate: Date.now() });
      }
    };
    runAsyncSetup(loadConversation);

    const unsubscribeMessage = messenger.onMessage((message) => {
      if (message.senderCid === peerCid || message.recipientCid === peerCid) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message].sort((a, b) => a.timestamp - b.timestamp);
        });

        if (message.senderCid === peerCid) {
          if (activeTabIdRef.current !== 'messages') onUnreadMessage();
          if (document.visibilityState === 'visible' && activeTabIdRef.current === 'messages') {
            messenger.markMessagesAsRead(peerCid, [message.id]).catch(err => debugLog('UseP2PMessages', 'Error:', err));
          }
        }
      }
    });

    const unsubscribeStatusChange = messenger.onMessageStatusChange((messageId, status) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status } : m));
    });

    const unsubscribeMessageUpdate = eventEmitter.on('p2p:message-updated', (updatedMessage: P2PMessage) => {
      if (updatedMessage.senderCid === peerCid || updatedMessage.recipientCid === peerCid) {
        setMessages(prev => prev.map(m => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m));
      }
    });

    const unsubscribeTyping = messenger.onTyping((cid, isTyping) => {
      if (cid === peerCid) setPeerTyping(isTyping);
    });

    const unsubscribeConnection = messenger.onConnectionChange((cid, connected) => {
      if (cid === peerCid) setIsConnected(connected);
    });

    const unsubscribePresence = messenger.onPresenceChange((cid, presence) => {
      if (cid === peerCid) setPeerPresence(presence);
    });

    const unsubscribeRegistration = eventEmitter.on('p2p:peer-registered', ({ peer }: { peer: { cid: bigint } }) => {
      if (peer.cid === peerCid) {
        setIsRegistered(true);
        p2pAutoConnectService.poll();
      }
    });

    const unsubscribeMessageReceived = eventEmitter.on('p2p:message-received', (eventData: { peerCid: bigint; messageId: string; message?: P2PMessage }) => {
      const { peerCid: messagePeerCid, messageId, message: eventMessage } = eventData;
      if (messagePeerCid === peerCid) {
        setMessages(prev => {
          if (prev.some(m => m.id === messageId)) return prev;
          const newMessage = eventMessage || (() => {
            const conversation = messenger.getConversation(peerCid);
            return conversation?.messages.find(m => m.id === messageId);
          })();
          if (newMessage) return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
          return prev;
        });
      }
    });

    const checkInitialConnection = async () => {
      const syncConnected = messenger.isConnected(peerCid);
      const autoConnected = await p2pAutoConnectService.isPeerConnected(peerCid);
      setIsConnected(syncConnected || autoConnected);
    };
    runAsyncSetup(checkInitialConnection);

    setIsRegistered(p2pRegistrationService.isPeerRegistered(peerCid));

    if (document.visibilityState === 'visible') {
      messenger.markMessagesAsRead(peerCid).catch(err => debugLog('UseP2PMessages', 'Error:', err));
    }

    const refreshTimeout = setTimeout(() => {
      const conversation = messenger.getConversation(peerCid);
      if (conversation && conversation.messages.length > 0) {
        setMessages(prev => {
          if (prev.length < conversation.messages.length) {
            const existingIds = new Set(prev.map(m => m.id));
            const newFromCache = conversation.messages.filter(m => !existingIds.has(m.id));
            if (newFromCache.length > 0) {
              return [...prev, ...newFromCache].sort((a, b) => a.timestamp - b.timestamp);
            }
          }
          return prev;
        });
      }
    }, 500);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        messenger.markMessagesAsRead(peerCid).catch(err => debugLog('UseP2PMessages', 'Error:', err));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeMessage();
      unsubscribeStatusChange();
      unsubscribeMessageUpdate();
      unsubscribeTyping();
      unsubscribeConnection();
      unsubscribePresence();
      unsubscribeRegistration();
      unsubscribeMessageReceived();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(refreshTimeout);
      messenger.stopTypingPolling(peerCid);
    };
  }, [peerCid, activeTabIdRef, onUnreadMessage, messenger]);

  const loadOlderMessages = useCallback(async () => {
    if (isLoadingMore || currentPage === null || currentPage <= 0 || !hasMorePages) return;

    setIsLoadingMore(true);
    try {
      const olderPage = await messenger.loadMessagePage(peerCid, currentPage - 1);
      if (olderPage && olderPage.messages.length > 0) {
        const scrollElement = scrollRef.current;
        const previousScrollHeight = scrollElement?.scrollHeight || 0;

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMessages = olderPage.messages.filter(m => !existingIds.has(m.id));
          if (newMessages.length === 0) return prev;
          return [...newMessages, ...prev].sort((a, b) => a.timestamp - b.timestamp);
        });

        requestAnimationFrame(() => {
          if (scrollElement) {
            const newScrollHeight = scrollElement.scrollHeight;
            scrollElement.scrollTop = newScrollHeight - previousScrollHeight;
          }
        });

        setCurrentPage(currentPage - 1);
        setHasMorePages(currentPage - 1 > 0);
      } else {
        setHasMorePages(false);
      }
    } catch (error) {
      debugLog('UseP2PMessages', 'Failed to load older messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, currentPage, hasMorePages, peerCid, scrollRef, messenger]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop < 100 && hasMorePages && !isLoadingMore) {
      runAsyncSetup(loadOlderMessages);
    }
  }, [hasMorePages, isLoadingMore, loadOlderMessages]);

  const handleRetryMessage = useCallback(async (message: P2PMessage) => {
    if (message.status !== 'failed') return;
    try {
      await messenger.resendMessage(peerCid, message.id);
    } catch (error) {
      debugLog('UseP2PMessages', 'Failed to retry message:', error);
    }
  }, [peerCid, messenger]);

  return {
    messages,
    peerTyping,
    peerPresence,
    isConnected,
    isRegistered,
    isLoadingMore,
    hasMorePages,
    handleScroll,
    handleRetryMessage,
  };
}
