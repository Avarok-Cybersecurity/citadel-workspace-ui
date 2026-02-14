/**
 * Workspace Service - Messaging Operations
 *
 * Methods for sending messages and group messaging (send, edit, delete,
 * get messages, get threads) plus user profile updates.
 */

import type {
  WorkspaceProtocolRequestTS,
  GroupMessageTypeTS,
} from '@/types/workspace-protocol';
import { GroupMessageTypeTS as GroupMessageTypeEnum } from '@/types/workspace-protocol';
import type { ProtocolSender } from './workspace-operations';

/**
 * Send a message via workspace protocol
 */
export async function sendMessage(sender: ProtocolSender, contents: Uint8Array): Promise<void> {
  const requestPart = {
    Message: { contents: new Uint8Array(contents) }
  } as WorkspaceProtocolRequestTS;
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Send a group message to a chat channel
 */
export async function sendGroupMessage(
  sender: ProtocolSender,
  groupId: string,
  content: string,
  messageType: GroupMessageTypeTS = GroupMessageTypeEnum.Text,
  replyTo?: string,
  mentions?: string[]
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    SendGroupMessage: {
      group_id: groupId,
      message_type: messageType,
      content,
      reply_to: replyTo,
      mentions
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Edit an existing group message
 */
export async function editGroupMessage(
  sender: ProtocolSender,
  groupId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    EditGroupMessage: {
      group_id: groupId,
      message_id: messageId,
      new_content: newContent
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Delete a group message
 */
export async function deleteGroupMessage(
  sender: ProtocolSender,
  groupId: string,
  messageId: string
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    DeleteGroupMessage: {
      group_id: groupId,
      message_id: messageId
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get paginated group messages
 */
export async function getGroupMessages(
  sender: ProtocolSender,
  groupId: string,
  beforeTimestamp?: number | bigint,
  limit: number = 50
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetGroupMessages: {
      group_id: groupId,
      before_timestamp: beforeTimestamp != null ? Number(beforeTimestamp) : undefined,
      limit
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get thread messages (replies to a parent message)
 */
export async function getThreadMessages(
  sender: ProtocolSender,
  groupId: string,
  parentMessageId: string
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetThreadMessages: {
      group_id: groupId,
      parent_message_id: parentMessageId
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Update the current user's profile
 */
export async function updateUserProfile(
  sender: ProtocolSender,
  name?: string,
  avatarData?: string
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    UpdateUserProfile: {
      name,
      avatar_data: avatarData
    }
  };
  return sender.sendProtocolRequest(requestPart);
}
