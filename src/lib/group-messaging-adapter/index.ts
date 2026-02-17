/**
 * Group Messaging Adapter Module
 *
 * Re-exports all public API for the group messaging adapter.
 */

export {
  mapMessageTypeToGroupMessageType,
  mapGroupMessageTypeToMessageType,
  convertGroupMessageToChatMessage,
} from './helpers';

export { GroupMessagingAdapter } from './adapter';

import { GroupMessagingAdapter } from './adapter';

/**
 * Factory function to create a Group messaging adapter
 */
export function createGroupMessagingAdapter(
  groupId: string,
  groupName: string,
  currentUserId: string,
  currentUserName: string
): GroupMessagingAdapter {
  return new GroupMessagingAdapter(groupId, groupName, currentUserId, currentUserName);
}
