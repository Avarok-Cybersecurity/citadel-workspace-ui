/**
 * Renaming a group, in the one place a group's name can live.
 *
 * The protocol has no group name. `GroupCreate` carries
 * `{cid, request_id, initial_users_to_invite}` and nothing else, which is why
 * `group-names.ts` exists — a peer cannot be told a name the wire has no field
 * for. A rename is therefore local by necessity, and that is fine.
 *
 * What was not fine: `useGroupSettingsActions.onNameChange` was the whole
 * rename, and it was one line of component state —
 * `setGroup(prev => ({...prev, name}))`. It reached neither
 * `rememberGroupName`, which is what `group-store` consults when it builds a
 * group's label, nor `updateGroups`, which is what the sidebar renders and what
 * gets persisted. So the open page showed the new name, the sidebar went on
 * showing the old one, and a reload lost it entirely.
 *
 * Both stores are updated here, together, because updating one without the
 * other is exactly the state that produced the bug.
 */
import { rememberGroupName } from './group-names';
import { updateGroups } from './group-store';
import type { GroupConversation } from '@/types/group';

/** Returns whether anything changed. A blank name is refused, not applied. */
export function applyGroupRename(groupId: string, name: string): boolean {
  const trimmed: string = name.trim();
  // A group with an empty label renders as a blank row that cannot be
  // identified, and there is no way back to it from the sidebar.
  if (trimmed.length === 0) return false;

  rememberGroupName(groupId, trimmed);
  updateGroups((prev: GroupConversation[]) => {
    // Identity is the store's only no-op guard, and `map` always allocates, so
    // renaming a group to the name it already has would notify every subscriber
    // and write to IndexedDB for nothing. See mark-group-read.ts for what that
    // cost when a caller was an effect.
    const target: GroupConversation | undefined = prev.find((group) => group.id === groupId);
    if (!target || target.name === trimmed) return prev;
    return prev.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group));
  });
  return true;
}
