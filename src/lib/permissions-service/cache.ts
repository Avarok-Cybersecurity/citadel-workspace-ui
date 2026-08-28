/**
 * Permissions Service - Cache Operations
 *
 * Cache management, permission checks, and role queries.
 * Pure functions operating on a cache Map.
 */

import { debugLog } from '@/lib/debug-config';
import { isPrivilegedRole } from '@/lib/role-predicate';
import { Permission, PERMISSION_LABELS } from './types';
import type { UserRole, DomainPermissions } from './types';

/**
 * Parse raw permission strings into a Permission Set, filtering unknown values.
 */
export function parsePermissionSet(permissions: string[]): Set<Permission> {
  const permSet: Set<Permission> = new Set<Permission>();
  for (const perm of permissions) {
    if (Object.values(Permission).includes(perm as Permission)) {
      permSet.add(perm as Permission);
    }
  }
  return permSet;
}

/**
 * Update the cache entry for a domain.
 */
export function updateCacheEntry(
  cache: Map<string, DomainPermissions>,
  domainId: string,
  role: UserRole,
  permissions: string[],
): void {
  const permSet: Set<Permission> = parsePermissionSet(permissions);

  cache.set(domainId, {
    domainId,
    role,
    permissions: permSet,
    lastUpdated: Date.now(),
  });

  debugLog('PermissionsService', `Cache updated for ${domainId}: ${permSet.size} permissions`);
}

/**
 * Check if user has a specific permission for a domain.
 *
 * Checks in order:
 * 1. Exact domain cache entry - role-based grant (Admin/Owner -> all)
 * 2. Exact domain cache entry - explicit Permission.All wildcard
 * 3. Exact domain cache entry - specific permission in set
 * 4. Hierarchy fallback - traverse to 'workspace-root' for inherited permissions
 */
export function hasPermission(
  cache: Map<string, DomainPermissions>,
  domainId: string,
  permission: Permission,
): boolean {
  const cached = cache.get(domainId);

  if (cached) {
    if (isPrivilegedRole(cached.role)) return true;
    if (cached.permissions.has(Permission.All)) return true;
    if (cached.permissions.has(permission)) return true;
  }

  // Hierarchy fallback: check workspace-root for inherited permissions
  if (domainId !== 'workspace-root') {
    const root = cache.get('workspace-root');
    if (root) {
      if (isPrivilegedRole(root.role)) return true;
      if (root.permissions.has(Permission.All)) return true;
      return root.permissions.has(permission);
    }
  }

  return false;
}

/**
 * Get user's role for a domain, with hierarchy fallback to workspace-root.
 */
export function getRole(
  cache: Map<string, DomainPermissions>,
  domainId: string,
): UserRole | null {
  const cached = cache.get(domainId);
  if (cached?.role) return cached.role;

  if (domainId !== 'workspace-root') {
    const root = cache.get('workspace-root');
    if (root?.role) return root.role;
  }

  return null;
}

/**
 * Get reason message for denied permission.
 */
export function getDeniedReason(
  cache: Map<string, DomainPermissions>,
  domainId: string,
  permission: Permission,
): string {
  const cached = cache.get(domainId);
  if (!cached) {
    return 'Permissions have not been loaded for this domain';
  }

  const label: string = PERMISSION_LABELS[permission] || permission;
  const roleLabel = typeof cached.role === 'string' ? cached.role : 'Custom';
  return `You don't have the "${label}" permission. Your role: ${roleLabel}`;
}
