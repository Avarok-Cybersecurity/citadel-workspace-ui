/**
 * Permissions Service
 *
 * Handles fetching, caching, and real-time updates of user permissions.
 * Provides a centralized service for permission checks throughout the UI.
 */

import { eventEmitter } from './event-emitter';
import WorkspaceService from './workspace-service';
import { connectionManager } from './connection-manager';

/**
 * Permission enum matching Rust Permission type from citadel-workspace-types
 */
export enum Permission {
  // Wildcard permission
  All = 'All',
  // Room permissions
  CreateRoom = 'CreateRoom',
  DeleteRoom = 'DeleteRoom',
  UpdateRoom = 'UpdateRoom',
  AddRoom = 'AddRoom',
  EditRoomConfig = 'EditRoomConfig',
  UpdateRoomSettings = 'UpdateRoomSettings',
  ManageRoomMembers = 'ManageRoomMembers',
  // Office permissions
  CreateOffice = 'CreateOffice',
  DeleteOffice = 'DeleteOffice',
  UpdateOffice = 'UpdateOffice',
  AddOffice = 'AddOffice',
  EditOfficeConfig = 'EditOfficeConfig',
  UpdateOfficeSettings = 'UpdateOfficeSettings',
  ManageOfficeMembers = 'ManageOfficeMembers',
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
  [Permission.CreateRoom]: 'Create Room',
  [Permission.DeleteRoom]: 'Delete Room',
  [Permission.UpdateRoom]: 'Update Room',
  [Permission.AddRoom]: 'Add Room',
  [Permission.EditRoomConfig]: 'Edit Room Config',
  [Permission.UpdateRoomSettings]: 'Update Room Settings',
  [Permission.ManageRoomMembers]: 'Manage Room Members',
  [Permission.CreateOffice]: 'Create Office',
  [Permission.DeleteOffice]: 'Delete Office',
  [Permission.UpdateOffice]: 'Update Office',
  [Permission.AddOffice]: 'Add Office',
  [Permission.EditOfficeConfig]: 'Edit Office Config',
  [Permission.UpdateOfficeSettings]: 'Update Office Settings',
  [Permission.ManageOfficeMembers]: 'Manage Office Members',
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
  rooms: {
    label: 'Rooms',
    permissions: [
      Permission.CreateRoom,
      Permission.UpdateRoom,
      Permission.DeleteRoom,
      Permission.AddRoom,
      Permission.EditRoomConfig,
      Permission.UpdateRoomSettings,
      Permission.ManageRoomMembers,
    ],
  },
  offices: {
    label: 'Offices',
    permissions: [
      Permission.CreateOffice,
      Permission.UpdateOffice,
      Permission.DeleteOffice,
      Permission.AddOffice,
      Permission.EditOfficeConfig,
      Permission.UpdateOfficeSettings,
      Permission.ManageOfficeMembers,
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
 */
class PermissionsService {
  private static instance: PermissionsService;
  private cache: Map<string, DomainPermissions> = new Map();
  private pendingRequests: Map<string, Promise<DomainPermissions>> = new Map();
  private initialized = false;
  private listenerCleanup: (() => void) | null = null;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): PermissionsService {
    if (!PermissionsService.instance) {
      PermissionsService.instance = new PermissionsService();
    }
    return PermissionsService.instance;
  }

  /**
   * Setup event listeners for permission updates
   */
  private setupEventListeners(): void {
    // Listen for permission responses from server
    const handlePermissionsLoaded = (payload: {
      userId: string;
      role: UserRole;
      permissions: string[];
      domainId: string;
    }) => {
      const currentUser = this.getCurrentUserId();
      if (payload.userId === currentUser) {
        this.updateCache(payload.domainId, payload.role, payload.permissions);
      }
    };

    eventEmitter.on('user:permissions:loaded', handlePermissionsLoaded);

    // Listen for permission update notifications (when admin changes permissions)
    const handlePermissionsUpdated = async (payload: {
      userId: string;
      domainId: string;
      permissions: string[];
      operation: 'add' | 'remove' | 'set';
    }) => {
      const currentUser = this.getCurrentUserId();
      if (payload.userId === currentUser) {
        // Refetch permissions to get the updated set
        await this.fetchPermissions(payload.domainId, true);
        eventEmitter.emit('permissions:updated', { domainId: payload.domainId });
      }
    };

    eventEmitter.on('member:permissions-updated', handlePermissionsUpdated);

    // Listen for role updates
    const handleRoleUpdated = (payload: { userId: string; role: UserRole }) => {
      const currentUser = this.getCurrentUserId();
      if (payload.userId === currentUser) {
        // Role change affects all domains - clear cache and refetch
        this.clearCache();
        eventEmitter.emit('permissions:role-changed', { role: payload.role });
      }
    };

    eventEmitter.on('member:role-updated', handleRoleUpdated);

    this.listenerCleanup = () => {
      eventEmitter.off('user:permissions:loaded', handlePermissionsLoaded);
      eventEmitter.off('member:permissions-updated', handlePermissionsUpdated);
      eventEmitter.off('member:role-updated', handleRoleUpdated);
    };

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

    console.log(`[PermissionsService] Cache updated for ${domainId}: ${permSet.size} permissions`);
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
   * Check if user has a specific permission for a domain
   */
  public hasPermission(domainId: string, permission: Permission): boolean {
    const cached = this.cache.get(domainId);
    if (!cached) {
      return false;
    }

    // Check for All permission (wildcard)
    if (cached.permissions.has(Permission.All)) {
      return true;
    }

    return cached.permissions.has(permission);
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
   * Get user's role for a domain
   */
  public getRole(domainId: string): UserRole | null {
    const cached = this.cache.get(domainId);
    return cached?.role || null;
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
    console.log('[PermissionsService] Cache cleared');
  }

  /**
   * Cleanup service (for logout)
   */
  public cleanup(): void {
    this.clearCache();
    if (this.listenerCleanup) {
      this.listenerCleanup();
    }
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
