/**
 * Permissions Service - Types & Constants
 *
 * Permission enum, UserRole type, DomainPermissions interface,
 * and human-readable label / category constants.
 */

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
  /** Edit the workspace theme every member sees. */
  Themes = 'Themes',
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
  [Permission.Themes]: 'Edit Workspace Theme',
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
      Permission.Themes,
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
