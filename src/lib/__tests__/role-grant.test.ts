/**
 * The roles a caller may hand out, by the server's own rule.
 *
 * `ensure_may_grant_role` (async_domain_server_ops.rs) refuses a built-in role
 * above the caller's on `UserRole::command_authority`, unless nobody in the
 * workspace holds it yet, and falls back to permission containment for Custom
 * roles. The Add member dialog offered all four roles to everyone, so an Admin
 * could pick Owner in a workspace that already had one and be refused.
 */
import { describe, it, expect } from 'vitest';
import { mayGrantRole, type GrantContext } from '../role-grant';
import { Permission, ROLE_DEFAULT_PERMISSIONS, type UserRole } from '../permissions-service/types';

const BUILT_IN: readonly string[] = ['Owner', 'Admin', 'Member', 'Guest'];

function grantable(actorRole: UserRole | null, occupied: string[] | null, held: Permission[] | null = null): string[] {
  const context: GrantContext = {
    actorRole,
    actorPermissions: held === null ? null : new Set(held),
    occupiedRoles: occupied === null ? null : new Set(occupied),
  };
  return BUILT_IN.filter((role: string): boolean => mayGrantRole(role, context));
}

describe('which roles a caller may grant', () => {
  it('offers an Admin everything but an occupied Owner seat', () => {
    expect(grantable('Admin', ['owner', 'admin', 'member'])).toEqual(['Admin', 'Member', 'Guest']);
  });

  it('lets an Admin fill a vacant Owner seat, as the server does', () => {
    expect(grantable('Admin', ['admin', 'member'])).toEqual(BUILT_IN);
  });

  it('treats an unknown roster as occupied, so Owner is not offered on a guess', () => {
    expect(grantable('Admin', null)).toEqual(['Admin', 'Member', 'Guest']);
  });

  it('offers an Owner every built-in role', () => {
    expect(grantable('Owner', ['owner', 'admin'])).toEqual(BUILT_IN);
  });

  it('never offers a Member anything above Member while those seats are held', () => {
    expect(grantable('Member', ['owner', 'admin'])).toEqual(['Member', 'Guest']);
  });

  it('reads the role in any casing the wire produces', () => {
    expect(grantable({ Custom: ['x', 1] }, [], [])).toEqual([]);
    expect(grantable('admin' as UserRole, ['owner'])).toEqual(['Admin', 'Member', 'Guest']);
  });

  it('judges a Custom caller by containment of what the role carries', () => {
    const held: Permission[] = ROLE_DEFAULT_PERMISSIONS.Member;
    expect(grantable({ Custom: ['helper', 21] }, ['owner', 'admin'], held)).toEqual(['Member', 'Guest']);
    expect(grantable({ Custom: ['root', 22] }, ['owner', 'admin'], [Permission.All])).toEqual(BUILT_IN);
  });

  it('withholds nothing while the caller role is unanswered, leaving the server to say no', () => {
    expect(grantable(null, ['owner'])).toEqual(BUILT_IN);
  });
});
