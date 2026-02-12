/**
 * Permissions Service
 *
 * Handles fetching, caching, and real-time updates of user permissions.
 * Provides a centralized service for permission checks throughout the UI.
 */

import { eventEmitter } from './event-emitter';
import WorkspaceService from './workspace-service';
import { connectionManager } from './connection';
import { EventListenerManager } from './utils/event-listener-manager';
import { debugLog } from '@/lib/debug-config';

/**
 * Permission enum matching Rust Permission type from citadel-workspace-types
 */
export enum Permission {
  // Wildcard permission
  All = 'All',
  // Node permissions (generic - applies to offices, rooms, etc.)
  CreateNode = 'CreateNode',
  DeleteNode = 'DeleteNode',
  UpdateNode = 'UpdateNode',
  AddNode = 'AddNode',
  EditNodeConfig = 'EditNodeConfig',
  UpdateNodeSettings = 'UpdateNodeSettings',
  ManageNodeMembers = 'ManageNodeMembers',
  // Workspace permissions
  CreateWorkspace = 'CreateWorkspace',
  UpdateWorkspace = 'UpdateWorkspace',
  DeleteWorkspace = 'DeleteWorkspace',
  EditWorkspaceConfig = 'EditWorkspaceConfig',
  // Content permissions
  ViewContent = 'ViewContent',
  EditContent = 'EditContent',
  EditMdx = 'EditMdx',
  // User management
  AddUsers = 'AddUsers',
  RemoveUsers = 'RemoveUsers',
  BanUser = 'BanUser',
  // Messaging
  SendMessages = 'SendMessages',
  ReadMessages = 'ReadMessages',
  // Files
  UploadFiles = 'UploadFiles',
  DownloadFiles = 'DownloadFiles',
  // Admin
  ManageDomains = 'ManageDomains',
  ConfigureSystem = 'ConfigureSystem',
}

/**
 * User role matching Rust UserRole type
 */
export type UserRole = 'Admin' | 'Owner' | 'Member' | 'Guest' | 'Banned' | { Custom: [string, number] };

/**
 * Permission set for a specific domain
 */
export interface DomainPermissions {
  domainId: string;
  role: UserRole;
  permissions: Set<Permission>;
  lastUpdated: number;
}

/**
 * Human-readable labels for permissions
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.All]: 'All Permissions',
  [Permission.CreateNode]: 'Create Node',
  [Permission.DeleteNode]: 'Delete Node',
  [Permission.UpdateNode]: 'Update Node',
  [Permission.AddNode]: 'Add Node',
  [Permission.EditNodeConfig]: 'Edit Node Config',
  [Permission.UpdateNodeSettings]: 'Update Node Settings',
  [Permission.ManageNodeMembers]: 'Manage Node Members',
  [Permission.CreateWorkspace]: 'Create Workspace',
  [Permission.UpdateWorkspace]: 'Update Workspace',
  [Permission.DeleteWorkspace]: 'Delete Workspace',
  [Permission.EditWorkspaceConfig]: 'Edit Workspace Config',
  [Permission.ViewContent]: 'View Content',
  [Permission.EditContent]: 'Edit Content',
  [Permission.EditMdx]: 'Edit MDX Content',
  [Permission.AddUsers]: 'Add Users',
  [Permission.RemoveUsers]: 'Remove Users',
  [Permission.BanUser]: 'Ban User',
  [Permission.SendMessages]: 'Send Messages',
  [Permission.ReadMessages]: 'Read Messages',
  [Permission.UploadFiles]: 'Upload Files',
  [Permission.DownloadFiles]: 'Download Files',
  [Permission.ManageDomains]: 'Manage Domains',
  [Permission.ConfigureSystem]: 'Configure System',
};

/**
 * Permission categories for UI grouping
 */
export const PERMISSION_CATEGORIES = {
  content: {
    label: 'Content',
    permissions: [Permission.ViewContent, Permission.EditContent, Permission.EditMdx],
  },
  messaging: {
    label: 'Messaging',
    permissions: [Permission.SendMessages, Permission.ReadMessages],
  },
  files: {
    label: 'Files',
    permissions: [Permission.UploadFiles, Permission.DownloadFiles],
  },
  nodes: {
    label: 'Nodes',
    permissions: [
      Permission.CreateNode,
      Permission.UpdateNode,
      Permission.DeleteNode,
      Permission.AddNode,
      Permission.EditNodeConfig,
      Permission.UpdateNodeSettings,
      Permission.ManageNodeMembers,
    ],
  },
  workspace: {
    label: 'Workspace',
    permissions: [
      Permission.CreateWorkspace,
      Permission.UpdateWorkspace,
      Permission.DeleteWorkspace,
      Permission.EditWorkspaceConfig,
    ],
  },
  users: {
    label: 'User Management',
    permissions: [Permission.AddUsers, Permission.RemoveUsers, Permission.BanUser],
  },
  admin: {
    label: 'Administration',
    permissions: [Permission.ManageDomains, Permission.ConfigureSystem, Permission.All],
  },
} as const;

/**
 * Permissions Service singleton
 *
 * Extends EventListenerManager for automatic event listener cleanup.
 */
class PermissionsService extends EventListenerManager {
  private static instance: PermissionsService;
  private cache: Map<string, DomainPermissions> = new Map();
  private pendingRequests: Map<string, Promise<DomainPermissions>> = new Map();
  private initialized = false;

  private constructor() {
    super();
    this.setupEventListeners();
  }

  public static getInstance(): PermissionsService {
    if (!PermissionsService.instance) {
      PermissionsService.instance = new PermissionsService();
    }
    return PermissionsService.instance;
  }

  /**
   * Setup event listeners for permission updates.
   * Uses EventListenerManager base class for automatic cleanup.
   */
  protected setupEventListeners(): void {
    // Listen for permission responses from server
    this.listen<{
      userId: string;
      role: UserRole;
      permissions: string[];
      domainId: string;
    }>('user:permissions:loaded', (payload) => {
      const currentUser = this.getCurrentUserId();
      if (payload.userId === currentUser) {
        this.updateCache(payload.domainId, payload.role, payload.permissions);
      }
    });

    // Listen for permission update notifications (when admin changes permissions)
    this.listen<{
      userId: string;
      domainId: string;
      permissions: string[];
      operation: 'add' | 'remove' | 'set';
    }>('member:permissions-updated', async (payload) => {
      const currentUser = this.getCurrentUserId();
      if (payload.userId === currentUser) {
        // Refetch permissions to get the updated set
        await this.fetchPermissions(payload.domainId, true);
        this.emit('permissions:updated', { domainId: payload.domainId });
      }
    });

    // Listen for role updates
    this.listen<{ userId: string; role: UserRole }>('member:role-updated', (payload) => {
      const currentUser = this.getCurrentUserId();
      if (payload.userId === currentUser) {
        // Role change affects all domains - clear cache and refetch
        this.clearCache();
        this.emit('permissions:role-changed', { role: payload.role });
      }
    });

    this.initialized = true;
  }

  /**
   * Get current user ID from connection manager
   */
  private getCurrentUserId(): string | null {
    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.username || null;
  }

  /**
   * Update cache with new permissions
   */
  private updateCache(domainId: string, role: UserRole, permissions: string[]): void {
    const permSet = new Set<Permission>();
    for (const perm of permissions) {
      if (Object.values(Permission).includes(perm as Permission)) {
        permSet.add(perm as Permission);
      }
    }

    this.cache.set(domainId, {
      domainId,
      role,
      permissions: permSet,
      lastUpdated: Date.now(),
    });

    debugLog('PermissionsService', `[PermissionsService] Cache updated for ${domainId}: ${permSet.size} permissions`);
  }

  /**
   * Fetch permissions for a specific domain
   */
  public async fetchPermissions(domainId: string, forceRefresh = false): Promise<DomainPermissions | null> {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(domainId);
      if (cached && Date.now() - cached.lastUpdated < 60000) { // 1 minute cache
        return cached;
      }
    }

    // Check for pending request (deduplication)
    const pending = this.pendingRequests.get(domainId);
    if (pending) {
      return pending;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      console.warn('[PermissionsService] No current user, cannot fetch permissions');
      return null;
    }

    // Create promise for this request
    const requestPromise = (async () => {
      try {
        await WorkspaceService.getUserPermissions(userId, domainId);

        // Wait for event response (with timeout)
        return new Promise<DomainPermissions>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Permission fetch timeout'));
          }, 10000);

          const handler = (payload: { domainId: string }) => {
            if (payload.domainId === domainId) {
              clearTimeout(timeout);
              eventEmitter.off('user:permissions:loaded', handler);
              const cached = this.cache.get(domainId);
              if (cached) {
                resolve(cached);
              } else {
                reject(new Error('Permissions not found in cache after load'));
              }
            }
          };

          eventEmitter.on('user:permissions:loaded', handler);
        });
      } finally {
        this.pendingRequests.delete(domainId);
      }
    })();

    this.pendingRequests.set(domainId, requestPromise);
    return requestPromise;
  }

  /**
   * Check if user has a specific permission for a domain.
   *
   * Checks in order:
   * 1. Exact domain cache entry — role-based grant (Admin/Owner → all)
   * 2. Exact domain cache entry — explicit Permission.All wildcard
   * 3. Exact domain cache entry — specific permission in set
   * 4. Hierarchy fallback — traverse to 'workspace-root' for inherited permissions
   */
  public hasPermission(domainId: string, permission: Permission): boolean {
    const cached = this.cache.get(domainId);

    if (cached) {
      // Role-based grant: Admin and Owner have all permissions on any domain
      if (cached.role === 'Admin' || cached.role === 'Owner') {
        return true;
      }

      // Check for All permission (wildcard)
      if (cached.permissions.has(Permission.All)) {
        return true;
      }

      if (cached.permissions.has(permission)) {
        return true;
      }
    }

    // Hierarchy fallback: check workspace-root for inherited permissions
    if (domainId !== 'workspace-root') {
      const root = this.cache.get('workspace-root');
      if (root) {
        if (root.role === 'Admin' || root.role === 'Owner') {
          return true;
        }
        if (root.permissions.has(Permission.All)) {
          return true;
        }
        return root.permissions.has(permission);
      }
    }

    return false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  public hasAnyPermission(domainId: string, permissions: Permission[]): boolean {
    return permissions.some(p => this.hasPermission(domainId, p));
  }

  /**
   * Check if user has all of the specified permissions
   */
  public hasAllPermissions(domainId: string, permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(domainId, p));
  }

  /**
   * Get all cached permissions for a domain
   */
  public getPermissions(domainId: string): DomainPermissions | null {
    return this.cache.get(domainId) || null;
  }

  /**
   * Get all cached domain permissions
   */
  public getAllCachedPermissions(): Map<string, DomainPermissions> {
    return new Map(this.cache);
  }

  /**
   * Get user's role for a domain, with hierarchy fallback to workspace-root
   */
  public getRole(domainId: string): UserRole | null {
    const cached = this.cache.get(domainId);
    if (cached?.role) return cached.role;

    // Hierarchy fallback
    if (domainId !== 'workspace-root') {
      const root = this.cache.get('workspace-root');
      if (root?.role) return root.role;
    }

    return null;
  }

  /**
   * Check if user is admin
   */
  public isAdmin(domainId: string): boolean {
    const role = this.getRole(domainId);
    return role === 'Admin';
  }

  /**
   * Check if user is owner
   */
  public isOwner(domainId: string): boolean {
    const role = this.getRole(domainId);
    return role === 'Owner' || role === 'Admin';
  }

  /**
   * Clear the permission cache
   */
  public clearCache(): void {
    this.cache.clear();
    debugLog('PermissionsService', '[PermissionsService] Cache cleared');
  }

  /**
   * Cleanup service (for logout).
   * Uses EventListenerManager.teardown() for automatic listener cleanup.
   */
  public cleanup(): void {
    this.clearCache();
    this.teardown();
    this.initialized = false;
  }

  /**
   * Get human-readable label for a permission
   */
  public getPermissionLabel(permission: Permission): string {
    return PERMISSION_LABELS[permission] || permission;
  }

  /**
   * Get reason message for denied permission
   */
  public getDeniedReason(domainId: string, permission: Permission): string {
    const cached = this.cache.get(domainId);
    if (!cached) {
      return 'Permissions have not been loaded for this domain';
    }

    const label = this.getPermissionLabel(permission);
    const roleLabel = typeof cached.role === 'string' ? cached.role : 'Custom';
    return `You don't have the "${label}" permission. Your role: ${roleLabel}`;
  }
}

// Export singleton instance
export const permissionsService = PermissionsService.getInstance();

// Default export for convenience
export default permissionsService;
