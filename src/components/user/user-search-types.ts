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
      return 'bg-primary hover:bg-primary/90';
    case UserRole.Admin:
      return 'bg-primary-accent hover:bg-primary-accent/90';
    case UserRole.Member:
      return 'bg-success hover:bg-success/90';
    case UserRole.Guest:
      return 'bg-muted hover:bg-muted/80';
    default:
      return 'bg-muted hover:bg-muted/80';
  }
}
