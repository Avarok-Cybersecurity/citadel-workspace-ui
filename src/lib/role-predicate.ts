/**
 * The one place a role decides whether it is privileged.
 *
 * This predicate existed in seven places and the copies already disagreed:
 *
 *   TopBar                    'Admin'|'admin'|'Owner'|'owner'
 *   AdminSettingsSection      'Admin'|'admin' plus the object form — no Owner
 *   WorkspaceSwitcherDropdown the four literals, no object form
 *   MembersSectionModals      lowercase first, then owner|admin
 *   permissions-service/cache 'Admin'|'Owner', exact case only
 *   permissions-service       exact case only; isOwner() meant Owner-or-Admin
 *   MembersTab                'Admin', exact case only
 *
 * Three casing conventions, two answers to "does Owner count", and one copy
 * that understood the object role shape. The visible consequence: an Owner sees
 * the admin ring in TopBar and the shield in the workspace switcher, and then
 * AdminSettingsSection renders null for them — the same person is an
 * administrator in two places and not in the third.
 *
 * The wire sends PascalCase (`UserRole` in the generated bindings), so
 * normalise-then-compare is what holds when a lowercase role reaches a
 * comparison from any of the paths that produce one.
 *
 * Sibling of role-badge.ts and avatar-color.ts, whose headers document the same
 * drift for the badge classes and the avatar palette.
 */

/**
 * The role as a lowercase name, or null.
 *
 * Accepts the object form the server uses for structured roles (`{ Admin: … }`,
 * `{ Custom: … }`) as well as the plain string, because only one of the seven
 * copies did and that one was not the one gating the admin section.
 */
export function normalizeRole(role: unknown): string | null {
  if (typeof role === 'string') {
    const trimmed: string = role.trim().toLowerCase();
    return trimmed === '' ? null : trimmed;
  }

  if (typeof role === 'object' && role !== null) {
    const [key] = Object.keys(role as Record<string, unknown>);
    return key ? key.toLowerCase() : null;
  }

  return null;
}

/** Exactly the Admin role — not Owner. For counting admins, not for gating. */
export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'admin';
}

/** Exactly the Owner role. */
export function isOwnerRole(role: unknown): boolean {
  return normalizeRole(role) === 'owner';
}

/**
 * Admin or Owner: the predicate that gates administrative affordances.
 *
 * Use this for "may this person see the admin section / the shield / the ring".
 * An Owner outranks an Admin, so anywhere an Admin is allowed, an Owner is too;
 * AdminSettingsSection's omission of Owner was the bug this name prevents.
 */
export function isPrivilegedRole(role: unknown): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'owner';
}
