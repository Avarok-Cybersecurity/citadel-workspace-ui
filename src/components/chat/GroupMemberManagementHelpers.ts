import type { AvailablePeer } from './create-group-types';
/**
 * Types, constants, and helpers for GroupMemberManagement component.
 */

import { Crown, Shield, User } from 'lucide-react';
import { createElement } from 'react';
import type { GroupConversation, GroupMemberWithRole, GroupRole } from '@/types/group';

// ============================================================================
// Types
// ============================================================================

export interface GroupMemberManagementProps {
  group: GroupConversation;
  /** Callback when a member's role is changed */
  onRoleChange: (memberCid: string, roleId: string) => Promise<void>;
  /** Callback when a member is kicked */
  onKickMember: (memberCid: string) => Promise<void>;
  /** Peers who can still be invited — callers exclude anyone already a member. */
  invitablePeers?: AvailablePeer[];
  /** Callback when a peer is invited. Omit to hide the invite control entirely. */
  onInviteMember?: (peerCid: string) => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

export const AVATAR_COLORS = [
  '#FFD700', // Gold - Owner
  '#6E59A5', // Purple
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
];

// ============================================================================
// Helpers
// ============================================================================

/** Get role icon based on position in hierarchy */
export function getRoleIcon(role: GroupRole): React.ReactElement {
  if (role.position >= 100) {
    return createElement(Crown, { className: 'h-4 w-4 text-warning' });
  }
  if (role.position >= 50) {
    return createElement(Shield, { className: 'h-4 w-4 text-primary-accent' });
  }
  return createElement(User, { className: 'h-4 w-4 text-muted-foreground' });
}

/** Get avatar color from role or cycle through palette */
export function getAvatarColor(member: GroupMemberWithRole, index: number): string {
  if (member.role?.color) return member.role.color;
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
