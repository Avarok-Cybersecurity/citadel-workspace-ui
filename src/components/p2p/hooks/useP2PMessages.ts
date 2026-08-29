/**
 * useP2PMessages Hook
 *
 * Manages P2P message state, subscriptions, and pagination.
 * Handles conversation loading, event listeners, and message operations.
 */

import { useState, useEffect, useCallback , type UIEvent } from 'react';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { DELETE_MESSAGE_PROMPT } from '@/lib/chat/delete-message-prompt';
import { P2PMessengerManager } from '@/lib/p2p';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { toast } from 'sonner';
import { debugLog } from '@/lib/debug-config';
import { MessagingLayerType } from '@/types/messaging-layer';
import type { P2PMessage, PeerPresence } from '@/lib/p2p';
import type { UseP2PMessagesProps, UseP2PMessagesReturn } from './useP2PMessages-types';
import { mergeMessages, prependMessages } from './useP2PMessages-types';
import { subscribeToConversationEvents } from './useP2PMessages-subscriptions';
import type { ConversationMetadata, P2PConversation, MessagePage } from '@/lib/p2p/p2p-types';

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

  const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();

  // Main effect for conversation loading and subscriptions
  useEffect(() => {
    if (!peerCid) {
      setMessages([]);
      return;
    }

    const loadConversation = async (): Promise<void> => {
      await messenger.waitForReady();
      await messenger.syncConnectionsFromBackend();

      const metadata: ConversationMetadata | null = await messenger.getConversationMetadata(peerCid);
      if (metadata) {
        const latestMessages: P2PMessage[] = await messenger.loadLatestMessages(peerCid);
        if (latestMessages.length > 0) {
          setMessages(prev => mergeMessages(prev, latestMessages));
        }
        setCurrentPage(metadata.latestPage);
        setHasMorePages(metadata.latestPage > 0);
      } else {
        const conversation: P2PConversation | undefined = messenger.getConversation(peerCid);
        if (conversation) {
          setMessages(prev => mergeMessages(prev, conversation.messages));
          setPeerPresence(conversation.presence);
        }
        setCurrentPage(null);
        setHasMorePages(false);
      }

      const syncedConnected: boolean = messenger.isConnected(peerCid);
      if (syncedConnected) setIsConnected(true);

      const autoConnectConnected: boolean = await p2pAutoConnectService.isPeerConnected(peerCid);
      if (autoConnectConnected) {
        setIsConnected(true);
        setPeerPresence({ status: MessagingLayerType.Online, lastUpdate: Date.now() });
      }
    };
    runAsyncSetup(loadConversation);

    const unsubscribeConversationEvents: () => void = subscribeToConversationEvents({
      messenger, peerCid, activeTabIdRef, onUnreadMessage,
      setMessages, setPeerTyping, setIsConnected, setPeerPresence, setIsRegistered,
    });

    const checkInitialConnection = async (): Promise<void> => {
      const syncConnected: boolean = messenger.isConnected(peerCid);
      const autoConnected: boolean = await p2pAutoConnectService.isPeerConnected(peerCid);
      setIsConnected(syncConnected || autoConnected);
    };
    runAsyncSetup(checkInitialConnection);

    setIsRegistered(p2pRegistrationService.isPeerRegistered(peerCid));

    if (document.visibilityState === 'visible') {
      messenger.markMessagesAsRead(peerCid).catch(err => debugLog('UseP2PMessages', 'Error:', err));
    }

    const refreshTimeout: NodeJS.Timeout = setTimeout((): void => {
      const conversation: P2PConversation | undefined = messenger.getConversation(peerCid);
      if (conversation && conversation.messages.length > 0) {
        setMessages(prev => mergeMessages(prev, conversation.messages));
      }
    }, 500);

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        messenger.markMessagesAsRead(peerCid).catch(err => debugLog('UseP2PMessages', 'Error:', err));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return (): void => {
      unsubscribeConversationEvents();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(refreshTimeout);
      messenger.stopTypingPolling(peerCid);
    };
  }, [peerCid, activeTabIdRef, onUnreadMessage, messenger]);

  const loadOlderMessages: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (isLoadingMore || currentPage === null || currentPage <= 0 || !hasMorePages) return;

    setIsLoadingMore(true);
    try {
      const olderPage: MessagePage | null = await messenger.loadMessagePage(peerCid, currentPage - 1);
      if (olderPage && olderPage.messages.length > 0) {
        const scrollElement: HTMLDivElement | null = scrollRef.current;
        const previousScrollHeight: number = scrollElement?.scrollHeight || 0;

        setMessages(prev => prependMessages(prev, olderPage.messages));

        requestAnimationFrame(() => {
          if (scrollElement) {
            const newScrollHeight: number = scrollElement.scrollHeight;
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

  const handleScroll: (event: React.UIEvent<HTMLDivElement>) => void = useCallback((event: React.UIEvent<HTMLDivElement>): void => {
    const target: HTMLDivElement = event.currentTarget;
    if (target.scrollTop < 100 && hasMorePages && !isLoadingMore) {
      runAsyncSetup(loadOlderMessages);
    }
  }, [hasMorePages, isLoadingMore, loadOlderMessages]);

  const handleRetryMessage: (message: P2PMessage) => Promise<void> = useCallback(async (message: P2PMessage): Promise<void> => {
    if (message.status !== 'failed') return;
    try {
      await messenger.resendMessage(peerCid, message.id);
    } catch (error) {
      debugLog('UseP2PMessages', 'Failed to retry message:', error);
      // Reported like edit and delete below. The bubble does stay marked
      // failed, so this is not invisible — but "it failed again, and here is
      // why" is a different message from a retry that appears to do nothing.
      toast.error('Could not resend message', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }, [peerCid, messenger]);

  const handleEditMessage: (messageId: string, content: string) => Promise<void> = useCallback(async (messageId: string, content: string): Promise<void> => {
    try {
      await messenger.editMessage(peerCid, messageId, content);
    } catch (error) {
      debugLog('UseP2PMessages', 'Failed to edit message:', error);
      toast.error('Could not edit message', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }, [peerCid, messenger]);

  const handleDeleteMessage: (messageId: string) => Promise<void> = useCallback(async (messageId: string): Promise<void> => {
    // Asked first; same reasoning as the group chat's delete.
    if (!(await confirm(DELETE_MESSAGE_PROMPT))) return;

    try {
      await messenger.deleteMessage(peerCid, messageId);
    } catch (error) {
      debugLog('UseP2PMessages', 'Failed to delete message:', error);
      toast.error('Could not delete message', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }, [peerCid, messenger, confirm]);

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
    handleEditMessage,
    handleDeleteMessage,
  };
}
