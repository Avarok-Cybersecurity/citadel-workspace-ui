/**
 * Workspace Response Handler - Group Messaging Handlers
 *
 * Handles GroupMessageNotification, GroupMessages, GroupMessageEdited,
 * GroupMessageDeleted, and GroupMessage response variants.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import { groupMessagingManager } from '@/lib/group-messaging-manager';
import { isVariant } from 'citadel-workspace-client-ts';
import type { WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';
import type { ConnectionInfo } from './workspace-handlers';

/**
 * Try to handle group-messaging response variants.
 *
 * Returns `true` if the response was handled.
 */
export function handleGroupVariants(
  response: WorkspaceProtocolResponse,
  connectionInfo: ConnectionInfo,
): boolean {
  if (isVariant(response, 'GroupMessageNotification')) {
    const { group_id, message } = response.GroupMessageNotification;
    debugLog('WorkspaceResponseHandler', 'GroupMessageNotification received', { group_id, message });
    groupMessagingManager.handleNewMessage(group_id, message);
    eventEmitter.emit('group:message:new', {
      groupId: group_id,
      message,
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'GroupMessages')) {
    const { group_id, messages, has_more } = response.GroupMessages;
    debugLog('WorkspaceResponseHandler', 'GroupMessages received', { group_id, count: messages.length, has_more });
    groupMessagingManager.handleMessagesLoaded(group_id, messages, has_more);
    eventEmitter.emit('group:messages:loaded', {
      groupId: group_id,
      messages,
      hasMore: has_more,
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'GroupMessageEdited')) {
    const { group_id, message_id, new_content, edited_at } = response.GroupMessageEdited;
    debugLog('WorkspaceResponseHandler', 'GroupMessageEdited received', { group_id, message_id });
    groupMessagingManager.handleMessageEdited(group_id, message_id, new_content, edited_at);
    eventEmitter.emit('group:message:edited', {
      groupId: group_id,
      messageId: message_id,
      newContent: new_content,
      editedAt: edited_at,
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'GroupMessageDeleted')) {
    const { group_id, message_id, deleted_by } = response.GroupMessageDeleted;
    debugLog('WorkspaceResponseHandler', 'GroupMessageDeleted received', { group_id, message_id, deleted_by });
    groupMessagingManager.handleMessageDeleted(group_id, message_id);
    eventEmitter.emit('group:message:deleted', {
      groupId: group_id,
      messageId: message_id,
      deletedBy: deleted_by,
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'GroupMessage')) {
    debugLog('WorkspaceResponseHandler', 'GroupMessage received', response.GroupMessage);
    eventEmitter.emit('group:message:single', {
      message: response.GroupMessage,
      connection: connectionInfo,
    });
    return true;
  }

  return false;
}
