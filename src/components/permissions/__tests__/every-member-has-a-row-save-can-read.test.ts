import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, roleColumnsFor } from '../permission-constants';

/**
 * Save applies exactly one row: the one matching the member's own role
 * (`rolePermissions[load.role]`). ROLE_HIERARCHY lists four roles while
 * `UserRole` has six, so a Banned member — or one holding a Custom role — had
 * no column at all. An admin could open the editor for them, tick boxes, press
 * Save and be told "Permissions saved successfully" while nothing was sent:
 * every edit had gone to some other role's column, and the row Save read was
 * the untouched one.
 *
 * The property is therefore not "Banned is in the list" but "whatever role the
 * member holds, there is a column Save will read".
 */
describe('roleColumnsFor', () => {
  it('gives a member whose role is not in the hierarchy a column of their own', () => {
    for (const role of ['Banned', 'Custom', '[object Object]']) {
      const columns: { value: string }[] = roleColumnsFor(role);
      expect(
        columns.some((column) => column.value === role),
        `a ${role} member must have a column, or their edits land where Save never looks`,
      ).toBe(true);
    }
  });

  it('leaves the four standard roles exactly as they were', () => {
    for (const known of ROLE_HIERARCHY) {
      expect(roleColumnsFor(known.value)).toEqual(ROLE_HIERARCHY);
    }
  });

  it('adds nothing while the permissions are still loading', () => {
    // The role is unknown until the server answers; inventing a column for
    // `undefined` would render a header labelled "undefined".
    expect(roleColumnsFor(undefined)).toEqual(ROLE_HIERARCHY);
  });

  it('does not duplicate a column when the role is already present', () => {
    const columns: { value: string }[] = roleColumnsFor('Member');
    const members: { value: string }[] = columns.filter((c) => c.value === 'Member');
    expect(members).toHaveLength(1);
  });
});
