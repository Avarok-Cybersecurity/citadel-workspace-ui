/**
 * workspace-types.ts
 *
 * TypeScript equivalents of the Rust types defined in
 * citadel-workspace-types/src/structs.rs. These types are used
 * in the workspace protocol communication.
 */

/**
 * Represents a user's role within a workspace
 */
export enum UserRoleTS {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
  Guest = 'guest'
}

/**
 * Represents permissions for specific actions in a workspace
 */
export enum PermissionTS {
  // Node permissions (generic - applies to offices, rooms, etc.)
  ViewContent = 'ViewContent',
  EditContent = 'EditContent',
  CreateNode = 'CreateNode',
  DeleteNode = 'DeleteNode',
  UpdateNode = 'UpdateNode',
  EditNodeConfig = 'EditNodeConfig',
  AddNode = 'AddNode',
  UpdateNodeSettings = 'UpdateNodeSettings',
  ManageNodeMembers = 'ManageNodeMembers',

  // Member permissions
  InviteMembers = 'invite_members',
  RemoveMembers = 'remove_members',
  ManageRoles = 'manage_roles',

  // Message permissions
  SendMessages = 'send_messages',
  DeleteMessages = 'delete_messages',

  // File permissions
  UploadFiles = 'upload_files',
  DeleteFiles = 'delete_files'
}

/**
 * Represents a user in the workspace
 */
export interface UserTS {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: UserRoleTS;
  permissions: {
    domain_id: string;
    permissions: PermissionTS[];
  }[];
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  last_active: string; // ISO timestamp
  online: boolean;
}
