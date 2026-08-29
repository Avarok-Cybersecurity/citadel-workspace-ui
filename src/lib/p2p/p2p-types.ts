/**
 * P2P Messenger Types
 *
 * Interfaces and types for P2P messaging conversations, messages, and presence.
 */

import type { MessagingLayerType } from '@/types/messaging-layer';
import type { MessageType } from '@/types/message-protocol';
import type { P2PAttachment } from '@/types/p2p-types';

// ============================================================================
// PAGINATED MESSAGE PERSISTENCE
// ============================================================================
// Messages are stored in pages to support lazy loading and efficient storage.
// Format:
//   - Metadata: msgs_with_peer_{CID}_metadata
//   - Pages: msgs_with_peer_{CID}_{pageNumber}
// Page 0 = oldest messages, higher pages = newer messages
// ============================================================================

export const MESSAGES_PER_PAGE: number = 50;
export const PAGINATED_PREFIX: "msgs_with_peer_" = 'msgs_with_peer_';

/**
 * Metadata for a conversation stored at `msgs_with_peer_{CID}_metadata`
 */
export interface ConversationMetadata {
  peerCid: bigint;
  /**
   * Which local account this conversation belongs to.
   *
   * Message pages are keyed by PEER only — `msgs_with_peer_{peerCid}_…` — and
   * stored in LocalDB bucket `0n`, which every account on the device shares.
   * Nothing recorded whose conversation a record was, so
   * `cleanupStaleConversations` — which deletes any cached conversation not in
   * the CURRENT account's peer list — classed every other account's history as
   * stale and deleted it. A second user logging in destroyed the first user's
   * messages, permanently, on a device this product explicitly expects to hold
   * several accounts.
   *
   * Optional because records written before this existed cannot be attributed
   * to anyone. They are read normally and NEVER deleted: an unknown owner is
   * exactly the case where destroying data is unsafe.
   */
  ownerCid?: bigint;
  peerUsername?: string;
  totalMessageCount: number;
  oldestMessageTimestamp: number;
  newestMessageTimestamp: number;
  latestPage: number;        // Current highest page number (0-indexed)
  messagesPerPage: number;   // Default: 50
  unreadCount: number;
  lastMessageIndex: number;
  lastUpdated: number;
}

/**
 * A page of messages stored at `msgs_with_peer_{CID}_{page}`
 */
export interface MessagePage {
  peerCid: bigint;
  pageNumber: number;
  messages: P2PMessage[];  // Sorted by timestamp ascending
  pageTimestamps: {
    minTimestamp: number;
    maxTimestamp: number;
  };
}

export interface P2PMessage {
  id: string;
  content: string;
  senderCid: bigint;
  recipientCid: bigint;
  timestamp: number;
  index: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  replyTo?: string;
  /** Set when the sender revised this message; the bubble shows an (edited) marker. */
  edited_at?: number;
  mentions?: string[];
  attachments?: P2PAttachment[];
  // Message type support (text, markdown, live_document, file_transfer)
  message_type: MessageType;
  // Live document specific fields
  document_id?: string;
  document_title?: string;
  // File transfer specific fields
  transfer_id?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  file_thumbnail?: string;
  transfer_mode?: 'async' | 'p2p';
  transfer_state?: 'pending' | 'uploading' | 'staged' | 'transferring' | 'complete' | 'declined' | 'cancelled' | 'expired' | 'error';
  transfer_progress?: number; // 0-100 percentage
  virtual_path?: string;
}

/** Peer presence status derived from MessagingLayer presence variants */
export interface PeerPresence {
  status: MessagingLayerType.Online | MessagingLayerType.Offline | MessagingLayerType.Away | MessagingLayerType.CustomState;
  customText?: string;
  customColor?: string;
  lastUpdate: number;
}

export interface P2PConversation {
  peerCid: bigint;
  peerUsername?: string;  // Store the peer's username for display
  messages: P2PMessage[];
  lastMessageIndex: number;
  unreadCount: number;
  typing: boolean;
  lastTypingUpdate: number;
  presence: PeerPresence;
}

export interface MessageCache {
  conversations: Map<bigint, P2PConversation>;
  messageQueue: P2PMessage[];
  maxQueueSize: number;
  maxMessagesPerConversation: number;
}
