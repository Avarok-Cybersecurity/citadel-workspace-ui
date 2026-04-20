/**
 * Group Conversations State Management
 *
 * Handles event listeners, state updates, and persistence for group conversations.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import type {
  GroupConversation,
  GroupMember,
} from '@/types/group';
import { createDefaultRoles, getDefaultRole } from '@/types/group';
import { debugLog } from '@/lib/debug-config';
import { STORAGE_KEY } from './use-group-conversations.types';

// ============================================================================
// State & Persistence Hooks
// ============================================================================

export interface GroupState {
  groups: GroupConversation[];
  setGroups: React.Dispatch<React.SetStateAction<GroupConversation[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Initializes group state with localStorage persistence and event listeners.
 */
export function useGroupState(): GroupState {
  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load groups from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setGroups(parsed);
      }
    } catch (e) {
      debugLog('UseGroupConversations', 'Failed to load from storage:', e);
    }
    setLoading(false);
  }, []);

  // Save groups to local storage when they change
  useEffect(() => {
    if (!loading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
      } catch (e) {
        debugLog('UseGroupConversations', 'Failed to save to storage:', e);
      }
    }
  }, [groups, loading]);

  // Listen for group events
  useEffect(() => {
    const handleGroupCreated = (data: {
      groupId: string;
      name: string;
      ownerId: string;
      ownerUsername: string;
    }) => {
      debugLog('UseGroupConversations', '[useGroupConversations] Group created:', data);

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
            roleId: defaultRoles[0].id, // Owner role
            joinedAt: Date.now(),
          },
        ],
        settings: {
          roles: defaultRoles,
          defaultRoleId: defaultRole?.id || defaultRoles[2].id,
        },
        unreadCount: 0,
      };

      setGroups(prev => [...prev, newGroup]);
    };

    const handleGroupInviteReceived = (data: {
      groupId: string;
      groupName: string;
      inviterId: string;
      inviterUsername: string;
    }) => {
      debugLog('UseGroupConversations', '[useGroupConversations] Invite received:', data);

      // Auto-accept: create the group entry locally so the user can start interacting.
      //
      // @human-review Invite acceptance flow: this creates the local group entry
      // without sending an explicit accept/reject to the backend. If the
      // Citadel group protocol requires an explicit acceptance for message
      // sends to succeed, this path will leave the UI out of sync with
      // server-side membership. Replace with either (a) a dialog that
      // calls a WorkspaceService.acceptGroupInvite API, or (b) a
      // silent auto-accept that *also* fires the backend accept command.
      const defaultRoles = createDefaultRoles();
      const defaultRole = getDefaultRole({ roles: defaultRoles, defaultRoleId: '' });

      // Resolve the accepting user (connectionManager is imported dynamically
      // to keep this hook's synchronous import graph minimal) and then
      // commit the group entry in a single setGroups call. Performing the
      // resolve + setGroups as one step avoids a race where a separate
      // "patch self in later" setGroups could run before the initial
      // "add the group" setGroups, leaving the self-member dropped.
      //
      // If we cannot resolve the self CID we still add the group (so the
      // UI doesn't silently swallow the invite) but log so the missing
      // member is diagnosable.
      void (async () => {
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
            debugLog('UseGroupConversations', 'No current connection info; group will be created without a self member');
          }
        } catch (e) {
          debugLog('UseGroupConversations', 'Failed to resolve self for group invite:', e);
        }

        const members: GroupMember[] = selfMember
          ? [inviterMember, selfMember]
          : [inviterMember];

        const newGroup: GroupConversation = {
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

        setGroups(prev => {
          // Don't add if already exists
          if (prev.some(g => g.id === data.groupId)) return prev;
          return [...prev, newGroup];
        });

        // Notify the user
        eventEmitter.emit('notification:show', {
          title: 'Group Invitation',
          description: `${data.inviterUsername} invited you to "${data.groupName || 'a group'}"`,
        });
      })();
    };

    const handleGroupMemberJoined = (data: {
      groupId: string;
      memberCid: string;
      memberUsername: string;
      roleId?: string;
    }) => {
      debugLog('UseGroupConversations', '[useGroupConversations] Member joined:', data);
      const memberCidBigint = BigInt(data.memberCid);

      setGroups(prev =>
        prev.map(group => {
          if (group.id !== data.groupId) return group;

          // Check if member already exists
          if (group.members.some(m => m.cid === memberCidBigint)) {
            return group;
          }

          const defaultRole = getDefaultRole(group.settings);
          const newMember: GroupMember = {
            cid: memberCidBigint,
            username: data.memberUsername,
            roleId: data.roleId || defaultRole?.id || group.settings.roles[2]?.id,
            joinedAt: Date.now(),
          };

          return {
            ...group,
            members: [...group.members, newMember],
          };
        })
      );
    };

    const handleGroupMemberLeft = (data: { groupId: string; memberCid: string }) => {
      debugLog('UseGroupConversations', '[useGroupConversations] Member left:', data);
      const memberCidBigint = BigInt(data.memberCid);

      setGroups(prev =>
        prev.map(group => {
          if (group.id !== data.groupId) return group;
          return {
            ...group,
            members: group.members.filter(m => m.cid !== memberCidBigint),
          };
        })
      );
    };

    const handleGroupMessageReceived = (data: {
      groupId: string;
      senderId: string;
      content: string;
    }) => {
      debugLog('UseGroupConversations', '[useGroupConversations] Message received:', data);

      setGroups(prev =>
        prev.map(group => {
          if (group.id !== data.groupId) return group;
          return {
            ...group,
            unreadCount: group.unreadCount + 1,
            lastMessageTime: Date.now(),
            lastMessagePreview:
              data.content.length > 50
                ? data.content.substring(0, 50) + '...'
                : data.content,
          };
        })
      );
    };

    const handleGroupDeleted = (data: { groupId: string }) => {
      debugLog('UseGroupConversations', '[useGroupConversations] Group deleted:', data);
      setGroups(prev => prev.filter(g => g.id !== data.groupId));
    };

    // Subscribe to events
    eventEmitter.on('group:created', handleGroupCreated);
    eventEmitter.on('group:invite-received', handleGroupInviteReceived);
    eventEmitter.on('group:member-joined', handleGroupMemberJoined);
    eventEmitter.on('group:member-left', handleGroupMemberLeft);
    eventEmitter.on('group:member-kicked', handleGroupMemberLeft);
    eventEmitter.on('group:message-received', handleGroupMessageReceived);
    eventEmitter.on('group:deleted', handleGroupDeleted);

    return () => {
      eventEmitter.off('group:created', handleGroupCreated);
      eventEmitter.off('group:invite-received', handleGroupInviteReceived);
      eventEmitter.off('group:member-joined', handleGroupMemberJoined);
      eventEmitter.off('group:member-left', handleGroupMemberLeft);
      eventEmitter.off('group:member-kicked', handleGroupMemberLeft);
      eventEmitter.off('group:message-received', handleGroupMessageReceived);
      eventEmitter.off('group:deleted', handleGroupDeleted);
    };
  }, []);

  return { groups, setGroups, loading, setLoading, error, setError };
}

/**
 * Sorts groups by last message time (most recent first).
 */
export function useSortedGroups(groups: GroupConversation[]): GroupConversation[] {
  return useMemo(() => {
    return [...groups].sort((a, b) => {
      const aTime = a.lastMessageTime || 0;
      const bTime = b.lastMessageTime || 0;
      return bTime - aTime;
    });
  }, [groups]);
}
