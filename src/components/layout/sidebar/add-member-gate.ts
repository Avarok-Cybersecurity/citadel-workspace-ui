import { permits, type UsePermissionResult } from '@/hooks/use-permission-result';

export const NO_ADD_USERS: string =
  'You do not have permission to add members here. An administrator can grant it.';

/**
 * Why Add member cannot succeed, or null when it may be pressed.
 *
 * The server's gate is `check_entity_permission(actor, domain, AddUsers)` in
 * `add_user_to_domain`, for the domain the request names -- so the question is
 * asked of the same domain the modal will send. Blocked on a KNOWN "no" only,
 * like the hierarchy's "+": an unanswered check still offers the button, and
 * the modal shows the server's refusal in its own words.
 */
export function addMemberBlockedReason(addUsers: UsePermissionResult): string | null {
  return permits(addUsers) ? null : (addUsers.reason ?? NO_ADD_USERS);
}
