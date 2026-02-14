/**
 * Types and helpers for UserSearch component.
 */

import { UserRole } from '@/types/workspace-entities';

export interface UserData {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role?: UserRole;
  isOnline?: boolean;
  lastActive?: number;
}

export interface UserSearchProps {
  onUserSelect?: (user: UserData) => void;
  enableInvite?: boolean;
  className?: string;
  placeholder?: string;
  exclude?: string[]; // User IDs to exclude from results
  initialFocus?: boolean;
}

/** Get role badge CSS class */
export function getRoleBadgeClass(role?: UserRole): string {
  switch (role) {
    case UserRole.Owner:
      return 'bg-purple-500 hover:bg-purple-600';
    case UserRole.Admin:
      return 'bg-blue-500 hover:bg-blue-600';
    case UserRole.Member:
      return 'bg-green-500 hover:bg-green-600';
    case UserRole.Guest:
      return 'bg-gray-500 hover:bg-gray-600';
    default:
      return 'bg-gray-500 hover:bg-gray-600';
  }
}
