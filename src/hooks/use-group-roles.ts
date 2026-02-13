/**
 * useGroupRoles Hook
 *
 * Manages roles for a specific group.
 * Handles role CRUD operations with hierarchy validation.
 */

import { useCallback, useMemo } from 'react';
import type {
  GroupRole,
  GroupSettings,
  GroupPermissions,
  GroupConversation,
} from '@/types/group';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  canManageUser,
} from '@/types/group';
import { debugLog } from '@/lib/debug-config';

// ============================================================================
// Types
// ============================================================================

interface UseGroupRolesResult {
  /** All roles in this group, sorted by position (highest first) */
  roles: GroupRole[];
  /** The default role for new members */
  defaultRole: GroupRole | undefined;
  /** The owner role */
  ownerRole: GroupRole | undefined;
  /** Create a new role */
  createRole: (
    name: string,
    position: number,
    permissions: GroupPermissions,
    color?: string
  ) => GroupRole;
  /** Update an existing role */
  updateRole: (roleId: string, updates: Partial<Omit<GroupRole, 'id' | 'isBuiltIn'>>) => GroupSettings;
  /** Delete a role (cannot delete built-in or default roles) */
  deleteRole: (roleId: string) => GroupSettings;
  /** Set the default role for new members */
  setDefaultRole: (roleId: string) => GroupSettings;
  /** Get role by ID */
  getRoleById: (roleId: string) => GroupRole | undefined;
  /** Check if a role can be managed by another role */
  canManageRole: (actorRoleId: string, targetRoleId: string) => boolean;
  /** Validate that a position is unique and within range */
  validatePosition: (position: number, excludeRoleId?: string) => boolean;
  /** Get the next available position for a new role */
  suggestPosition: () => number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGroupRoles(
  group: GroupConversation,
  onSettingsChange: (settings: GroupSettings) => void
): UseGroupRolesResult {
  const { settings } = group;
  const { roles } = settings;

  // Sort roles by position (highest first)
  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => b.position - a.position);
  }, [roles]);

  // Get the default role
  const defaultRole = useMemo(() => {
    return roles.find(r => r.isDefault);
  }, [roles]);

  // Get the owner role (built-in with highest position)
  const ownerRole = useMemo(() => {
    return roles.find(r => r.isBuiltIn && r.position === 100);
  }, [roles]);

  // Get role by ID
  const getRoleById = useCallback(
    (roleId: string): GroupRole | undefined => {
      return roles.find(r => r.id === roleId);
    },
    [roles]
  );

  // Check if a role can manage another role
  const canManageRole = useCallback(
    (actorRoleId: string, targetRoleId: string): boolean => {
      const actorRole = getRoleById(actorRoleId);
      const targetRole = getRoleById(targetRoleId);

      if (!actorRole || !targetRole) return false;
      if (targetRole.isBuiltIn) return false; // Cannot manage built-in roles

      return canManageUser(actorRole, targetRole);
    },
    [getRoleById]
  );

  // Validate position
  const validatePosition = useCallback(
    (position: number, excludeRoleId?: string): boolean => {
      if (position < 1 || position > 99) return false; // 100 is reserved for owner

      return !roles.some(
        r => r.position === position && r.id !== excludeRoleId
      );
    },
    [roles]
  );

  // Suggest next position (midpoint between lowest non-owner and 1)
  const suggestPosition = useCallback((): number => {
    const nonOwnerRoles = roles.filter(r => !r.isBuiltIn);
    if (nonOwnerRoles.length === 0) return 50;

    const lowestPosition = Math.min(...nonOwnerRoles.map(r => r.position));
    const suggested = Math.floor(lowestPosition / 2);

    return suggested > 0 ? suggested : 5;
  }, [roles]);

  // Create a new role
  const createRole = useCallback(
    (
      name: string,
      position: number,
      permissions: GroupPermissions,
      color?: string
    ): GroupRole => {
      const newRole: GroupRole = {
        id: crypto.randomUUID(),
        name,
        position,
        color,
        permissions,
        isDefault: false,
        isBuiltIn: false,
      };

      const updatedSettings: GroupSettings = {
        ...settings,
        roles: [...roles, newRole],
      };

      onSettingsChange(updatedSettings);
      return newRole;
    },
    [roles, settings, onSettingsChange]
  );

  // Update an existing role
  const updateRole = useCallback(
    (
      roleId: string,
      updates: Partial<Omit<GroupRole, 'id' | 'isBuiltIn'>>
    ): GroupSettings => {
      const updatedRoles = roles.map(role => {
        if (role.id !== roleId) return role;

        // Cannot modify certain properties of built-in roles
        if (role.isBuiltIn) {
          // Only allow color and name changes for built-in roles
          return {
            ...role,
            name: updates.name ?? role.name,
            color: updates.color ?? role.color,
          };
        }

        return { ...role, ...updates };
      });

      // If setting a new default, unset the old one
      if (updates.isDefault === true) {
        updatedRoles.forEach(r => {
          if (r.id !== roleId) {
            r.isDefault = false;
          }
        });
      }

      const updatedSettings: GroupSettings = {
        ...settings,
        roles: updatedRoles,
        defaultRoleId: updates.isDefault ? roleId : settings.defaultRoleId,
      };

      onSettingsChange(updatedSettings);
      return updatedSettings;
    },
    [roles, settings, onSettingsChange]
  );

  // Delete a role
  const deleteRole = useCallback(
    (roleId: string): GroupSettings => {
      const roleToDelete = getRoleById(roleId);

      // Cannot delete built-in or default roles
      if (!roleToDelete || roleToDelete.isBuiltIn || roleToDelete.isDefault) {
        debugLog('UseGroupRoles', 'Cannot delete built-in or default role');
        return settings;
      }

      // Move members with this role to the default role
      // (This should be handled by the parent component)

      const updatedRoles = roles.filter(r => r.id !== roleId);

      const updatedSettings: GroupSettings = {
        ...settings,
        roles: updatedRoles,
      };

      onSettingsChange(updatedSettings);
      return updatedSettings;
    },
    [roles, settings, getRoleById, onSettingsChange]
  );

  // Set the default role
  const setDefaultRole = useCallback(
    (roleId: string): GroupSettings => {
      const updatedRoles = roles.map(role => ({
        ...role,
        isDefault: role.id === roleId,
      }));

      const updatedSettings: GroupSettings = {
        ...settings,
        roles: updatedRoles,
        defaultRoleId: roleId,
      };

      onSettingsChange(updatedSettings);
      return updatedSettings;
    },
    [roles, settings, onSettingsChange]
  );

  return {
    roles: sortedRoles,
    defaultRole,
    ownerRole,
    createRole,
    updateRole,
    deleteRole,
    setDefaultRole,
    getRoleById,
    canManageRole,
    validatePosition,
    suggestPosition,
  };
}

/**
 * Create default permissions for a new role
 */
export function createEmptyPermissions(): GroupPermissions {
  return { ...DEFAULT_MEMBER_PERMISSIONS };
}
