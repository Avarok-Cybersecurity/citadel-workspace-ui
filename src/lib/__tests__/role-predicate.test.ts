/**
 * The role predicate, and the disagreements that motivated it.
 *
 * Each case here was a real difference between two of the seven copies, not a
 * hypothetical: the Owner exclusion, the casing conventions, and the object
 * role shape that only one copy handled.
 */

import { describe, it, expect } from 'vitest';
import { normalizeRole, isAdminRole, isOwnerRole, isPrivilegedRole } from '../role-predicate';

describe('the role predicate', () => {
  it('reads the wire casing and the frontend casing alike', () => {
    for (const role of ['Admin', 'admin', 'ADMIN', ' Admin ']) {
      expect(isPrivilegedRole(role), role).toBe(true);
    }
  });

  it('counts an Owner as privileged — the AdminSettingsSection bug', () => {
    // TopBar and the workspace switcher already showed an Owner the admin
    // affordances; AdminSettingsSection rendered null for the same person.
    expect(isPrivilegedRole('Owner')).toBe(true);
    expect(isPrivilegedRole('owner')).toBe(true);
  });

  it('understands the object role shape', () => {
    expect(isPrivilegedRole({ Admin: {} })).toBe(true);
    expect(isPrivilegedRole({ Owner: null })).toBe(true);
    expect(isPrivilegedRole({ Custom: { name: 'Moderator' } })).toBe(false);
  });

  it('keeps Admin and Owner distinguishable for the places that count admins', () => {
    expect(isAdminRole('Owner')).toBe(false);
    expect(isOwnerRole('Admin')).toBe(false);
    expect(isAdminRole('Admin')).toBe(true);
    expect(isOwnerRole('Owner')).toBe(true);
  });

  it('grants nothing for an absent, empty or unrecognised role', () => {
    for (const role of [undefined, null, '', '   ', 'Member', 'guest', 42, {}, []]) {
      expect(isPrivilegedRole(role), JSON.stringify(role) ?? String(role)).toBe(false);
    }
  });

  it('normalises to a lowercase name', () => {
    expect(normalizeRole('Owner')).toBe('owner');
    expect(normalizeRole({ Custom: {} })).toBe('custom');
    expect(normalizeRole(undefined)).toBeNull();
  });
});
