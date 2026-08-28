/**
 * useGroupConversations Hook
 *
 * Orchestrator that composes state management, event handling, and
 * group action callbacks into a single hook interface.
 *
 * This is ad-hoc Citadel message groups — NOT the office/room chat that hangs
 * off a workspace node via chat_enabled. The two are separate mechanisms with
 * confusingly similar names, and the group-messaging integration specs cover the
 * other one.
 *
 * It was inert until recently, in three independent ways, all now closed:
 *
 * 1. Nothing fed the group list. useGroupState subscribes to group:created,
 *    group:invite-received, group:member-joined, group:member-left and
 *    group:deleted; nothing emitted any of them and GroupCreateSuccess was
 *    handled nowhere, so createGroup fired its request, the response was
 *    dropped, and the sidebar stayed empty. lib/group-conversations/
 *    group-response-service.ts now translates those responses into events.
 *
 * 2. group_key was sent as a string where the backend wants
 *    MessageGroupKey { cid: u64, mgid: u128 }, so GroupInvite / GroupLeave /
 *    GroupKick / GroupEnd could not deserialize. tsc could not see it because
 *    toInternalServiceRequest is a bare cast. groupIdToKey now encodes at every
 *    send site, and group-key.ts is the single place that knows the format.
 *
 * 3. invitePeer had no caller. The group settings panel now offers an invite
 *    control to members whose role permits it.
 */

import { useCallback } from 'react';
import { markGroupRead } from '@/lib/group-conversations/mark-group-read';
import type { UseGroupConversationsResult } from './use-group-conversations.types';
import { useGroupState, useSortedGroups } from './use-group-state';
import {
  sendGroupCreate,
  sendGroupInvite,
  sendGroupLeave,
  sendGroupKick,
  sendGroupListRequest,
} from '@/lib/group-conversations/group-requests';

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGroupConversations(): UseGroupConversationsResult {
  const { groups, setGroups, hydrated, loading, setLoading, error, setError } = useGroupState();
  const sortedGroups = useSortedGroups(groups);

  // Create a new group
  const createGroup = useCallback(
    async (
      name: string,
      initialMembers: Array<{ cid: string; username: string; roleId?: string }>
    ): Promise<string> => {
      try {
        return await sendGroupCreate(initialMembers);
      } catch (e) {
        const errorMsg: string = e instanceof Error ? e.message : 'Failed to create group';
        setError(errorMsg);
        throw e;
      }
    },
    [setError]
  );

  // Invite a peer to a group
  const invitePeer = useCallback(
    async (groupId: string, peerCid: string): Promise<void> => {
      try {
        await sendGroupInvite(groupId, peerCid);
      } catch (e) {
        const errorMsg: string = e instanceof Error ? e.message : 'Failed to invite peer';
        setError(errorMsg);
        throw e;
      }
    },
    [setError]
  );

  // Leave a group
  const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
    try {
      await sendGroupLeave(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (e) {
      const errorMsg: string = e instanceof Error ? e.message : 'Failed to leave group';
      setError(errorMsg);
      throw e;
    }
  }, [setError, setGroups]);

  // Kick a member from a group
  const kickMember = useCallback(
    async (groupId: string, memberCid: string): Promise<void> => {
      try {
        await sendGroupKick(groupId, memberCid);
      } catch (e) {
        const errorMsg: string = e instanceof Error ? e.message : 'Failed to kick member';
        setError(errorMsg);
        throw e;
      }
    },
    [setError]
  );

  // Update a member's role (local only for now - role data is stored locally)
  const updateMemberRole = useCallback(
    async (groupId: string, memberCid: string, roleId: string): Promise<void> => {
      const memberCidBigint: bigint = BigInt(memberCid);
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

  // Mark messages as read.
  //
  // Returning `prev` unchanged is load-bearing, not a micro-optimisation. The
  // store's only no-op guard is identity (`if (next === groups) return`), and a
  // `map` always allocates -- so this notified every subscriber and wrote to
  // IndexedDB on every call, even when the count was already zero. The group
  // page calls it from an effect whose deps include `getGroup`, whose identity
  // is derived from `groups`: new array, new getGroup, effect re-runs, call
  // again. Opening any group chat was a perpetual render-and-write loop that
  // ended either in a hot tab or in React's "Maximum update depth exceeded".
  const markAsRead = useCallback((groupId: string): void => {
    setGroups(prev => markGroupRead(prev, groupId));
  }, [setGroups]);

  // Refresh groups from server
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      await sendGroupListRequest();
    } catch (e) {
      const errorMsg: string = e instanceof Error ? e.message : 'Failed to refresh groups';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading]);

  return {
    groups: sortedGroups,
    hydrated,
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
