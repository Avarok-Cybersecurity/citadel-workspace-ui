/**
 * Group Chat Types
 *
 * Types for custom peer group chats with Discord-like role system.
 * These are separate from workspace/office/room permissions.
 */

// ============================================================================
// Permissions
// ============================================================================

/**
 * Permissions that can be assigned to a group role.
 * Each permission is independent and can be toggled on/off.
 */
export interface GroupPermissions {
  /** Can send messages in the group */
  sendMessages: boolean;
  /** Can view the list of group members */
  viewMemberList: boolean;
  /** Can invite new members to the group */
  inviteMembers: boolean;
  /** Can kick members from the group (respects hierarchy) */
  kickMembers: boolean;
  /** Can create, edit, and delete roles (respects hierarchy) */
  manageRoles: boolean;
  /** Can assign roles to members (respects hierarchy) */
  assignRoles: boolean;
  /** Can edit group settings (name, default role, etc.) */
  editGroupSettings: boolean;
  /** Can permanently delete the group */
  deleteGroup: boolean;
}

/**
 * Default permissions for built-in roles
 */
export const DEFAULT_OWNER_PERMISSIONS: GroupPermissions = {
  sendMessages: true,
  viewMemberList: true,
  inviteMembers: true,
  kickMembers: true,
  manageRoles: true,
  assignRoles: true,
  editGroupSettings: true,
  deleteGroup: true,
};

export const DEFAULT_ADMIN_PERMISSIONS: GroupPermissions = {
  sendMessages: true,
  viewMemberList: true,
  inviteMembers: true,
  kickMembers: true,
  manageRoles: true,
  assignRoles: true,
  editGroupSettings: true,
  deleteGroup: false,
};

export const DEFAULT_MEMBER_PERMISSIONS: GroupPermissions = {
  sendMessages: true,
  viewMemberList: true,
  inviteMembers: false,
  kickMembers: false,
  manageRoles: false,
  assignRoles: false,
  editGroupSettings: false,
  deleteGroup: false,
};

// ============================================================================
// Roles
// ============================================================================

/**
 * A role that can be assigned to group members.
 * Roles have a position that determines their hierarchy.
 * Higher position = more authority.
 */
export interface GroupRole {
  /** Unique identifier for this role */
  id: string;
  /** Display name for the role (e.g., "Moderator", "VIP") */
  name: string;
  /**
   * Hierarchy position (higher = more power).
   * A user can only manage roles/members with lower position.
   * Owner is typically 100, Admin 50, Member 10.
   */
  position: number;
  /** Optional display color (hex format, e.g., "#6E59A5") */
  color?: string;
  /** Permissions granted to this role */
  permissions: GroupPermissions;
  /**
   * Whether this role is assigned to new members by default.
   * Only one role can be the default at a time.
   */
  isDefault: boolean;
  /**
   * Whether this is a built-in role that cannot be deleted.
   * The Owner role is built-in.
   */
  isBuiltIn: boolean;
}

/**
 * Create the default roles for a new group
 */
export function createDefaultRoles(ownerName: string = 'Owner'): GroupRole[] {
  return [
    {
      id: crypto.randomUUID(),
      name: ownerName,
      position: 100,
      color: '#FFD700', // Gold
      permissions: DEFAULT_OWNER_PERMISSIONS,
      isDefault: false,
      isBuiltIn: true,
    },
    {
      id: crypto.randomUUID(),
      name: 'Admin',
      position: 50,
      color: '#6E59A5', // Purple
      permissions: DEFAULT_ADMIN_PERMISSIONS,
      isDefault: false,
      isBuiltIn: false,
    },
    {
      id: crypto.randomUUID(),
      name: 'Member',
      position: 10,
      permissions: DEFAULT_MEMBER_PERMISSIONS,
      isDefault: true,
      isBuiltIn: false,
    },
  ];
}

// ============================================================================
// Members
// ============================================================================

/**
 * A member of a group
 */
export interface GroupMember {
  /** The member's CID (Citadel ID) */
  cid: bigint;
  /** The member's display username */
  username: string;
  /** ID of the role assigned to this member */
  roleId: string;
  /** Unix timestamp (ms) when the member joined */
  joinedAt: number;
}

// ============================================================================
// Group Settings
// ============================================================================

/**
 * Settings for a group
 */
export interface GroupSettings {
  /** ID of the role to assign to new members when they join */
  defaultRoleId: string;
  /** All roles defined for this group */
  roles: GroupRole[];
}

// ============================================================================
// Group Conversation
// ============================================================================

/**
 * A group conversation displayed in the sidebar
 */
export interface GroupConversation {
  /** Unique group ID */
  id: string;
  /** Group name (custom or defaults to creator's name) */
  name: string;
  /** CID of the group creator/owner */
  ownerId: bigint;
  /** All members of the group (owner first, then alphabetical) */
  members: GroupMember[];
  /** Group settings including roles */
  settings: GroupSettings;
  /** Number of unread messages */
  unreadCount: number;
  /** Unix timestamp (ms) of last message, for sorting */
  lastMessageTime?: number;
  /** Preview of last message content */
  lastMessagePreview?: string;
}

// ============================================================================
// Group Message
// ============================================================================

export type GroupMessageType = 'Text' | 'Markdown' | 'System';

/**
 * A message in a group chat
 */
export interface GroupMessage {
  /** Unique message ID */
  id: string;
  /** ID of the group this message belongs to */
  groupId: string;
  /** CID of the message sender */
  senderId: bigint;
  /** Username of the sender (for display) */
  senderName: string;
  /** Type of message content */
  messageType: GroupMessageType;
  /** Message content */
  content: string;
  /** Unix timestamp (ms) when sent */
  timestamp: number;
  /** ID of parent message if this is a reply */
  replyTo?: string;
  /** Number of replies to this message */
  replyCount: number;
  /** Usernames mentioned in this message */
  mentions: string[];
  /** Unix timestamp (ms) when last edited, if edited */
  editedAt?: number;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Member with resolved role for UI display
 */
export interface GroupMemberWithRole extends GroupMember {
  /** The resolved role object */
  role: GroupRole;
}

/**
 * State for the create group dialog
 */
export interface CreateGroupState {
  /** Group name input */
  name: string;
  /** Selected peers to invite */
  selectedPeers: Array<{
    cid: bigint;
    username: string;
    roleId: string; // Role to assign when invited
  }>;
  /** Group settings being configured */
  settings: GroupSettings;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a user can perform an action based on their role
 */
export function canPerformAction(
  userRole: GroupRole,
  action: keyof GroupPermissions
): boolean {
  return userRole.permissions[action];
}

/**
 * Check if a user can manage another user based on role hierarchy
 */
export function canManageUser(
  actorRole: GroupRole,
  targetRole: GroupRole
): boolean {
  return actorRole.position > targetRole.position;
}

/**
 * Get the owner role from a group's settings
 */
export function getOwnerRole(settings: GroupSettings): GroupRole | undefined {
  return settings.roles.find(r => r.isBuiltIn && r.position === 100);
}

/**
 * Get the default role for new members
 */
export function getDefaultRole(settings: GroupSettings): GroupRole | undefined {
  return settings.roles.find(r => r.isDefault);
}

/**
 * Sort members: owner first, then by role position (desc), then alphabetical
 */
export function sortMembers(
  members: GroupMemberWithRole[]
): GroupMemberWithRole[] {
  return [...members].sort((a, b) => {
    // Owner (highest position) first
    if (a.role.position !== b.role.position) {
      return b.role.position - a.role.position;
    }
    // Then alphabetical by username
    return a.username.localeCompare(b.username);
  });
}
