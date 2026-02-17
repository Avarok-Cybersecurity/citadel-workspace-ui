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

// Role enumeration for users
export enum UserRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
  Guest = 'guest'
}

// Permission settings for users
export interface UserPermissions {
  canCreateNodes: boolean;
  canDeleteNodes: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canUpdateNodes: boolean;
  canEditMdxContent: boolean;
  domainId: string; // ID of the domain these permissions apply to
}

// Message types
export interface Message extends Entity {
  content: string;
  senderId: string;
  receiverId?: string;
  nodeId?: string;
  type: MessageType;
}

export enum MessageType {
  Text = 'text',
  File = 'file',
  System = 'system'
}

// Re-export generated GroupMessageType (string literal union: "Text" | "Markdown" | "System")
// This replaces the local enum to maintain type compatibility with generated GroupMessage
export type { GroupMessageType } from 'citadel-workspace-client-ts';

// Group message read status
export interface GroupMessageReadBy {
  user_id: string;
  user_name: string;
  read_at: number;
}

// Extend generated GroupMessage with local-only fields
import type { GroupMessage as GeneratedGroupMessage } from 'citadel-workspace-client-ts';
export interface GroupMessage extends GeneratedGroupMessage {
  read_by?: GroupMessageReadBy[];
}
