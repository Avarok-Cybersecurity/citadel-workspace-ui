/**
 * usePermission Hook
 *
 * Simplified hook for checking a single permission.
 * Handles loading state and provides a reason for denied access.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePermissions, Permission } from '@/contexts/PermissionsContext';

interface UsePermissionResult {
  /** Whether the user has the permission */
  allowed: boolean;
  /** Whether permissions are being loaded */
  loading: boolean;
  /** Reason for denial (for tooltip) */
  reason: string | null;
  /** Force refresh the permission check */
  refresh: () => Promise<void>;
}

/**
 * Check if user has a specific permission for a domain
 *
 * @param domainId - The domain ID (workspace, office, or room)
 * @param permission - The permission to check
 * @returns Permission check result with loading state and denial reason
 *
 * @example
 * ```tsx
 * const { allowed, loading, reason } = usePermission(officeId, Permission.EditMdx);
 *
 * if (loading) return <Spinner />;
 * if (!allowed) return <Tooltip content={reason}><DisabledButton /></Tooltip>;
 * return <Button onClick={handleEdit}>Edit</Button>;
 * ```
 */
export function usePermission(
  domainId: string | undefined | null,
  permission: Permission
): UsePermissionResult {
  const {
    hasPermission,
    loading: contextLoading,
    fetchPermissionsForDomain,
    getDeniedReason,
    permissions,
  } = usePermissions();

  const [localLoading, setLocalLoading] = useState(false);
  // Track domains we've attempted to fetch to avoid infinite retry loops
  const attemptedFetchRef = useRef<Set<string>>(new Set());

  // Check if we need to fetch permissions for this domain
  useEffect(() => {
    if (!domainId) return;

    // If permissions aren't cached for this domain and we haven't tried yet, fetch them
    if (!permissions.has(domainId) && !attemptedFetchRef.current.has(domainId)) {
      attemptedFetchRef.current.add(domainId);
      setLocalLoading(true);
      (async () => {
        try {
          await fetchPermissionsForDomain(domainId);
        } finally {
          setLocalLoading(false);
        }
      })().catch(console.error);
    }
  }, [domainId, permissions, fetchPermissionsForDomain]);

  const refresh = useCallback(async () => {
    if (!domainId) return;
    setLocalLoading(true);
    await fetchPermissionsForDomain(domainId);
    setLocalLoading(false);
  }, [domainId, fetchPermissionsForDomain]);

  // If no domain ID, return not allowed
  if (!domainId) {
    return {
      allowed: false,
      loading: false,
      reason: 'No domain context available',
      refresh,
    };
  }

  const allowed = hasPermission(domainId, permission);
  const loading = contextLoading || localLoading;
  const reason = allowed ? null : getDeniedReason(domainId, permission);

  return {
    allowed,
    loading,
    reason,
    refresh,
  };
}

/**
 * Check if user has any of the specified permissions
 */
export function useAnyPermission(
  domainId: string | undefined | null,
  permissions: Permission[]
): UsePermissionResult {
  const {
    hasAnyPermission,
    loading: contextLoading,
    fetchPermissionsForDomain,
    getPermissionLabel,
    permissions: permissionMap,
  } = usePermissions();

  const [localLoading, setLocalLoading] = useState(false);
  // Track domains we've attempted to fetch to avoid infinite retry loops
  const attemptedFetchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!domainId) return;
    if (!permissionMap.has(domainId) && !attemptedFetchRef.current.has(domainId)) {
      attemptedFetchRef.current.add(domainId);
      setLocalLoading(true);
      (async () => {
        try {
          await fetchPermissionsForDomain(domainId);
        } finally {
          setLocalLoading(false);
        }
      })().catch(console.error);
    }
  }, [domainId, permissionMap, fetchPermissionsForDomain]);

  const refresh = useCallback(async () => {
    if (!domainId) return;
    setLocalLoading(true);
    await fetchPermissionsForDomain(domainId);
    setLocalLoading(false);
  }, [domainId, fetchPermissionsForDomain]);

  if (!domainId) {
    return {
      allowed: false,
      loading: false,
      reason: 'No domain context available',
      refresh,
    };
  }

  const allowed = hasAnyPermission(domainId, permissions);
  const loading = contextLoading || localLoading;
  const reason = allowed
    ? null
    : `You need one of these permissions: ${permissions.map(p => getPermissionLabel(p)).join(', ')}`;

  return {
    allowed,
    loading,
    reason,
    refresh,
  };
}

/**
 * Check if user has all of the specified permissions
 */
export function useAllPermissions(
  domainId: string | undefined | null,
  permissions: Permission[]
): UsePermissionResult {
  const {
    hasAllPermissions,
    loading: contextLoading,
    fetchPermissionsForDomain,
    getPermissionLabel,
    permissions: permissionMap,
  } = usePermissions();

  const [localLoading, setLocalLoading] = useState(false);
  // Track domains we've attempted to fetch to avoid infinite retry loops
  const attemptedFetchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!domainId) return;
    if (!permissionMap.has(domainId) && !attemptedFetchRef.current.has(domainId)) {
      attemptedFetchRef.current.add(domainId);
      setLocalLoading(true);
      (async () => {
        try {
          await fetchPermissionsForDomain(domainId);
        } finally {
          setLocalLoading(false);
        }
      })().catch(console.error);
    }
  }, [domainId, permissionMap, fetchPermissionsForDomain]);

  const refresh = useCallback(async () => {
    if (!domainId) return;
    setLocalLoading(true);
    await fetchPermissionsForDomain(domainId);
    setLocalLoading(false);
  }, [domainId, fetchPermissionsForDomain]);

  if (!domainId) {
    return {
      allowed: false,
      loading: false,
      reason: 'No domain context available',
      refresh,
    };
  }

  const allowed = hasAllPermissions(domainId, permissions);
  const loading = contextLoading || localLoading;
  const reason = allowed
    ? null
    : `You need all of these permissions: ${permissions.map(p => getPermissionLabel(p)).join(', ')}`;

  return {
    allowed,
    loading,
    reason,
    refresh,
  };
}

export default usePermission;
