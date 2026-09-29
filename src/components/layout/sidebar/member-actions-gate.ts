/**
 * Which member actions the server will refuse you, and why.
 *
 * Found live (2026-09-29): a Member opening an Admin's row saw Manage
 * Permissions, Change Role and Remove Member, all enabled, while the Add
 * button beside the list already said why it was off. Each of the three could
 * only end in the server's refusal.
 *
 * The server's gates, mirrored here:
 *   - Remove: `check_entity_permission(actor, domain, RemoveUsers)`, per domain.
 *   - Change Role and Manage Permissions: `is_admin_or_owner`, workspace-wide.
 *
 * Blocked on a KNOWN "no" only, like Add member: an unknown role or an
 * unanswered permission check still offers the action, and the modal shows the
 * server's own refusal if one comes.
 */
import { permits, type UsePermissionResult } from '@/hooks/use-permission-result';
import { isPrivilegedRole, normalizeRole } from '@/lib/role-predicate';
import { PERMISSION_SENTENCE } from '@/lib/workspace-response-handler/describe-error';

export const ONLY_ADMINS_CHANGE_ROLES: string = 'Only an admin or the owner can change roles.';
export const ONLY_ADMINS_MANAGE_PERMISSIONS: string = 'Only an admin or the owner can change permissions.';

/** For each action, the reason it cannot succeed, or null when it may be chosen. */
export interface MemberActionBlocks {
  managePermissions: string | null;
  changeRole: string | null;
  remove: string | null;
}

export function memberActionBlocks(ownRole: unknown, removeUsers: UsePermissionResult): MemberActionBlocks {
  const knownUnprivileged: boolean = normalizeRole(ownRole) !== null && !isPrivilegedRole(ownRole);
  return {
    managePermissions: knownUnprivileged ? ONLY_ADMINS_MANAGE_PERMISSIONS : null,
    changeRole: knownUnprivileged ? ONLY_ADMINS_CHANGE_ROLES : null,
    remove: permits(removeUsers) ? null : (removeUsers.reason ?? PERMISSION_SENTENCE.RemoveUsers),
  };
}
