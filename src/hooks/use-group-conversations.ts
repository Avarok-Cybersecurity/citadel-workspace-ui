/**
 * useGroupConversations Hook
 *
 * Orchestrator that composes state management, event handling, and
 * group action callbacks into a single hook interface.
 */

import { useCallback } from 'react';
import { websocketService } from '@/lib/websocket-service';
import type { UseGroupConversationsResult } from './use-group-conversations.types';
import { toInternalServiceRequest } from './use-group-conversations.types';
import { useGroupState, useSortedGroups } from './use-group-state';

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGroupConversations(): UseGroupConversationsResult {
  const { groups, setGroups, loading, setLoading, error, setError } = useGroupState();
  const sortedGroups = useSortedGroups(groups);

  // Create a new group
  const createGroup = useCallback(
    async (
      name: string,
      initialMembers: Array<{ cid: string; username: string; roleId?: string }>
    ): Promise<string> => {
      try {
        const requestId = crypto.randomUUID();
        const connectionInfo = (await import("../lib/connection")).connectionManager.getConnectionInfo();
        const cid = connectionInfo?.cid || null;

        if (!cid) {
          throw new Error('Not connected to server');
        }

        const request = {
          GroupCreate: {
            cid: BigInt(cid),
            request_id: requestId,
            initial_users_to_invite: initialMembers.map(m => BigInt(m.cid)),
          },
        };

        const client = websocketService.getClient();
        if (!client) {
          throw new Error('WebSocket client not initialized');
        }

        await client.sendDirectToInternalService(toInternalServiceRequest(request));
        return requestId;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Failed to create group';
        setError(errorMsg);
        throw e;
      }
    },
    [setError]
  );

  // Invite a peer to a group
  const invitePeer = useCallback(
    async (groupId: string, peerCid: string, roleId?: string): Promise<void> => {
      try {
        const connectionInfo = (await import("../lib/connection")).connectionManager.getConnectionInfo();
        const cid = connectionInfo?.cid || null;
        if (!cid) {
          throw new Error('Not connected to server');
        }

        const request = {
          GroupInvite: {
            cid: BigInt(cid),
            peer_cid: BigInt(peerCid),
            group_key: groupId, // @human-review Verify group key format matches backend
            request_id: crypto.randomUUID(),
          },
        };

        const client = websocketService.getClient();
        if (!client) {
          throw new Error('WebSocket client not initialized');
        }

        await client.sendDirectToInternalService(toInternalServiceRequest(request));

        if (roleId) {
          // @human-review Role assignment storage needs backend API
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Failed to invite peer';
        setError(errorMsg);
        throw e;
      }
    },
    [setError]
  );

  // Leave a group
  const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
    try {
      const connectionInfo = (await import("../lib/connection")).connectionManager.getConnectionInfo();
      const cid = connectionInfo?.cid || null;
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

      await client.sendDirectToInternalService(toInternalServiceRequest(request));
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to leave group';
      setError(errorMsg);
      throw e;
    }
  }, [setError, setGroups]);

  // Kick a member from a group
  const kickMember = useCallback(
    async (groupId: string, memberCid: string): Promise<void> => {
      try {
        const connectionInfo = (await import("../lib/connection")).connectionManager.getConnectionInfo();
        const cid = connectionInfo?.cid || null;
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

        await client.sendDirectToInternalService(toInternalServiceRequest(request));
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Failed to kick member';
        setError(errorMsg);
        throw e;
      }
    },
    [setError]
  );

  // Update a member's role (local only for now - role data is stored locally)
  const updateMemberRole = useCallback(
    async (groupId: string, memberCid: string, roleId: string): Promise<void> => {
      const memberCidBigint = BigInt(memberCid);
      setGroups(prev =>
        prev.map(group => {
          if (group.id !== groupId) return group;
          return {
            ...group,
            members: group.members.map(m =>
              m.cid === memberCidBigint ? { ...m, roleId } : m
            ),
          };
        })
      );
    },
    [setGroups]
  );

  // Get a specific group by ID
  const getGroup = useCallback(
    (groupId: string) => groups.find(g => g.id === groupId),
    [groups]
  );

  // Mark messages as read
  const markAsRead = useCallback((groupId: string): void => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId ? { ...group, unreadCount: 0 } : group
      )
    );
  }, [setGroups]);

  // Refresh groups from server
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const connectionInfo = (await import("../lib/connection")).connectionManager.getConnectionInfo();
      const cid = connectionInfo?.cid || null;
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

      await client.sendDirectToInternalService(toInternalServiceRequest(request));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to refresh groups';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading]);

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
