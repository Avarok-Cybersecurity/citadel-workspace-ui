/**
 * NOT WIRED UP.
 *
 * Nothing in the app constructs one of these. The two implementations
 * (p2p-messaging-adapter, group-messaging-adapter) and their factory functions
 * have no callers, and the views they were meant for do not accept an adapter:
 * GroupChatView takes a groupId and fetches for itself, and P2PChat uses the
 * messenger directly. GroupChatPage's header comment claimed otherwise and has
 * been corrected.
 *
 * Deliberately kept rather than deleted with the rest of the dead code. This is
 * where editMessage / deleteMessage / replyToMessage are actually implemented —
 * group-messaging-adapter routes them to WorkspaceService, and
 * p2p-messaging-adapter implements reply and explicitly refuses edit and delete
 * because the P2P path does not support them. The message actions menu is
 * currently unreachable for exactly that reason: P2PChat accepts
 * onEditMessage/onDeleteMessage/onReplyMessage and neither of its mounts passes
 * any. Wiring that up is the decision this layer is waiting on, and deleting it
 * would throw away the answer.
 */

/**
 * Chat Messaging Adapter
 *
 * Abstract interface for chat messaging that unifies P2P and Group messaging APIs.
 * This allows the P2PChat component to work with either messaging system through
 * a common interface, following the SBIO principle (Separation of Business logic and I/O).
 */

import type { MessageType } from '@/types/message-protocol';

/**
 * Unified message type that works for both P2P and Group chats.
 * This is the canonical message format used by the UI layer.
 */
export interface ChatMessage {
  id: string;
  content: string;
  timestamp: number;
  senderId: string;
  senderName: string;
  isOwn: boolean;

  // Message type and status
  messageType: MessageType;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

  // Optional fields
  editedAt?: number;
  replyToId?: string;
  replyCount?: number;

  // File transfer fields (P2P)
  transferId?: string;
  transferState?: string;
  transferProgress?: number;
  fileName?: string;
  fileSize?: number;

  // Live document fields (P2P)
  documentId?: string;
  documentTitle?: string;
}

/**
 * Message event types emitted by the adapter
 */
export type ChatMessageEventType =
  | 'message_received'
  | 'message_sent'
  | 'message_updated'
  | 'message_deleted'
  | 'messages_loaded'
  | 'typing_started'
  | 'typing_stopped'
  | 'presence_changed'
  | 'connection_changed';

export interface ChatMessageEvent {
  type: ChatMessageEventType;
  message?: ChatMessage;
  messages?: ChatMessage[];
  messageId?: string;
  hasMore?: boolean;
  senderId?: string;
  isTyping?: boolean;
  isConnected?: boolean;
  presence?: 'online' | 'away' | 'offline';
}

/**
 * Options for sending a message
 */
export interface SendMessageOptions {
  messageType?: MessageType;
  replyToId?: string;
  documentId?: string;
  documentTitle?: string;
}

/**
 * Abstract Chat Messaging Adapter
 *
 * Implementations must provide all messaging operations for the chat UI.
 * The UI calls these methods and subscribes to events without knowing
 * whether it's using P2P or Group messaging.
 */
export abstract class ChatMessagingAdapter {
  /**
   * Unique identifier for the chat context (peerCid or groupId)
   */
  abstract readonly contextId: string;

  /**
   * Display name for the chat (peer name or group name)
   */
  abstract readonly displayName: string;

  /**
   * Current user's ID
   */
  abstract readonly currentUserId: string;

  /**
   * Current user's name
   */
  abstract readonly currentUserName: string;

  /**
   * Whether this adapter supports typing indicators
   */
  abstract readonly supportsTypingIndicators: boolean;

  /**
   * Whether this adapter supports presence status
   */
  abstract readonly supportsPresence: boolean;

  /**
   * Whether this adapter supports message editing
   */
  abstract readonly supportsEdit: boolean;

  /**
   * Whether this adapter supports message deletion
   */
  abstract readonly supportsDelete: boolean;

  /**
   * Whether this adapter supports reply threading
   */
  abstract readonly supportsReply: boolean;

  /**
   * Whether this adapter supports file transfers
   */
  abstract readonly supportsFileTransfer: boolean;

  /**
   * Whether this adapter supports live documents
   */
  abstract readonly supportsLiveDocuments: boolean;

  // ===== Core Messaging Operations =====

  /**
   * Send a message
   */
  abstract sendMessage(content: string, options?: SendMessageOptions): Promise<void>;

  /**
   * Load initial messages
   */
  abstract loadMessages(): Promise<void>;

  /**
   * Load more messages (pagination)
   */
  abstract loadMoreMessages(): Promise<boolean>;

  /**
   * Get current messages from cache
   */
  abstract getMessages(): ChatMessage[];

  /**
   * Check if more messages are available
   */
  abstract hasMoreMessages(): boolean;

  // ===== Message Actions =====

  /**
   * Edit a message (if supported)
   */
  abstract editMessage(messageId: string, newContent: string): Promise<void>;

  /**
   * Delete a message (if supported)
   */
  abstract deleteMessage(messageId: string): Promise<void>;

  /**
   * Reply to a message (if supported)
   */
  abstract replyToMessage(messageId: string, content: string): Promise<void>;

  /**
   * Mark messages as read
   */
  abstract markAsRead(): Promise<void>;

  // ===== Typing Indicators =====

  /**
   * Start sending typing indicator
   */
  abstract startTyping(): void;

  /**
   * Stop sending typing indicator
   */
  abstract stopTyping(): void;

  // ===== Event Subscription =====

  /**
   * Subscribe to chat events
   * Returns unsubscribe function
   */
  abstract subscribe(callback: (event: ChatMessageEvent) => void): () => void;

  // ===== Lifecycle =====

  /**
   * Initialize the adapter (called when chat opens)
   */
  abstract initialize(): Promise<void>;

  /**
   * Cleanup the adapter (called when chat closes)
   */
  abstract cleanup(): void;
}

/**
 * Factory function type for creating adapters
 */
export type ChatMessagingAdapterFactory = (
  contextId: string,
  currentUserId: string,
  currentUserName: string,
  displayName: string
) => ChatMessagingAdapter;
