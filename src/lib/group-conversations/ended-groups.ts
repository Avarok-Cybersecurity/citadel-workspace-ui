import { eventEmitter } from '@/lib/event-emitter';

/**
 * Groups this session watched end.
 *
 * When a group is deleted — or you are removed from it, which arrives as the
 * same `GroupDisconnectNotification` — the store drops it, `getGroup` misses,
 * and the open page bounces to the workspace saying the group "may have been
 * deleted". That hedge is wrong in the one case where the client actually
 * knows: the event was received and acted upon a moment earlier.
 *
 * Bounded, because this is a per-session breadcrumb and not a record. Losing
 * the oldest entries degrades the message back to the hedge, which is exactly
 * what it says.
 */
const MAX_REMEMBERED = 50;
const ended: Set<string> = new Set<string>();

export function bindEndedGroups(): void {
  eventEmitter.on('group:deleted', (data: { groupId: string }) => {
    ended.add(data.groupId);
    // Insertion order, so the oldest goes first.
    while (ended.size > MAX_REMEMBERED) {
      const oldest = ended.values().next().value;
      if (oldest === undefined) break;
      ended.delete(oldest);
    }
  });
}

/** Whether this session saw that group end. */
export function wasEnded(groupId: string): boolean {
  return ended.has(groupId);
}

/** Test seam. */
export function forgetEndedGroups(): void {
  ended.clear();
}
