import { describe, it, expect } from 'vitest';
import {
  PERMISSION_CATEGORIES,
  ROLE_HIERARCHY,
  getRoleDefaultPermissions,
} from '../permission-constants';
import { Permission, ROLE_DEFAULT_PERMISSIONS } from '@/lib/permissions-service/types';

/**
 * These used to assert a hand-written model that lived in permission-constants
 * itself, so they passed while disagreeing with the server on what a role
 * grants — the earlier version required Member to have EditContent, which the
 * backend refuses. They now assert the presentation layer is a faithful
 * rendering of the canonical model; Rust parity is checked separately by
 * scripts/check-permission-parity.mjs.
 */
describe('permission-constants', () => {
  describe('PERMISSION_CATEGORIES', () => {
    it('covers every permission exactly once', () => {
      const ids = Object.values(PERMISSION_CATEGORIES).flat().map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual([...Object.values(Permission)].sort());
    });

    it('gives every permission a label and a description', () => {
      for (const perm of Object.values(PERMISSION_CATEGORIES).flat()) {
        expect(perm.label, `${perm.id} has no label`).toBeTruthy();
        expect(perm.description, `${perm.id} has no description`).toBeTruthy();
      }
    });

    it('groups permissions under readable headings', () => {
      expect(Object.keys(PERMISSION_CATEGORIES)).toEqual(
        expect.arrayContaining(['Content', 'Messaging', 'Files', 'Nodes', 'Workspace']),
      );
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('offers every role the model defines a default for, except Banned', () => {
      const offered = ROLE_HIERARCHY.map((r) => r.value).sort();
      const defined = Object.keys(ROLE_DEFAULT_PERMISSIONS)
        .filter((r) => r !== 'Banned')
        .sort();
      expect(offered).toEqual(defined);
    });

    it('each role has value, label, and color', () => {
      for (const role of ROLE_HIERARCHY) {
        expect(role).toHaveProperty('value');
        expect(role).toHaveProperty('label');
        expect(role).toHaveProperty('color');
      }
    });
  });

  describe('getRoleDefaultPermissions', () => {
    it('returns the canonical defaults, not a second opinion', () => {
      for (const [role, expected] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
        expect(getRoleDefaultPermissions(role)).toEqual(expected);
      }
    });

    it('withholds content editing from Member, as the server does', () => {
      const member = getRoleDefaultPermissions('Member');
      expect(member).toContain(Permission.ViewContent);
      expect(member).not.toContain(Permission.EditContent);
      expect(member).not.toContain(Permission.EditMdx);
    });

    it('gives Owner the editing rights Member lacks', () => {
      const owner = getRoleDefaultPermissions('Owner');
      expect(owner).toContain(Permission.EditContent);
      expect(owner).toContain(Permission.EditMdx);
      expect(owner).not.toContain(Permission.ConfigureSystem);
    });

    it('is a hierarchy: each role contains the one below it', () => {
      const chain = ['Admin', 'Owner', 'Member', 'Guest'];
      for (let i = 0; i < chain.length - 1; i++) {
        const higher = new Set(getRoleDefaultPermissions(chain[i]));
        for (const perm of getRoleDefaultPermissions(chain[i + 1])) {
          expect(higher.has(perm), `${chain[i]} is missing ${perm}, which ${chain[i + 1]} has`).toBe(true);
        }
        expect(getRoleDefaultPermissions(chain[i]).length).toBeGreaterThan(
          getRoleDefaultPermissions(chain[i + 1]).length,
        );
      }
    });

    it('unknown role returns empty array', () => {
      expect(getRoleDefaultPermissions('Unknown')).toEqual([]);
      expect(getRoleDefaultPermissions('')).toEqual([]);
    });
  });
});
