/**
 * Group Helper Functions
 *
 * Utility functions for group permission checks, role resolution,
 * and member sorting.
 */

import type { GroupRole, GroupPermissions } from './group-permissions';
import type { GroupSettings, GroupMemberWithRole } from './group-entities';

/**
 * Check if a user can perform an action based on their role
 */
export function canPerformAction(
  userRole: GroupRole,
  action: keyof GroupPermissions
): boolean {
  return userRole.permissions[action];
}

/**
 * Check if a user can manage another user based on role hierarchy
 */
export function canManageUser(
  actorRole: GroupRole,
  targetRole: GroupRole
): boolean {
  return actorRole.position > targetRole.position;
}

/**
 * Get the owner role from a group's settings
 */
export function getOwnerRole(settings: GroupSettings): GroupRole | undefined {
  return settings.roles.find(r => r.isBuiltIn && r.position === 100);
}

/**
 * Get the default role for new members
 */
export function getDefaultRole(settings: GroupSettings): GroupRole | undefined {
  return settings.roles.find(r => r.isDefault);
}

/**
 * Sort members: owner first, then by role position (desc), then alphabetical
 */
export function sortMembers(
  members: GroupMemberWithRole[]
): GroupMemberWithRole[] {
  return [...members].sort((a, b) => {
    if (a.role.position !== b.role.position) {
      return b.role.position - a.role.position;
    }
    return a.username.localeCompare(b.username);
  });
}
