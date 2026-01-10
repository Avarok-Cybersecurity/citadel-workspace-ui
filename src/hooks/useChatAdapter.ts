/**
 * useChatAdapter Hook
 *
 * React hook for using chat messaging adapters.
 * Provides a unified interface for both P2P and Group messaging.
 *
 * Usage:
 * ```tsx
 * // For P2P chat
 * const { messages, sendMessage, loading } = useChatAdapter({
 *   mode: 'p2p',
 *   peerCid: '123',
 *   peerName: 'Alice',
 *   currentUserId: 'user-cid',
 *   currentUserName: 'Bob',
 * });
 *
 * // For Group chat
 * const { messages, sendMessage, loading } = useChatAdapter({
 *   mode: 'group',
 *   groupId: 'channel-123',
 *   groupName: 'General',
 *   currentUserId: 'user-id',
 *   currentUserName: 'Bob',
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMessagingAdapter,
  ChatMessage,
  ChatMessageEvent,
  SendMessageOptions,
} from '@/lib/chat-messaging-adapter';
import { createP2PMessagingAdapter } from '@/lib/p2p-messaging-adapter';
import { createGroupMessagingAdapter } from '@/lib/group-messaging-adapter';

interface UseChatAdapterBaseOptions {
  currentUserId: string;
  currentUserName: string;
}

interface UseChatAdapterP2POptions extends UseChatAdapterBaseOptions {
  mode: 'p2p';
  peerCid: string;
  peerName: string;
}

interface UseChatAdapterGroupOptions extends UseChatAdapterBaseOptions {
  mode: 'group';
  groupId: string;
  groupName: string;
}

export type UseChatAdapterOptions = UseChatAdapterP2POptions | UseChatAdapterGroupOptions;

export interface UseChatAdapterResult {
  // State
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  isTyping: boolean;
  peerPresence: 'online' | 'away' | 'offline' | null;

  // Actions
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  replyToMessage: (messageId: string, content: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  startTyping: () => void;
  stopTyping: () => void;

  // Feature support
  supportsTypingIndicators: boolean;
  supportsPresence: boolean;
  supportsEdit: boolean;
  supportsDelete: boolean;
  supportsReply: boolean;
  supportsFileTransfer: boolean;
  supportsLiveDocuments: boolean;

  // Adapter reference (for advanced use)
  adapter: ChatMessagingAdapter | null;
}

export function useChatAdapter(options: UseChatAdapterOptions): UseChatAdapterResult {
  const [adapter, setAdapter] = useState<ChatMessagingAdapter | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState<'online' | 'away' | 'offline' | null>(null);

  // Create stable key for options
  const optionsKey = options.mode === 'p2p'
    ? `p2p:${options.peerCid}`
    : `group:${options.groupId}`;

  // Track initialization
  const initializedRef = useRef<string | null>(null);

  // Create and initialize adapter
  useEffect(() => {
    if (initializedRef.current === optionsKey) {
      return; // Already initialized for this key
    }

    let newAdapter: ChatMessagingAdapter;

    if (options.mode === 'p2p') {
      newAdapter = createP2PMessagingAdapter(
        options.peerCid,
        options.peerName,
        options.currentUserId,
        options.currentUserName
      );
    } else {
      newAdapter = createGroupMessagingAdapter(
        options.groupId,
        options.groupName,
        options.currentUserId,
        options.currentUserName
      );
    }

    setAdapter(newAdapter);
    setLoading(true);
    setError(null);
    initializedRef.current = optionsKey;

    // Initialize and load messages
    const init = async () => {
      try {
        await newAdapter.initialize();
        await newAdapter.loadMessages();
        setMessages(newAdapter.getMessages());
        setHasMore(newAdapter.hasMoreMessages());
        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize chat adapter:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize chat');
        setLoading(false);
      }
    };

    init();

    // Subscribe to events
    const unsubscribe = newAdapter.subscribe((event: ChatMessageEvent) => {
      switch (event.type) {
        case 'message_received':
        case 'message_sent':
          if (event.message) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === event.message!.id)) {
                return prev; // Already exists
              }
              return [...prev, event.message!].sort((a, b) => a.timestamp - b.timestamp);
            });
          }
          break;

        case 'message_updated':
          if (event.message) {
            setMessages((prev) =>
              prev.map((m) => (m.id === event.message!.id ? event.message! : m))
            );
          }
          break;

        case 'message_deleted':
          if (event.messageId) {
            setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
          }
          break;

        case 'messages_loaded':
          if (event.messages) {
            setMessages(event.messages);
            setHasMore(event.hasMore || false);
          }
          break;

        case 'typing_started':
          if (event.senderId !== options.currentUserId) {
            setIsTyping(true);
          }
          break;

        case 'typing_stopped':
          if (event.senderId !== options.currentUserId) {
            setIsTyping(false);
          }
          break;

        case 'presence_changed':
          if (event.presence) {
            setPeerPresence(event.presence);
          }
          break;
      }
    });

    // Cleanup
    return () => {
      unsubscribe();
      newAdapter.cleanup();
      initializedRef.current = null;
    };
  }, [optionsKey, options]);

  // Action handlers
  const sendMessage = useCallback(
    async (content: string, sendOptions?: SendMessageOptions) => {
      if (!adapter) return;
      await adapter.sendMessage(content, sendOptions);
    },
    [adapter]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!adapter || !hasMore || loading) return;
    setLoading(true);
    try {
      const more = await adapter.loadMoreMessages();
      setMessages(adapter.getMessages());
      setHasMore(more);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      setLoading(false);
    }
  }, [adapter, hasMore, loading]);

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!adapter) return;
      await adapter.editMessage(messageId, newContent);
    },
    [adapter]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!adapter) return;
      await adapter.deleteMessage(messageId);
    },
    [adapter]
  );

  const replyToMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!adapter) return;
      await adapter.replyToMessage(messageId, content);
    },
    [adapter]
  );

  const markAsRead = useCallback(async () => {
    if (!adapter) return;
    await adapter.markAsRead();
  }, [adapter]);

  const startTyping = useCallback(() => {
    if (!adapter) return;
    adapter.startTyping();
  }, [adapter]);

  const stopTyping = useCallback(() => {
    if (!adapter) return;
    adapter.stopTyping();
  }, [adapter]);

  return {
    // State
    messages,
    loading,
    error,
    hasMore,
    isTyping,
    peerPresence,

    // Actions
    sendMessage,
    loadMoreMessages,
    editMessage,
    deleteMessage,
    replyToMessage,
    markAsRead,
    startTyping,
    stopTyping,

    // Feature support
    supportsTypingIndicators: adapter?.supportsTypingIndicators ?? false,
    supportsPresence: adapter?.supportsPresence ?? false,
    supportsEdit: adapter?.supportsEdit ?? false,
    supportsDelete: adapter?.supportsDelete ?? false,
    supportsReply: adapter?.supportsReply ?? false,
    supportsFileTransfer: adapter?.supportsFileTransfer ?? false,
    supportsLiveDocuments: adapter?.supportsLiveDocuments ?? false,

    // Adapter reference
    adapter,
  };
}
