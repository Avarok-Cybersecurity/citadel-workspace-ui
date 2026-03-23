import { describe, it, expect } from 'vitest';
import {
  PERMISSION_CATEGORIES,
  ROLE_HIERARCHY,
  getRoleDefaultPermissions,
} from '../permission-constants';

describe('permission-constants', () => {
  describe('PERMISSION_CATEGORIES', () => {
    it('has all expected categories', () => {
      expect(Object.keys(PERMISSION_CATEGORIES)).toEqual(
        expect.arrayContaining(['Content', 'Messaging', 'Files', 'Members', 'Management', 'System'])
      );
    });

    it('each permission has id, label, and description', () => {
      for (const [, permissions] of Object.entries(PERMISSION_CATEGORIES)) {
        for (const perm of permissions) {
          expect(perm).toHaveProperty('id');
          expect(perm).toHaveProperty('label');
          expect(perm).toHaveProperty('description');
          expect(typeof perm.id).toBe('string');
          expect(typeof perm.label).toBe('string');
          expect(typeof perm.description).toBe('string');
        }
      }
    });

    it('has no duplicate permission IDs', () => {
      const allIds = Object.values(PERMISSION_CATEGORIES).flat().map(p => p.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('contains Admin, Owner, Member, Guest', () => {
      const values = ROLE_HIERARCHY.map(r => r.value);
      expect(values).toContain('Admin');
      expect(values).toContain('Owner');
      expect(values).toContain('Member');
      expect(values).toContain('Guest');
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
    it('Admin gets all permissions', () => {
      const allPermIds = Object.values(PERMISSION_CATEGORIES).flat().map(p => p.id);
      const adminPerms = getRoleDefaultPermissions('Admin');
      expect(adminPerms).toEqual(expect.arrayContaining(allPermIds));
      expect(adminPerms.length).toBe(allPermIds.length);
    });

    it('Owner gets content + messaging + files + members + management but NOT system', () => {
      const ownerPerms = getRoleDefaultPermissions('Owner');
      expect(ownerPerms).toContain('ViewContent');
      expect(ownerPerms).toContain('EditContent');
      expect(ownerPerms).toContain('SendMessages');
      expect(ownerPerms).toContain('CreateNode');
      expect(ownerPerms).not.toContain('ManageDomains');
      expect(ownerPerms).not.toContain('ConfigureSystem');
    });

    it('Member gets content + messaging + files but NOT members/management', () => {
      const memberPerms = getRoleDefaultPermissions('Member');
      expect(memberPerms).toContain('ViewContent');
      expect(memberPerms).toContain('SendMessages');
      expect(memberPerms).not.toContain('AddUsers');
      expect(memberPerms).not.toContain('CreateNode');
    });

    it('Guest gets only ViewContent and ReadMessages', () => {
      const guestPerms = getRoleDefaultPermissions('Guest');
      expect(guestPerms).toEqual(['ViewContent', 'ReadMessages']);
    });

    it('unknown role returns empty array', () => {
      expect(getRoleDefaultPermissions('Unknown')).toEqual([]);
      expect(getRoleDefaultPermissions('')).toEqual([]);
    });

    it('role hierarchy is strictly descending in permission count', () => {
      const admin = getRoleDefaultPermissions('Admin').length;
      const owner = getRoleDefaultPermissions('Owner').length;
      const member = getRoleDefaultPermissions('Member').length;
      const guest = getRoleDefaultPermissions('Guest').length;
      expect(admin).toBeGreaterThan(owner);
      expect(owner).toBeGreaterThan(member);
      expect(member).toBeGreaterThan(guest);
    });
  });
});
