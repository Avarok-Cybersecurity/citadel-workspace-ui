/**
 * P2P Messaging Adapter - Message Converters
 *
 * Converts between P2P message types and the unified ChatMessage format.
 */

import type { ChatMessage } from '../chat-messaging-adapter';
import { mergeById } from '@/lib/p2p/merge-by-id';
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
 * Storage merged with in-memory state.
 *
 * The INCOMING copy wins a duplicate id here, because incoming means in-memory
 * and in-memory is newer than what was persisted. The hook that merges new
 * arrivals into rendered state resolves the same conflict the other way; both
 * were called `mergeMessages` and neither said which it did.
 */
export function mergeMessages(
  storageMessages: P2PMessage[],
  inMemoryMessages: P2PMessage[]
): P2PMessage[] {
  return mergeById(storageMessages, inMemoryMessages, 'incoming');
}
