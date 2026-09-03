import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { isNewId } from '@/lib/seen-ids';
import { debugLog } from '@/lib/debug-config';
import type { GroupConversation } from '@/types/group';

/** How much of a message the sidebar previews before eliding. */
const PREVIEW_CHARS: number = 50;

/**
 * Fold an incoming group message into the list.
 *
 * Pure, and separate from the store's bindings so the unread rule can be tested
 * without an event emitter — the rule is where the bug was. The server answers
 * the SENDER with the same GroupMessageNotification it broadcasts to everyone
 * else (that echo is what confirms a send), so counting every arrival as unread
 * meant sending three messages made your own badge read 3.
 *
 * Two guards its siblings carry and this did not (`apply-group-settings`,
 * `rename-group`, `mark-group-read`):
 *
 *   - A message for a group the store does not have must return `prev`. `map`
 *     always allocates, so an unknown group produced a fresh array, a store
 *     notification and an IndexedDB write for a change nobody made.
 *   - A message id is applied once. The transport redelivers, and a second
 *     arrival added another to the unread badge for a message already counted.
 */
export function applyGroupMessage(
  groups: GroupConversation[],
  data: { groupId: string; senderId: string; content: string; messageId?: string },
  now: number,
): GroupConversation[] {
  // Nothing to fold into. Returning `prev` is the store's no-op contract.
  if (!groups.some((group) => group.id === data.groupId)) {
    debugLog('GroupStore', `Message for a group the store does not have: ${data.groupId}`);
    return groups;
  }

  // Applied once, however many times it arrives.
  //
  // Absent id means the emitter did not supply one; counting it is the old
  // behaviour and better than dropping a real message, so the guard only ever
  // REFUSES an id it has already seen.
  if (data.messageId !== undefined && !isNewId(`group:${data.groupId}`, data.messageId)) {
    debugLog('GroupStore', `Redelivered group message ${data.messageId}, not counted again`);
    return groups;
  }

  const own: bigint | null = instanceManager.cid;
  const fromSelf: boolean = own !== null && data.senderId === String(own);

  return groups.map((group) => {
    if (group.id !== data.groupId) return group;
    return {
      ...group,
      unreadCount: fromSelf ? group.unreadCount : group.unreadCount + 1,
      lastMessageTime: now,
      lastMessagePreview:
        data.content.length > PREVIEW_CHARS
          ? data.content.substring(0, PREVIEW_CHARS) + '...'
          : data.content,
    };
  });
}
