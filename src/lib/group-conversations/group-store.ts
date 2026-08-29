/**
 * The one place group-conversation state lives.
 *
 * It used to live inside useGroupState — PER HOOK INSTANCE. The sidebar's
 * instance received the group events and built the list; the moment the user
 * navigated to /groups/:id, GroupChatPage mounted a FRESH instance whose list
 * was empty, concluded "Group not found", and bounced back to the workspace.
 * The localStorage "persistence" that was supposed to bridge instances never
 * once worked: member CIDs are bigint, JSON.stringify throws on bigint, and
 * the save was wrapped in a try/catch that logged and moved on — so every
 * instance always started from nothing. That dead persistence is removed
 * rather than patched with a bigint replacer (see the CID rules: browser
 * persistence belongs to IndexedDB, not JSON); state now simply lives for the
 * session, shared by every consumer.
 *
 * Event handling is bound here exactly once, not per hook instance — with a
 * shared list, per-instance handlers would apply every event N times (visible
 * immediately as unread counts climbing by the number of mounted components).
 */

import { eventEmitter } from '@/lib/event-emitter';
import { bindGroupFailureToasts } from './group-failure-toasts';
import { bindGroupListReconcile } from './reconcile-groups';
import { bindEndedGroups } from './ended-groups';
import type { GroupConversation, GroupMember } from '@/types/group';
import { createDefaultRoles, getDefaultRole } from '@/types/group';
import { applyGroupInvite } from '@/hooks/use-group-state-invite';
import { toast } from '@/hooks/use-toast';
import { loadPersistedGroups, persistGroups } from './group-persistence';
import { applyGroupMessage } from './apply-group-message';
import { debugLog } from '@/lib/debug-config';
import type { GroupRole } from '@/types/group-permissions';

let groups: GroupConversation[] = [];
const listeners: Set<() => void> = new Set<() => void>();
let bindingsStarted: boolean = false;

let hydrated: boolean = false;

export function getGroups(): GroupConversation[] {
  return groups;
}

export function subscribeToGroups(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateGroups(
  updater: (prev: GroupConversation[]) => GroupConversation[],
): void {
  const next: GroupConversation[] = updater(groups);
  if (next === groups) return;
  groups = next;
  for (const listener of listeners) listener();
  // Fire and forget: a storage failure must not block a state update the user
  // can already see. persistGroups logs and swallows for the same reason.
  void persistGroups(groups);
}

/**
 * Restore the previous session's groups.
 *
 * Without this the store was memory-only and nothing rebuilt it, so every
 * reload emptied the sidebar and a bookmarked /groups/:id reported "This group
 * may have been deleted" for a group that still existed.
 *
 * Restored groups are MERGED under whatever has arrived live, not assigned over
 * it: bindings are started before this resolves, so an invite that lands during
 * the read must not be overwritten by a snapshot taken before it.
 */
export async function restorePersistedGroups(): Promise<void> {
  try {
    const stored: GroupConversation[] = await loadPersistedGroups();
    if (stored.length > 0) {
      updateGroups((prev) => {
        const known: Set<string> = new Set(prev.map((g) => g.id));
        const missing: GroupConversation[] = stored.filter((g) => !known.has(g.id));
        return missing.length === 0 ? prev : [...prev, ...missing];
      });
    }
  } finally {
    // Marked even when the read finds nothing or fails. "Hydration finished"
    // and "there are groups" are different facts, and a consumer waiting on the
    // first would wait forever if only the second set it.
    hydrated = true;
    for (const listener of listeners) listener();
  }
}

/**
 * Forget this account's groups and load the next one's.
 *
 * The list is a module singleton and the restore is a union merge, so switching
 * accounts in one browser left the previous account's groups in the sidebar and
 * merged the new account's on top — two people's groups in one list, with the
 * first account's still clickable. Persistence was already keyed per CID; only
 * the memory in front of it was not.
 *
 * The clear does NOT go through `updateGroups`, which persists: writing an
 * empty list under the NEW account's key would destroy the very groups the
 * restore is about to read.
 */
export async function resetGroupsForSession(): Promise<void> {
  groups = [];
  hydrated = false;
  for (const listener of listeners) listener();
  await restorePersistedGroups();
}

/**
 * Whether the persisted restore has finished.
 *
 * The restore above is asynchronous, and `getGroups()` reads the store
 * synchronously — so a page that mounts, looks up its group and finds nothing
 * has learned only that IndexedDB has not answered yet. GroupChatPage did
 * exactly that and concluded the group was deleted: every reload, bookmark and
 * shared `/groups/:id` link bounced to the workspace with a destructive toast,
 * deterministically, because all effects of a commit run before any microtask
 * from that read can resolve.
 *
 * The persistence layer was added to fix precisely this — its own comment says
 * so — but nothing ever waited for it.
 */
export function areGroupsHydrated(): boolean {
  return hydrated;
}

/**
 * Bind the group:* events to the store. Idempotent — every consumer calls it
 * on mount, only the first call subscribes.
 */
export function startGroupEventBindings(): void {
  if (bindingsStarted) return;
  bindingsStarted = true;

  bindGroupFailureToasts();

  eventEmitter.on('group:created', (data: {
    groupId: string;
    name: string;
    ownerId: string;
    ownerUsername: string;
  }) => {
    debugLog('GroupStore', 'Group created:', data);
    const defaultRoles: GroupRole[] = createDefaultRoles();
    const defaultRole: GroupRole | undefined = getDefaultRole({ roles: defaultRoles, defaultRoleId: '' });

    const newGroup: GroupConversation = {
      id: data.groupId,
      name: data.name || data.ownerUsername,
      ownerId: BigInt(data.ownerId),
      members: [
        {
          cid: BigInt(data.ownerId),
          username: data.ownerUsername,
          roleId: defaultRoles[0].id,
          joinedAt: Date.now(),
        },
      ],
      settings: {
        roles: defaultRoles,
        defaultRoleId: defaultRole?.id || defaultRoles[defaultRoles.length - 1].id,
      },
      unreadCount: 0,
    };

    // By id, not unconditionally: accepting an invite can surface a channel
    // create for a group the invite already added, and a second row for the
    // same id would let the two drift apart.
    updateGroups(prev => (prev.some(g => g.id === newGroup.id) ? prev : [...prev, newGroup]));
  });

  eventEmitter.on('group:invite-received', (data: {
    groupId: string;
    groupName: string;
    inviterId: string;
    inviterUsername: string;
  }) => {
    debugLog('GroupStore', 'Invite received:', data);
    // Auto-accept, locally and at the backend; applyGroupInvite owns both and
    // reports its own failures. This catch covers a rejection that escapes it.
    applyGroupInvite(data, updateGroups).catch((err) => {
      debugLog('GroupStore', 'applyGroupInvite leaked a rejection:', err);
      toast({
        title: 'Group Invitation Failed',
        description: 'Could not process the group invitation. Please try again.',
        variant: 'destructive',
      });
    });
  });

  eventEmitter.on('group:member-joined', (data: {
    groupId: string;
    memberCid: string;
    memberUsername: string;
    roleId?: string;
  }) => {
    debugLog('GroupStore', 'Member joined:', data);
    const memberCid: bigint = BigInt(data.memberCid);
    updateGroups(prev =>
      prev.map(group => {
        if (group.id !== data.groupId) return group;
        if (group.members.some(m => m.cid === memberCid)) return group;
        const defaultRole: GroupRole | undefined = getDefaultRole(group.settings);
        const newMember: GroupMember = {
          cid: memberCid,
          username: data.memberUsername,
          roleId: data.roleId || defaultRole?.id || group.settings.roles[2]?.id,
          joinedAt: Date.now(),
        };
        return { ...group, members: [...group.members, newMember] };
      }),
    );
  });

  const handleMemberLeft = (data: { groupId: string; memberCid: string }): void => {
    debugLog('GroupStore', 'Member left:', data);
    const memberCid: bigint = BigInt(data.memberCid);
    updateGroups(prev =>
      prev.map(group =>
        group.id === data.groupId
          ? { ...group, members: group.members.filter(m => m.cid !== memberCid) }
          : group,
      ),
    );
  };
  eventEmitter.on('group:member-left', handleMemberLeft);
  eventEmitter.on('group:member-kicked', handleMemberLeft);

  eventEmitter.on('group:message-received', (data: {
    groupId: string;
    senderId: string;
    content: string;
  }) => {
    updateGroups((prev) => applyGroupMessage(prev, data, Date.now()));
  });

  eventEmitter.on('group:deleted', (data: { groupId: string }) => {
    debugLog('GroupStore', 'Group deleted:', data);
    updateGroups(prev => prev.filter(g => g.id !== data.groupId));
  });

  bindGroupListReconcile();
  bindEndedGroups();

  debugLog('GroupStore', 'Group event bindings started');
}
