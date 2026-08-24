/**
 * The unified chat message vocabulary shared by every ChatMessagingAdapter.
 *
 * Owns the canonical ChatMessage shape the UI layer renders, the adapter
 * event union, and the send options. Split from chat-messaging-adapter.ts so
 * the type family and the abstract adapter contract are separate modules;
 * the adapter re-exports these, so import sites are unaffected.
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
