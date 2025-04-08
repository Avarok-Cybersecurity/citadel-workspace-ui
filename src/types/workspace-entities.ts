/**
 * Entity type definitions for workspace data structures
 * These mirror the Rust structs defined in the backend
 */

// Base entity interface
export interface Entity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

// User entity (Member in workspace context)
export interface User extends Entity {
  username: string;
  displayName: string;
  profileImage?: string;
  avatarUrl?: string; // URL to user's avatar image
  email?: string; // User's email address
  isOnline: boolean;
  role?: UserRole;
  permissions?: UserPermissions;
  lastActive?: number; // Timestamp of last activity
}

// Office entity
export interface Office extends Entity {
  name: string;
  description?: string;
  mdx_content?: string;
  ownerId: string;
  members?: Record<string, User>;
  rooms?: Record<string, Room>;
}

// Room entity
export interface Room extends Entity {
  name: string;
  description?: string;
  mdx_content?: string;
  officeId: string;
  ownerId: string;
  members?: Record<string, User>;
  isPrivate: boolean;
}

// Role enumeration for users
export enum UserRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
  Guest = 'guest'
}

// Permission settings for users
export interface UserPermissions {
  canCreateRooms: boolean;
  canDeleteRooms: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canUpdateOffice: boolean;
  canUpdateRooms: boolean;
  canEditMdxContent: boolean;
  domainId: string; // ID of the domain these permissions apply to (office or room)
}

// Message types
export interface Message extends Entity {
  content: string;
  senderId: string;
  receiverId?: string;
  roomId?: string;
  officeId?: string;
  type: MessageType;
}

export enum MessageType {
  Text = 'text',
  File = 'file',
  System = 'system'
}
