/**
 * useP2PMessages Hook
 *
 * A conversation's message state, subscriptions and pagination, over its transport's ports
 * (lib/chat/transport). It never reaches a messenger itself: the transport the pane was given
 * is the only way a message comes in or goes out.
 */

import { useState, useEffect, useCallback } from 'react';
import { failureDescription } from '@/lib/p2p/peer-failure-detail';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { DELETE_MESSAGE_PROMPT } from '@/lib/chat/delete-message-prompt';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { toast } from 'sonner';
import { debugLog } from '@/lib/debug-config';
import type { PeerPresence } from '@/lib/p2p';
import type { ChatMessage, HistoryCursor, HistoryPage, StatusProbe, StatusSnapshot } from '@/lib/chat/transport/chat-transport';
import type { UseP2PMessagesProps, UseP2PMessagesReturn } from './useP2PMessages-types';
import { mergeMessages, prependMessages } from './useP2PMessages-types';
import { subscribeToConversationEvents } from './useP2PMessages-subscriptions';
import { readableNow, markReadWhenInFront } from './useP2PMessages-read-gate';

const report = (title: string) => (error: unknown): void => {
  debugLog('UseP2PMessages', `${title}:`, error);
  toast.error(title, { description: failureDescription(error, 'Please try again.') });
};

export function useP2PMessages({
  transport,
  activeTabIdRef,
  scrollRef,
  pinnedRef,
  onUnreadMessage,
}: UseP2PMessagesProps): UseP2PMessagesReturn {
  const { history, send, status } = transport;
  const initial: StatusSnapshot | null = status?.snapshot() ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PeerPresence | null>(initial?.presence ?? null);
  const [isConnected, setIsConnected] = useState<boolean>(initial?.connected ?? false);
  // Read now, not after the first effect: a contact's chat otherwise opens as unregistered and
  // flashes the connect banner (and its automatic request) at someone you are already connected to.
  // A conversation with no one to accept is accepted from the start.
  const [isRegistered, setIsRegistered] = useState<boolean>((): boolean => status?.acceptance?.accepted() ?? true);
  const [older, setOlder] = useState<HistoryCursor | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /**
   * True until this conversation's stored history has been read.
   *
   * `isLoadingMore` is about PAGINATION, so the empty state was shown from the moment a
   * conversation opened until the load returned: "No messages yet" printed over months of
   * history. It starts true because the effect that clears it has not run yet on first render.
   */
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const confirm: ReturnType<typeof useConfirm> = useConfirm();

  // The messenger held which conversation is open, and both notification surfaces read it, but
  // nothing set it, so every message for the open chat notified as if it were elsewhere.
  useEffect((): (() => void) => history.focus(), [history]);

  useEffect(() => {
    setIsLoadingHistory(true);
    // Cleared whatever happens: a conversation that fails to load must stop claiming to be loading.
    runAsyncSetup(async (): Promise<void> => {
      try {
        const page: HistoryPage = await history.loadLatest();
        if (page.messages.length > 0) setMessages((prev: ChatMessage[]): ChatMessage[] => mergeMessages(prev, [...page.messages]));
        setOlder(page.older);
        if (status === null) return;
        const after: StatusSnapshot = status.snapshot();
        if (after.connected) setIsConnected(true);
        if (after.presence !== null) setPeerPresence(after.presence);
        const probed: StatusProbe = await status.probe();
        if (probed.connected) setIsConnected(true);
        if (probed.presence !== null) setPeerPresence(probed.presence);
      } finally {
        setIsLoadingHistory(false);
      }
    });

    const unsubscribe: () => void = subscribeToConversationEvents({
      transport, activeTabIdRef, pinnedRef, onUnreadMessage,
      setMessages, setPeerTyping, setIsConnected, setPeerPresence, setIsRegistered,
    });

    if (status !== null) runAsyncSetup(async (): Promise<void> => { setIsConnected((await status.probe()).connected); });
    setIsRegistered(status?.acceptance?.accepted() ?? true);

    const markRead = (): void => {
      history.markRead(null).catch((err: unknown) => debugLog('UseP2PMessages', 'Error:', err));
    };
    if (readableNow(activeTabIdRef, pinnedRef)) markRead();

    // Arrivals the load raced: whatever the transport already holds in memory.
    const refreshTimeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
      const cached: readonly ChatMessage[] = history.cached();
      if (cached.length > 0) setMessages((prev: ChatMessage[]): ChatMessage[] => mergeMessages(prev, [...cached]));
    }, 500);

    const stopWatchingWindow: () => void = markReadWhenInFront(activeTabIdRef, pinnedRef, markRead);

    return (): void => {
      unsubscribe();
      stopWatchingWindow();
      clearTimeout(refreshTimeout);
      status?.stopTyping();
    };
  }, [transport, history, status, activeTabIdRef, pinnedRef, onUnreadMessage]);

  const loadOlderMessages: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (isLoadingMore || older === null) return;
    setIsLoadingMore(true);
    try {
      const page: HistoryPage = await history.loadOlder(older);
      if (page.messages.length > 0) {
        const scrollElement: HTMLDivElement | null = scrollRef.current;
        const previousScrollHeight: number = scrollElement?.scrollHeight || 0;
        setMessages((prev: ChatMessage[]): ChatMessage[] => prependMessages(prev, page.messages));
        requestAnimationFrame((): void => {
          if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight - previousScrollHeight;
        });
      }
      setOlder(page.older);
    } catch (error) {
      debugLog('UseP2PMessages', 'Failed to load older messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, older, history, scrollRef]);

  const hasMorePages: boolean = older !== null;
  const handleScroll: (event: React.UIEvent<HTMLDivElement>) => void = useCallback((event: React.UIEvent<HTMLDivElement>): void => {
    if (event.currentTarget.scrollTop < 100 && hasMorePages && !isLoadingMore) runAsyncSetup(loadOlderMessages);
  }, [hasMorePages, isLoadingMore, loadOlderMessages]);

  // Reported like edit and delete: the bubble stays marked failed, but "it failed again, and here
  // is why" is a different message from a retry that appears to do nothing.
  const handleRetryMessage: (message: Pick<ChatMessage, 'id' | 'status'>) => Promise<void> = useCallback(async (message: Pick<ChatMessage, 'id' | 'status'>): Promise<void> => {
    if (message.status !== 'failed') return;
    await send.retry(message.id).catch(report('Could not resend message'));
  }, [send]);

  const handleEditMessage: (messageId: string, content: string) => Promise<void> = useCallback(async (messageId: string, content: string): Promise<void> => {
    await send.edit(messageId, content).catch(report('Could not edit message'));
  }, [send]);

  const handleDeleteMessage: (messageId: string) => Promise<void> = useCallback(async (messageId: string): Promise<void> => {
    // Asked first; same reasoning as the group chat's delete.
    if (!(await confirm(DELETE_MESSAGE_PROMPT))) return;
    await send.remove(messageId).catch(report('Could not delete message'));
  }, [send, confirm]);

  // Not awaited by the chip or menu item that calls it, so the failure is reported here rather
  // than becoming an unhandled rejection.
  const handleReactMessage: (messageId: string, emoji: string) => void = useCallback((messageId: string, emoji: string): void => {
    send.react(messageId, emoji).catch(report('Could not update reaction'));
  }, [send]);

  // Covers what the global listener could not hear: registration that completed before this tab loaded.
  useEffect((): void => { if (isRegistered) status?.acceptance?.flushHeld(); }, [isRegistered, status]);

  return {
    messages, peerTyping, peerPresence, isConnected, isRegistered, isLoadingMore, isLoadingHistory, hasMorePages,
    handleScroll, handleRetryMessage, handleEditMessage, handleDeleteMessage, handleReactMessage,
  };
}
