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
import type { UseGroupRolesResult } from './use-group-roles-types';

export function useGroupRoles(
  group: GroupConversation,
  onSettingsChange: (settings: GroupSettings) => void
): UseGroupRolesResult {
  const { settings } = group;
  const { roles } = settings;

  const sortedRoles: GroupRole[] = useMemo(() => {
    return [...roles].sort((a, b) => b.position - a.position);
  }, [roles]);

  const defaultRole = useMemo(() => {
    return roles.find(r => r.isDefault);
  }, [roles]);

  const ownerRole = useMemo(() => {
    return roles.find(r => r.isBuiltIn && r.position === 100);
  }, [roles]);

  const getRoleById = useCallback(
    (roleId: string): GroupRole | undefined => {
      return roles.find(r => r.id === roleId);
    },
    [roles]
  );

  const canManageRole = useCallback(
    (actorRoleId: string, targetRoleId: string): boolean => {
      const actorRole = getRoleById(actorRoleId);
      const targetRole = getRoleById(targetRoleId);

      if (!actorRole || !targetRole) return false;
      if (targetRole.isBuiltIn) return false;

      return canManageUser(actorRole, targetRole);
    },
    [getRoleById]
  );

  const validatePosition = useCallback(
    (position: number, excludeRoleId?: string): boolean => {
      if (position < 1 || position > 99) return false;

      return !roles.some(
        r => r.position === position && r.id !== excludeRoleId
      );
    },
    [roles]
  );

  const suggestPosition = useCallback((): number => {
    const nonOwnerRoles: GroupRole[] = roles.filter(r => !r.isBuiltIn);
    if (nonOwnerRoles.length === 0) return 50;

    const lowestPosition: number = Math.min(...nonOwnerRoles.map(r => r.position));
    const suggested: number = Math.floor(lowestPosition / 2);

    return suggested > 0 ? suggested : 5;
  }, [roles]);

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

  const updateRole = useCallback(
    (
      roleId: string,
      updates: Partial<Omit<GroupRole, 'id' | 'isBuiltIn'>>
    ): GroupSettings => {
      const updatedRoles: GroupRole[] = roles.map(role => {
        if (role.id !== roleId) return role;

        if (role.isBuiltIn) {
          return {
            ...role,
            name: updates.name ?? role.name,
            color: updates.color ?? role.color,
          };
        }

        return { ...role, ...updates };
      });

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

  const deleteRole = useCallback(
    (roleId: string): GroupSettings => {
      const roleToDelete = getRoleById(roleId);

      if (!roleToDelete || roleToDelete.isBuiltIn || roleToDelete.isDefault) {
        debugLog('UseGroupRoles', 'Cannot delete built-in or default role');
        return settings;
      }

      const updatedRoles: GroupRole[] = roles.filter(r => r.id !== roleId);

      const updatedSettings: GroupSettings = {
        ...settings,
        roles: updatedRoles,
      };

      onSettingsChange(updatedSettings);
      return updatedSettings;
    },
    [roles, settings, getRoleById, onSettingsChange]
  );

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
