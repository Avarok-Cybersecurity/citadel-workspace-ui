/**
 * Whether a caller may hand out a role: `ensure_may_grant_role` in
 * citadel-workspace-server-kernel (async_domain_server_ops.rs), mirrored.
 *
 * The server's rule, in its order:
 *
 *   1. Both roles built in: allowed when the caller's `command_authority` is at
 *      least the granted role's, or when no workspace member holds the granted
 *      role yet (a vacant seat may be filled; it is how a workspace, which
 *      starts with an Admin and no Owner, ever gains an Owner).
 *   2. Otherwise: allowed when every permission the granted role carries is one
 *      the caller's role holds, `All` covering everything.
 *
 * A mirror, not a gate: the server still decides. What this changes is that the
 * dialog stops offering what the server will refuse.
 */
import { normalizeRole } from './role-predicate';
import { Permission, ROLE_DEFAULT_PERMISSIONS, type UserRole } from './permissions-service/types';

/** `UserRole::command_authority` in citadel-workspace-types. Custom roles have none. */
const COMMAND_AUTHORITY: ReadonlyMap<string, number> = new Map([
  ['owner', 4],
  ['admin', 3],
  ['member', 2],
  ['guest', 1],
  ['banned', 0],
]);

function commandAuthority(role: unknown): number | null {
  const normalized: string | null = normalizeRole(role);
  return normalized === null ? null : (COMMAND_AUTHORITY.get(normalized) ?? null);
}

export interface GrantContext {
  /** The caller's workspace role; null while it has not been answered. */
  actorRole: UserRole | null;
  /** What the caller's role holds at the workspace root; null while unanswered. */
  actorPermissions: ReadonlySet<Permission> | null;
  /** The roles workspace members hold, normalised; null while the roster is unknown. */
  occupiedRoles: ReadonlySet<string> | null;
}

/**
 * Whether the caller may grant `role` (a built-in role name, PascalCase).
 *
 * An unanswered caller role withholds nothing: the dialog is already behind the
 * AddUsers gate, and the server's refusal is shown in plain words. An unknown
 * roster, by contrast, is not evidence of a vacancy, so it fills no seat.
 */
export function mayGrantRole(role: string, context: GrantContext): boolean {
  if (context.actorRole === null) return true;

  const mine: number | null = commandAuthority(context.actorRole);
  const granting: number | null = commandAuthority(role);
  if (mine !== null && granting !== null) {
    if (mine >= granting) return true;
    const seat: string | null = normalizeRole(role);
    return seat !== null && context.occupiedRoles !== null && !context.occupiedRoles.has(seat);
  }

  const held: ReadonlySet<Permission> | null = context.actorPermissions;
  if (held === null) return true;
  if (held.has(Permission.All)) return true;
  const carried: Permission[] = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  return carried.every((permission: Permission): boolean => held.has(permission));
}
