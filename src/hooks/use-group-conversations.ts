/**
 * useGroupConversations Hook
 *
 * Orchestrator that composes state management, event handling, and
 * group action callbacks into a single hook interface.
 *
 * ============================================================================
 * KNOWN GAP: ad-hoc group conversations do not work end to end.
 * ============================================================================
 *
 * This is NOT the group chat that works. Office and room chat — the feature the
 * group-messaging specs cover — is a different mechanism entirely: chat attached
 * to a workspace node via `chat_enabled` / `chat_channel_id`, reached through the
 * office/room Chat tab. That path is fine. This hook is a second, parallel
 * implementation of ad-hoc Citadel message groups, and it is inert.
 *
 * Do not read the passing group-messaging specs as coverage of this file.
 *
 * Three independent breaks, any one of which is sufficient:
 *
 * 1. Nothing feeds the group list. `useGroupState` subscribes to `group:created`,
 *    `group:member-joined`, `group:member-left` and `group:deleted`; NOTHING in
 *    the codebase emits any of them, and `GroupCreateSuccess` from the internal
 *    service is handled nowhere. `createGroup` fires GroupCreate and returns its
 *    request_id, the response is dropped, and `groups` stays empty forever.
 *
 * 2. The group_key format is wrong. GroupInvite, GroupLeave, GroupKick and
 *    GroupEnd all send `group_key: groupId`, a string. The backend field is
 *    `MessageGroupKey { cid: u64, mgid: u128 }` (citadel_types proto/mod.rs:334).
 *    `toInternalServiceRequest` is a bare cast to InternalServiceRequest, so this
 *    mismatch is invisible to tsc — which is why it survived.
 *
 * 3. `invitePeer` has no caller anywhere, and its `roleId` argument leads to an
 *    empty `if (roleId) {}` block, so a role passed by any future caller would be
 *    silently discarded.
 *
 * What a user sees: the sidebar "Create Group" dialog is wired to `createGroup`
 * and submits successfully, the dialog closes, and the group never appears —
 * no error, no toast, no entry. The /groups/:groupId route exists but nothing
 * ever links to it, because the list it would be reached from is always empty.
 *
 * Left in place rather than deleted because it is a product decision, not a
 * cleanup: office/room chat may already cover the need, in which case this and
 * its Create Group entry point should go. If ad-hoc groups ARE wanted, fixing it
 * means handling the GroupCreateSuccess/GroupInvite/GroupMemberJoined responses
 * and emitting the events, plus sending group_key as {cid, mgid}. Marked inert
 * rather than left looking finished — a file that reads as working is worse than
 * one that admits it is not, because people trust it instead of checking.
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
            // WRONG FORMAT - see KNOWN GAP at the top of this file. The backend
            // field is MessageGroupKey { cid: u64, mgid: u128 }, not a string.
            group_key: groupId,
            request_id: crypto.randomUUID(),
          },
        };

        const client = websocketService.getClient();
        if (!client) {
          throw new Error('WebSocket client not initialized');
        }

        await client.sendDirectToInternalService(toInternalServiceRequest(request));

        // roleId is accepted by the signature but there is nowhere to put it:
        // GroupInvite carries no role, and no group-role store exists. It is
        // dropped rather than silently pretended - see KNOWN GAP above.
        void roleId;
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
