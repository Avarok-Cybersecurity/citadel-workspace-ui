/**
 * Admin Modal Types
 *
 * Shared type definitions for the AdminModal component and its tabs.
 */

/** A level's type name, as the hierarchy schema names it: 'Workspace', 'Office', or a custom one. */
export type AdminEntityType = string;
/** The top of every hierarchy. */
export const WORKSPACE_ENTITY: AdminEntityType = 'Workspace';

export type AdminTabType = 'general' | 'members' | 'chat';

export interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: AdminEntityType;
  entityId: string;
  defaultTab?: AdminTabType;
}

export interface AdminTabProps {
  entityType: AdminEntityType;
  entityId: string;
  onClose: () => void;
}

export interface EntityData {
  id: string;
  name: string;
  description: string;
  chatEnabled?: boolean;
  chatRules?: string;
}

export interface MemberData {
  userId: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  role: UserRole;
}

export type UserRole = 'Admin' | 'Owner' | 'Member' | 'Guest' | 'Banned';

export const USER_ROLES: UserRole[] = ['Admin', 'Owner', 'Member', 'Guest'];

export interface UpdateEntityParams {
  name?: string;
  description?: string;
}
