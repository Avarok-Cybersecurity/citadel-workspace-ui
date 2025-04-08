/**
 * workspace-types.ts
 * 
 * TypeScript equivalents of the Rust types defined in 
 * citadel-workspace-types/src/structs.rs. These types are used
 * in the workspace protocol communication.
 */

/**
 * Represents a workspace office
 */
export interface OfficeTS {
  id: string;
  name: string;
  description: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  owner_id: string;
  rooms: RoomTS[];
}

/**
 * Represents a room within an office
 */
export interface RoomTS {
  id: string;
  office_id: string;
  name: string;
  description: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

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
  // Office permissions
  ViewOffice = 'view_office',
  EditOffice = 'edit_office',
  DeleteOffice = 'delete_office',
  
  // Room permissions
  CreateRoom = 'create_room',
  ViewRoom = 'view_room',
  EditRoom = 'edit_room',
  DeleteRoom = 'delete_room',
  
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
    domain_id: string; // office_id or room_id
    permissions: PermissionTS[];
  }[];
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  last_active: string; // ISO timestamp
  online: boolean;
}
