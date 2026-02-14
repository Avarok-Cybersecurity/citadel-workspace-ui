/**
 * Group Messaging Adapter Helpers
 *
 * Type mapping and conversion functions for group messaging.
 */

import type { ChatMessage } from '../chat-messaging-adapter';
import type { GroupMessage, GroupMessageType } from '@/types/workspace-entities';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import type { MessageType } from '@/types/message-protocol';

/**
 * Maps our MessageType to GroupMessageTypeTS for workspace protocol
 */
export function mapMessageTypeToGroupMessageType(messageType: MessageType): GroupMessageTypeTS {
  switch (messageType) {
    case 'markdown':
      return GroupMessageTypeTS.Markdown;
    case 'text':
    default:
      return GroupMessageTypeTS.Text;
  }
}

/**
 * Maps GroupMessageType to our MessageType
 */
export function mapGroupMessageTypeToMessageType(groupType: GroupMessageType): MessageType {
  switch (groupType) {
    case 'Markdown':
      return 'markdown';
    case 'Text':
    default:
      return 'text';
  }
}

/**
 * Converts a GroupMessage to the unified ChatMessage format
 */
export function convertGroupMessageToChatMessage(
  msg: GroupMessage,
  currentUserId: string
): ChatMessage {
  const isOwn = msg.sender_id === currentUserId;

  return {
    id: msg.id,
    content: msg.content,
    timestamp: Number(msg.timestamp),
    senderId: msg.sender_id,
    senderName: msg.sender_name,
    isOwn,
    messageType: mapGroupMessageTypeToMessageType(msg.message_type),
    status: 'sent', // Group messages are always "sent" once received

    // Optional fields - convert bigint|null to number|undefined for ChatMessage
    editedAt: msg.edited_at != null ? Number(msg.edited_at) : undefined,
    replyToId: msg.reply_to ?? undefined,
    replyCount: msg.reply_count,
  };
}
