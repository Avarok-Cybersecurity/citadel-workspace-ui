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
import { applyGroupInvite } from './use-group-state-invite';

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

      // Auto-accept: build the local group entry (with inviter + best-
      // effort self member) and commit it in a single setGroups call.
      // The build-then-commit ordering avoids a race where a "patch
      // self in later" setGroups could run before the initial "add the
      // group" setGroups, dropping the self member.
      //
      // === KNOWN UX GAP — local-only acceptance ===
      // We commit local group state without sending any
      // backend-acknowledged AcceptGroupInvite command. If the Citadel
      // group protocol later starts requiring explicit acceptance
      // before message sends are accepted on the wire, the UI will
      // briefly show the user as "joined" while the server still treats
      // them as merely invited — message sends would fail and the user
      // would not understand why. Symptoms to watch for: a freshly
      // accepted invite where the first outbound chat send returns a
      // permission/membership error.
      //
      // Two fix paths when the backend command lands:
      //   (a) preferred — make `applyGroupInvite` async, await
      //       AcceptGroupInvite, only call setGroups on success;
      //   (b) keep optimistic local commit and reconcile on the
      //       AcceptGroupInvite response (with a "pending acceptance"
      //       visual hint while the round-trip is in flight).
      //
      // Until then the behaviour is "best-effort optimistic": the
      // local group entry is correct for offline/peer-to-peer message
      // routing today, and any future server-mediated check will
      // surface the divergence to the user via send-failure feedback
      // rather than silent loss. The pure builder lives in
      // `use-group-state-invite.ts` for unit-testability.
      applyGroupInvite(data, setGroups);
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
