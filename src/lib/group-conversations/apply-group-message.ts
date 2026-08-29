import { instanceManager } from '@/lib/multi-instance/instance-manager';
import type { GroupConversation } from '@/types/group';

/** How much of a message the sidebar previews before eliding. */
const PREVIEW_CHARS = 50;

/**
 * Fold an incoming group message into the list.
 *
 * Pure, and separate from the store's bindings so the unread rule can be tested
 * without an event emitter — the rule is where the bug was. The server answers
 * the SENDER with the same GroupMessageNotification it broadcasts to everyone
 * else (that echo is what confirms a send), so counting every arrival as unread
 * meant sending three messages made your own badge read 3.
 */
export function applyGroupMessage(
  groups: GroupConversation[],
  data: { groupId: string; senderId: string; content: string },
  now: number,
): GroupConversation[] {
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
