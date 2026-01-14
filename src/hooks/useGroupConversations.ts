/**
 * useGroupConversations Hook
 *
 * Manages the state of custom peer group conversations.
 * Handles group creation, membership changes, and message notifications.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { connectionManager } from "@/lib/connection-manager";
import type {
  GroupConversation,
  GroupMember,
  GroupSettings,
  GroupRole,
} from '@/types/group';
import { createDefaultRoles, getDefaultRole } from '@/types/group';

// ============================================================================
// Types
// ============================================================================

interface UseGroupConversationsResult {
  /** All group conversations */
  groups: GroupConversation[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Create a new group */
  createGroup: (
    name: string,
    initialMembers: Array<{ cid: string; username: string; roleId?: string }>
  ) => Promise<string>;
  /** Invite a peer to a group */
  invitePeer: (groupId: string, peerCid: string, roleId?: string) => Promise<void>;
  /** Leave a group */
  leaveGroup: (groupId: string) => Promise<void>;
  /** Kick a member from a group */
  kickMember: (groupId: string, memberCid: string) => Promise<void>;
  /** Update a member's role */
  updateMemberRole: (groupId: string, memberCid: string, roleId: string) => Promise<void>;
  /** Get a specific group by ID */
  getGroup: (groupId: string) => GroupConversation | undefined;
  /** Mark messages as read for a group */
  markAsRead: (groupId: string) => void;
  /** Refresh groups from server */
  refresh: () => Promise<void>;
}

// ============================================================================
// Local Storage Key
// ============================================================================

const STORAGE_KEY = 'citadel_group_conversations';

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGroupConversations(): UseGroupConversationsResult {
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
      console.error('[useGroupConversations] Failed to load from storage:', e);
    }
    setLoading(false);
  }, []);

  // Save groups to local storage when they change
  useEffect(() => {
    if (!loading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
      } catch (e) {
        console.error('[useGroupConversations] Failed to save to storage:', e);
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
      console.log('[useGroupConversations] Group created:', data);

      const defaultRoles = createDefaultRoles();
      const defaultRole = getDefaultRole({ roles: defaultRoles, defaultRoleId: '' });

      const newGroup: GroupConversation = {
        id: data.groupId,
        name: data.name || data.ownerUsername,
        ownerId: data.ownerId,
        members: [
          {
            cid: data.ownerId,
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
      console.log('[useGroupConversations] Invite received:', data);
      // For now, auto-accept invites - in future, show invite dialog
      // TODO: Implement invite acceptance flow
    };

    const handleGroupMemberJoined = (data: {
      groupId: string;
      memberCid: string;
      memberUsername: string;
      roleId?: string;
    }) => {
      console.log('[useGroupConversations] Member joined:', data);

      setGroups(prev =>
        prev.map(group => {
          if (group.id !== data.groupId) return group;

          // Check if member already exists
          if (group.members.some(m => m.cid === data.memberCid)) {
            return group;
          }

          const defaultRole = getDefaultRole(group.settings);
          const newMember: GroupMember = {
            cid: data.memberCid,
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
      console.log('[useGroupConversations] Member left:', data);

      setGroups(prev =>
        prev.map(group => {
          if (group.id !== data.groupId) return group;
          return {
            ...group,
            members: group.members.filter(m => m.cid !== data.memberCid),
          };
        })
      );
    };

    const handleGroupMessageReceived = (data: {
      groupId: string;
      senderId: string;
      content: string;
    }) => {
      console.log('[useGroupConversations] Message received:', data);

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
      console.log('[useGroupConversations] Group deleted:', data);
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

  // Create a new group
  const createGroup = useCallback(
    async (
      name: string,
      initialMembers: Array<{ cid: string; username: string; roleId?: string }>
    ): Promise<string> => {
      try {
        const requestId = crypto.randomUUID();
        const connectionInfo = (await import("./../lib/connection-manager")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;

        if (!cid) {
          throw new Error('Not connected to server');
        }

        // Create the group request
        const request = {
          GroupCreate: {
            cid: BigInt(cid),
            request_id: requestId,
            initial_users_to_invite: initialMembers.map(m => BigInt(m.cid)),
          },
        };

        // Send the request
        const client = websocketService.getClient();
        if (!client) {
          throw new Error('WebSocket client not initialized');
        }

        await client.sendDirectToInternalService(request as any);

        // For now, return the request ID as the group ID
        // The actual group ID will come from the GroupCreated response
        return requestId;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Failed to create group';
        setError(errorMsg);
        throw e;
      }
    },
    []
  );

  // Invite a peer to a group
  const invitePeer = useCallback(
    async (groupId: string, peerCid: string, roleId?: string): Promise<void> => {
      try {
        const connectionInfo = (await import("./../lib/connection-manager")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;
        if (!cid) {
          throw new Error('Not connected to server');
        }

        const request = {
          GroupInvite: {
            cid: BigInt(cid),
            peer_cid: BigInt(peerCid),
            group_key: groupId, // TODO: Use proper group key format
            request_id: crypto.randomUUID(),
          },
        };

        const client = websocketService.getClient();
        if (!client) {
          throw new Error('WebSocket client not initialized');
        }

        await client.sendDirectToInternalService(request as any);

        // If roleId specified, store it locally for when member joins
        if (roleId) {
          // TODO: Store pending role assignment
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Failed to invite peer';
        setError(errorMsg);
        throw e;
      }
    },
    []
  );

  // Leave a group
  const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
    try {
      const connectionInfo = (await import("./../lib/connection-manager")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;
      if (!cid) {
        throw new Error('Not connected to server');
      }

      const request = {
        GroupLeave: {
          cid: BigInt(cid),
          group_key: groupId,
          request_id: crypto.randomUUID(),
        },
      };

      const client = websocketService.getClient();
      if (!client) {
        throw new Error('WebSocket client not initialized');
      }

      await client.sendDirectToInternalService(request as any);

      // Remove from local state
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to leave group';
      setError(errorMsg);
      throw e;
    }
  }, []);

  // Kick a member from a group
  const kickMember = useCallback(
    async (groupId: string, memberCid: string): Promise<void> => {
      try {
        const connectionInfo = (await import("./../lib/connection-manager")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;
        if (!cid) {
          throw new Error('Not connected to server');
        }

        const request = {
          GroupKick: {
            cid: BigInt(cid),
            peer_cid: BigInt(memberCid),
            group_key: groupId,
            request_id: crypto.randomUUID(),
          },
        };

        const client = websocketService.getClient();
        if (!client) {
          throw new Error('WebSocket client not initialized');
        }

        await client.sendDirectToInternalService(request as any);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Failed to kick member';
        setError(errorMsg);
        throw e;
      }
    },
    []
  );

  // Update a member's role (local only for now - role data is stored locally)
  const updateMemberRole = useCallback(
    async (groupId: string, memberCid: string, roleId: string): Promise<void> => {
      setGroups(prev =>
        prev.map(group => {
          if (group.id !== groupId) return group;
          return {
            ...group,
            members: group.members.map(m =>
              m.cid === memberCid ? { ...m, roleId } : m
            ),
          };
        })
      );
    },
    []
  );

  // Get a specific group by ID
  const getGroup = useCallback(
    (groupId: string): GroupConversation | undefined => {
      return groups.find(g => g.id === groupId);
    },
    [groups]
  );

  // Mark messages as read
  const markAsRead = useCallback((groupId: string): void => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId ? { ...group, unreadCount: 0 } : group
      )
    );
  }, []);

  // Refresh groups from server
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const connectionInfo = (await import("./../lib/connection-manager")).connectionManager.getConnectionInfo(); const cid = connectionInfo?.cid || null;
      if (!cid) {
        throw new Error('Not connected to server');
      }

      const request = {
        GroupListGroupsFor: {
          cid: BigInt(cid),
          peer_cid: null,
          request_id: crypto.randomUUID(),
        },
      };

      const client = websocketService.getClient();
      if (!client) {
        throw new Error('WebSocket client not initialized');
      }

      await client.sendDirectToInternalService(request as any);
      // Groups will be updated via events
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to refresh groups';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sort groups by last message time (most recent first)
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const aTime = a.lastMessageTime || 0;
      const bTime = b.lastMessageTime || 0;
      return bTime - aTime;
    });
  }, [groups]);

  return {
    groups: sortedGroups,
    loading,
    error,
    createGroup,
    invitePeer,
    leaveGroup,
    kickMember,
    updateMemberRole,
    getGroup,
    markAsRead,
    refresh,
  };
}
