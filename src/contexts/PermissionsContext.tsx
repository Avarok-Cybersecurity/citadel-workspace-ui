/**
 * Permissions Context
 *
 * React context for managing user permissions throughout the application.
 * Provides real-time permission state and checking utilities.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  permissionsService,
  Permission,
  DomainPermissions,
  UserRole,
  PERMISSION_LABELS,
  PERMISSION_CATEGORIES,
} from '@/lib/permissions-service';
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';

/**
 * Context type definition
 */
interface PermissionsContextType {
  // State
  permissions: Map<string, DomainPermissions>;
  loading: boolean;
  error: string | null;

  // Permission checks
  hasPermission: (domainId: string, permission: Permission) => boolean;
  hasAnyPermission: (domainId: string, permissions: Permission[]) => boolean;
  hasAllPermissions: (domainId: string, permissions: Permission[]) => boolean;

  // Role checks
  getRole: (domainId: string) => UserRole | null;
  isAdmin: (domainId: string) => boolean;
  isOwner: (domainId: string) => boolean;

  // Actions
  refreshPermissions: (domainId?: string) => Promise<void>;
  fetchPermissionsForDomain: (domainId: string) => Promise<DomainPermissions | null>;

  // Utilities
  getPermissionLabel: (permission: Permission) => string;
  getDeniedReason: (domainId: string, permission: Permission) => string;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

/**
 * Permissions Provider component
 */
export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissions, setPermissions] = useState<Map<string, DomainPermissions>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sync state with service cache
   */
  const syncWithService = useCallback(() => {
    const cached: Map<string, DomainPermissions> = permissionsService.getAllCachedPermissions();
    setPermissions(new Map(cached));
  }, []);

  /**
   * Fetch permissions for a specific domain
   */
  const fetchPermissionsForDomain = useCallback(async (domainId: string): Promise<DomainPermissions | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await permissionsService.fetchPermissions(domainId);
      // Only sync if we got a result - avoids infinite loop when no user is logged in
      if (result) {
        syncWithService();
      }
      return result;
    } catch (err) {
      const message: string = err instanceof Error ? err.message : 'Failed to fetch permissions';
      setError(message);
      debugLog('PermissionsContext', 'Error fetching permissions:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [syncWithService]);

  /**
   * Refresh all permissions or a specific domain
   */
  const refreshPermissions = useCallback(async (domainId?: string) => {
    if (domainId) {
      await fetchPermissionsForDomain(domainId);
    } else {
      // Refresh all cached domains
      const cached: Map<string, DomainPermissions> = permissionsService.getAllCachedPermissions();
      setLoading(true);
      try {
        await Promise.all(
          Array.from(cached.keys()).map(id => permissionsService.fetchPermissions(id, true))
        );
        syncWithService();
      } catch (err) {
        const message: string = err instanceof Error ? err.message : 'Failed to refresh permissions';
        setError(message);
      } finally {
        setLoading(false);
      }
    }
  }, [fetchPermissionsForDomain, syncWithService]);

  /**
   * Permission check functions (delegated to service)
   */
  const hasPermission = useCallback((domainId: string, permission: Permission): boolean => {
    return permissionsService.hasPermission(domainId, permission);
  }, []);

  const hasAnyPermission = useCallback((domainId: string, perms: Permission[]): boolean => {
    return permissionsService.hasAnyPermission(domainId, perms);
  }, []);

  const hasAllPermissions = useCallback((domainId: string, perms: Permission[]): boolean => {
    return permissionsService.hasAllPermissions(domainId, perms);
  }, []);

  /**
   * Role checks
   */
  const getRole = useCallback((domainId: string): UserRole | null => {
    return permissionsService.getRole(domainId);
  }, []);

  const isAdmin = useCallback((domainId: string): boolean => {
    return permissionsService.isAdmin(domainId);
  }, []);

  const isOwner = useCallback((domainId: string): boolean => {
    return permissionsService.isOwner(domainId);
  }, []);

  /**
   * Utilities
   */
  const getPermissionLabel = useCallback((permission: Permission): string => {
    return permissionsService.getPermissionLabel(permission);
  }, []);

  const getDeniedReason = useCallback((domainId: string, permission: Permission): string => {
    return permissionsService.getDeniedReason(domainId, permission);
  }, []);

  /**
   * Setup event listeners for real-time updates
   */
  useEffect(() => {
    // Sync initial state
    syncWithService();

    // Listen for permission updates
    const handlePermissionsUpdated = () => {
      syncWithService();
    };

    const handleRoleChanged = () => {
      syncWithService();
    };

    const handlePermissionsLoaded = () => {
      syncWithService();
    };

    eventEmitter.on('permissions:updated', handlePermissionsUpdated);
    eventEmitter.on('permissions:role-changed', handleRoleChanged);
    eventEmitter.on('user:permissions:loaded', handlePermissionsLoaded);

    return () => {
      eventEmitter.off('permissions:updated', handlePermissionsUpdated);
      eventEmitter.off('permissions:role-changed', handleRoleChanged);
      eventEmitter.off('user:permissions:loaded', handlePermissionsLoaded);
    };
  }, [syncWithService]);

  /**
   * Context value (memoized to prevent unnecessary re-renders)
   */
  const value: PermissionsContextType = useMemo<PermissionsContextType>(() => ({
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getRole,
    isAdmin,
    isOwner,
    refreshPermissions,
    fetchPermissionsForDomain,
    getPermissionLabel,
    getDeniedReason,
  }), [
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getRole,
    isAdmin,
    isOwner,
    refreshPermissions,
    fetchPermissionsForDomain,
    getPermissionLabel,
    getDeniedReason,
  ]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};

/**
 * Hook to access permissions context
 */
export function usePermissions(): PermissionsContextType {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}

// Re-export types and constants for convenience
export { Permission, PERMISSION_LABELS, PERMISSION_CATEGORIES };
export type { DomainPermissions, UserRole };
