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
import type { GroupConversation, GroupMember } from '@/types/group';
import { createDefaultRoles, getDefaultRole } from '@/types/group';
import { applyGroupInvite } from '@/hooks/use-group-state-invite';
import { debugLog } from '@/lib/debug-config';

let groups: GroupConversation[] = [];
const listeners = new Set<() => void>();
let bindingsStarted = false;

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
  const next = updater(groups);
  if (next === groups) return;
  groups = next;
  for (const listener of listeners) listener();
}

/**
 * Bind the group:* events to the store. Idempotent — every consumer calls it
 * on mount, only the first call subscribes.
 */
export function startGroupEventBindings(): void {
  if (bindingsStarted) return;
  bindingsStarted = true;

  eventEmitter.on('group:created', (data: {
    groupId: string;
    name: string;
    ownerId: string;
    ownerUsername: string;
  }) => {
    debugLog('GroupStore', 'Group created:', data);
    const defaultRoles = createDefaultRoles();
    const defaultRole = getDefaultRole({ roles: defaultRoles, defaultRoleId: '' });

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
    // swallows its own failures with a user-facing toast.
    applyGroupInvite(data, updateGroups).catch((err) => {
      debugLog('GroupStore', 'applyGroupInvite leaked a rejection:', err);
      eventEmitter.emit('notification:show', {
        title: 'Group Invitation Failed',
        description: 'Could not process the group invitation. Please try again.',
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
    const memberCid = BigInt(data.memberCid);
    updateGroups(prev =>
      prev.map(group => {
        if (group.id !== data.groupId) return group;
        if (group.members.some(m => m.cid === memberCid)) return group;
        const defaultRole = getDefaultRole(group.settings);
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

  const handleMemberLeft = (data: { groupId: string; memberCid: string }) => {
    debugLog('GroupStore', 'Member left:', data);
    const memberCid = BigInt(data.memberCid);
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
    updateGroups(prev =>
      prev.map(group => {
        if (group.id !== data.groupId) return group;
        return {
          ...group,
          unreadCount: group.unreadCount + 1,
          lastMessageTime: Date.now(),
          lastMessagePreview:
            data.content.length > 50 ? data.content.substring(0, 50) + '...' : data.content,
        };
      }),
    );
  });

  eventEmitter.on('group:deleted', (data: { groupId: string }) => {
    debugLog('GroupStore', 'Group deleted:', data);
    updateGroups(prev => prev.filter(g => g.id !== data.groupId));
  });

  debugLog('GroupStore', 'Group event bindings started');
}
