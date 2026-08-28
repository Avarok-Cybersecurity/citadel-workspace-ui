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
  /** Rearrange the node tree: move, nest and reorder offices and rooms. */
  EditTreeStructure = 'EditTreeStructure',
  /** Define which node types exist and how they behave. */
  ManageNodeTypes = 'ManageNodeTypes',
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
 * Human-readable labels for permissions.
 *
 * "Human-readable" was doing a lot of work here: these were the enum names with
 * spaces inserted. "Node" is the code's word for an office or a room, "MDX" is
 * the file format, and "Tree Structure" is the data structure — none of them
 * are things an administrator has been shown anywhere else in the product,
 * which is the permission matrix's whole audience.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.All]: 'All Permissions',
  [Permission.CreateNode]: 'Create offices and rooms',
  [Permission.DeleteNode]: 'Delete offices and rooms',
  [Permission.UpdateNode]: 'Rename offices and rooms',
  [Permission.AddNode]: 'Add offices and rooms',
  [Permission.EditNodeConfig]: 'Change office and room settings',
  [Permission.UpdateNodeSettings]: 'Update office and room settings',
  [Permission.ManageNodeMembers]: 'Manage who is in an office or room',
  [Permission.CreateWorkspace]: 'Create Workspace',
  [Permission.UpdateWorkspace]: 'Update Workspace',
  [Permission.DeleteWorkspace]: 'Delete Workspace',
  [Permission.EditWorkspaceConfig]: 'Edit Workspace Config',
  [Permission.Themes]: 'Edit Workspace Theme',
  [Permission.EditTreeStructure]: 'Reorganise the workspace',
  [Permission.ManageNodeTypes]: 'Define new kinds of space',
  [Permission.ViewContent]: 'View Content',
  [Permission.EditContent]: 'Edit Content',
  [Permission.EditMdx]: 'Edit documents',
  [Permission.AddUsers]: 'Add Users',
  [Permission.RemoveUsers]: 'Remove Users',
  [Permission.BanUser]: 'Ban User',
  [Permission.SendMessages]: 'Send Messages',
  [Permission.ReadMessages]: 'Read Messages',
  [Permission.UploadFiles]: 'Upload Files',
  [Permission.DownloadFiles]: 'Download Files',
  [Permission.ManageDomains]: 'Manage every space in the workspace',
  [Permission.ConfigureSystem]: 'Configure System',
};

/** Every permission, in declaration order. Mirrors `Permission::ALL_VARIANTS`. */
export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

/**
 * What each role is granted by default, mirroring `Permission::for_role` in
 * citadel-workspace-types. The server is authoritative — this exists so the
 * admin UI can show what a role means before it is applied, and
 * scripts/check-permission-parity.mjs fails the build if the two disagree.
 *
 * Admin is listed as the full set rather than the bare `All` wildcard the server
 * stores: the two grant identical access, and the permission matrix would
 * otherwise render an administrator with every box unticked but one.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  Admin: ALL_PERMISSIONS,
  Owner: ALL_PERMISSIONS.filter(
    (p) => p !== Permission.All && p !== Permission.ConfigureSystem,
  ),
  Member: [
    Permission.ViewContent,
    Permission.SendMessages,
    Permission.ReadMessages,
    Permission.UploadFiles,
    Permission.DownloadFiles,
  ],
  Guest: [Permission.ViewContent],
  Banned: [],
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
      Permission.EditTreeStructure,
      Permission.ManageNodeTypes,
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
