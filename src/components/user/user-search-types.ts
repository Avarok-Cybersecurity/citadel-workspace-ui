/**
 * Types and helpers for UserSearch component.
 */

import { UserRole } from '@/types/workspace-entities';
import { roleBadgeClass } from '@/lib/role-badge';

export interface UserData {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role?: UserRole;
  /** True, false, or null when nobody has said. See lib/presence.ts. */
  isOnline?: boolean | null;
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
/** @deprecated Use roleBadgeClass. Kept as a thin alias for existing imports. */
export function getRoleBadgeClass(role?: UserRole): string {
  return roleBadgeClass(role);
}

