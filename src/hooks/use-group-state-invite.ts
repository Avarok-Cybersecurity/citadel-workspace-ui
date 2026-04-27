/**
 * Group-Invite Acceptance Helper
 *
 * Pure async helper that builds a `GroupConversation` for an incoming
 * invite, including the inviter and (best-effort) the accepting user.
 *
 * Lives in its own module so the `useGroupState` hook stays under the
 * 250-line CI cap. The dynamic `connectionManager` import is preserved
 * here for the same reason it was in the original site: it keeps the
 * hook's synchronous import graph free of the connection module
 * (historical circular-dependency concern).
 */

import { eventEmitter } from '@/lib/event-emitter';
import type { GroupConversation, GroupMember } from '@/types/group';
import { createDefaultRoles, getDefaultRole } from '@/types/group';
import { debugLog } from '@/lib/debug-config';

export interface GroupInvitePayload {
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterUsername: string;
}

/**
 * Resolve the accepting user's CID and produce the local
 * `GroupConversation` entry for an incoming invite.
 *
 * If the local CID can't be resolved we still build the group (so the
 * UI doesn't silently swallow the invite) but the members array will
 * contain only the inviter — caller (or a later event) can backfill.
 *
 * Caller is responsible for committing the result via `setGroups` and
 * for emitting any user-facing notification.
 */
export async function buildGroupFromInvite(
  data: GroupInvitePayload,
): Promise<GroupConversation> {
  const defaultRoles = createDefaultRoles();
  const defaultRole = getDefaultRole({ roles: defaultRoles, defaultRoleId: '' });

  const inviterMember: GroupMember = {
    cid: BigInt(data.inviterId),
    username: data.inviterUsername,
    roleId: defaultRoles[0].id,
    joinedAt: Date.now(),
  };

  let selfMember: GroupMember | null = null;
  try {
    const { connectionManager } = await import('@/lib/connection');
    const info = connectionManager.getConnectionInfo();
    if (info) {
      const session = await connectionManager.getTabSelectedSession();
      const selfUsername = info.username || session?.username || 'me';
      selfMember = {
        cid: info.cid,
        username: selfUsername,
        roleId: defaultRole?.id || defaultRoles[defaultRoles.length - 1].id,
        joinedAt: Date.now(),
      };
    } else {
      debugLog(
        'UseGroupConversations',
        'No current connection info; group will be created without a self member',
      );
    }
  } catch (e) {
    debugLog('UseGroupConversations', 'Failed to resolve self for group invite:', e);
  }

  const members: GroupMember[] = selfMember
    ? [inviterMember, selfMember]
    : [inviterMember];

  return {
    id: data.groupId,
    name: data.groupName || `${data.inviterUsername}'s Group`,
    ownerId: BigInt(data.inviterId),
    members,
    settings: {
      roles: defaultRoles,
      defaultRoleId: defaultRole?.id || defaultRoles[2].id,
    },
    unreadCount: 1,
  };
}

/**
 * Convenience wrapper around `buildGroupFromInvite` that also fires the
 * standard "Group Invitation" notification. Callers pass in the
 * `setGroups` updater and we handle the dedupe-on-existing-id check.
 */
export function applyGroupInvite(
  data: GroupInvitePayload,
  setGroups: (updater: (prev: GroupConversation[]) => GroupConversation[]) => void,
): void {
  void (async () => {
    const newGroup = await buildGroupFromInvite(data);
    setGroups((prev) => (prev.some((g) => g.id === data.groupId) ? prev : [...prev, newGroup]));
    eventEmitter.emit('notification:show', {
      title: 'Group Invitation',
      description: `${data.inviterUsername} invited you to "${data.groupName || 'a group'}"`,
    });
  })();
}
