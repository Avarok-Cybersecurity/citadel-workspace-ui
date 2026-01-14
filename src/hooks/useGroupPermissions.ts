/**
 * useGroupPermissions Hook
 *
 * Checks permissions for the current user within a group.
 * Provides role-based access control for group operations.
 */

import { useMemo, useCallback } from 'react';
import { connectionManager } from '@/lib/connection-manager';
import type {
  GroupConversation,
  GroupRole,
  GroupMember,
  GroupPermissions,
} from '@/types/group';
import { canManageUser } from '@/types/group';

// ============================================================================
// Types
// ============================================================================

interface UseGroupPermissionsResult {
  /** Current user's role in this group */
  myRole: GroupRole | undefined;
  /** Current user's member info */
  myMember: GroupMember | undefined;
  /** Whether current user is the group owner */
  isOwner: boolean;
  /** Whether current user is a group admin (has manageRoles permission) */
  isAdmin: boolean;
  /** Check if user can perform a specific action */
  can: (action: keyof GroupPermissions) => boolean;
  /** Check if user can manage a specific member */
  canManageMember: (memberCid: string) => boolean;
  /** Check if user can manage a specific role */
  canManageRole: (roleId: string) => boolean;
  /** Check if user can assign a specific role */
  canAssignRole: (roleId: string) => boolean;
  /** Get all permissions as a map for easy checking */
  permissions: GroupPermissions;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGroupPermissions(
  group: GroupConversation
): UseGroupPermissionsResult {
  const connectionInfo = connectionManager.getConnectionInfo();
  const currentCid = connectionInfo?.cid;

  // Find current user's member info
  const myMember = useMemo(() => {
    if (!currentCid) return undefined;
    return group.members.find(m => m.cid === currentCid);
  }, [group.members, currentCid]);

  // Find current user's role
  const myRole = useMemo(() => {
    if (!myMember) return undefined;
    return group.settings.roles.find(r => r.id === myMember.roleId);
  }, [myMember, group.settings.roles]);

  // Check if owner
  const isOwner = useMemo(() => {
    return currentCid === group.ownerId;
  }, [currentCid, group.ownerId]);

  // Check if admin (has manageRoles permission)
  const isAdmin = useMemo(() => {
    if (!myRole) return false;
    return myRole.permissions.manageRoles || isOwner;
  }, [myRole, isOwner]);

  // Get permissions object (with owner override)
  const permissions = useMemo((): GroupPermissions => {
    if (isOwner) {
      // Owner has all permissions
      return {
        sendMessages: true,
        viewMemberList: true,
        inviteMembers: true,
        kickMembers: true,
        manageRoles: true,
        assignRoles: true,
        editGroupSettings: true,
        deleteGroup: true,
      };
    }

    if (!myRole) {
      // No role = no permissions
      return {
        sendMessages: false,
        viewMemberList: false,
        inviteMembers: false,
        kickMembers: false,
        manageRoles: false,
        assignRoles: false,
        editGroupSettings: false,
        deleteGroup: false,
      };
    }

    return myRole.permissions;
  }, [myRole, isOwner]);

  // Check if can perform action
  const can = useCallback(
    (action: keyof GroupPermissions): boolean => {
      return permissions[action];
    },
    [permissions]
  );

  // Check if can manage a member
  const canManageMember = useCallback(
    (memberCid: string): boolean => {
      if (!currentCid || memberCid === currentCid) return false; // Cannot manage self
      if (!myRole) return false;
      if (!permissions.kickMembers && !permissions.assignRoles) return false;

      const targetMember = group.members.find(m => m.cid === memberCid);
      if (!targetMember) return false;

      const targetRole = group.settings.roles.find(r => r.id === targetMember.roleId);
      if (!targetRole) return false;

      // Check hierarchy
      return canManageUser(myRole, targetRole);
    },
    [currentCid, myRole, permissions, group.members, group.settings.roles]
  );

  // Check if can manage a role
  const canManageRole = useCallback(
    (roleId: string): boolean => {
      if (!myRole) return false;
      if (!permissions.manageRoles) return false;

      const targetRole = group.settings.roles.find(r => r.id === roleId);
      if (!targetRole) return false;

      // Cannot manage built-in roles
      if (targetRole.isBuiltIn) return false;

      // Check hierarchy
      return canManageUser(myRole, targetRole);
    },
    [myRole, permissions.manageRoles, group.settings.roles]
  );

  // Check if can assign a role
  const canAssignRole = useCallback(
    (roleId: string): boolean => {
      if (!myRole) return false;
      if (!permissions.assignRoles) return false;

      const targetRole = group.settings.roles.find(r => r.id === roleId);
      if (!targetRole) return false;

      // Can only assign roles below own position
      return myRole.position > targetRole.position;
    },
    [myRole, permissions.assignRoles, group.settings.roles]
  );

  return {
    myRole,
    myMember,
    isOwner,
    isAdmin,
    can,
    canManageMember,
    canManageRole,
    canAssignRole,
    permissions,
  };
}

/**
 * Hook for checking a single permission quickly
 */
export function useGroupPermission(
  group: GroupConversation,
  action: keyof GroupPermissions
): boolean {
  const { can } = useGroupPermissions(group);
  return can(action);
}
