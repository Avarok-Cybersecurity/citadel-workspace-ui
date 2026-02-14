/**
 * P2P Messaging Adapter - Message Converters
 *
 * Converts between P2P message types and the unified ChatMessage format.
 */

import type { ChatMessage } from '../chat-messaging-adapter';
import type { P2PMessage } from '../p2p';

/**
 * Maps P2P message status to unified ChatMessage status
 */
export function mapP2PStatus(
  status: P2PMessage['status']
): ChatMessage['status'] {
  switch (status) {
    case 'pending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return 'sent';
  }
}

/**
 * Converts a P2PMessage to the unified ChatMessage format
 */
export function convertP2PMessageToChatMessage(
  msg: P2PMessage,
  currentUserId: bigint,
  peerName: string
): ChatMessage {
  const isOwn = msg.senderCid === currentUserId;

  return {
    id: msg.id,
    content: msg.content,
    timestamp: msg.timestamp,
    senderId: msg.senderCid.toString(),
    senderName: isOwn ? 'You' : peerName,
    isOwn,
    messageType: msg.message_type,
    status: mapP2PStatus(msg.status),
    editedAt: undefined,
    replyToId: msg.replyTo,
    transferId: msg.transfer_id,
    transferState: msg.transfer_state,
    transferProgress: msg.transfer_progress,
    fileName: msg.file_name,
    fileSize: msg.file_size,
    documentId: msg.document_id,
    documentTitle: msg.document_title,
  };
}

/**
 * Merge storage messages with in-memory messages, deduplicating by ID.
 * In-memory messages take priority (more recent state).
 */
export function mergeMessages(
  storageMessages: P2PMessage[],
  inMemoryMessages: P2PMessage[]
): P2PMessage[] {
  const messageMap = new Map<string, P2PMessage>();

  storageMessages.forEach((msg) => messageMap.set(msg.id, msg));
  inMemoryMessages.forEach((msg) => messageMap.set(msg.id, msg));

  return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}
