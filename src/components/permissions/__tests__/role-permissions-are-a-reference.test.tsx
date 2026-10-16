/**
 * "Role permissions" offered checkboxes and a Save button for edits the server
 * cannot hold: role abilities are fixed in code (`Permission::for_role`), and
 * the only writable grants are per member. Save wrote the admin's own row to
 * the admin, so an edit to any other role's column reported success and sent
 * nothing. It is a reference now; these hold it to that, through the real modal.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PermissionManagerModal } from '../PermissionManagerModal';
import { ROLE_HIERARCHY, getRoleDefaultPermissions } from '../permission-constants';
import { Permission } from '@/lib/permissions-service/types';

const open = (): HTMLElement => {
  render(<PermissionManagerModal isOpen onClose={() => {}} />);
  return screen.getByRole('dialog', { name: 'Role permissions' });
};

describe('the role permissions reference', () => {
  it('offers nothing to edit and nothing to save', () => {
    const dialog: HTMLElement = open();
    expect(within(dialog).queryAllByRole('checkbox')).toEqual([]);
    expect(within(dialog).queryAllByRole('switch')).toEqual([]);
    expect(within(dialog).queryAllByRole('textbox')).toEqual([]);
    expect(within(dialog).queryByRole('button', { name: /save/i })).toBeNull();
    // What is left to press only closes it.
    const buttons: string[] = within(dialog).getAllByRole('button').map((b: HTMLElement) => b.textContent?.trim() ?? '');
    expect(buttons.every((name: string) => name === 'Close')).toBe(true);
  });

  it('says where one person’s permissions are changed instead', () => {
    open();
    expect(screen.getByTestId('role-permissions-how-to-change')).toHaveTextContent('⋯ menu in the member list and choose Manage Permissions');
  });

  it('shows each role’s abilities from the server’s role mirror, in words as well as marks', () => {
    open();
    for (const role of ROLE_HIERARCHY) {
      const granted: Set<string> = new Set(getRoleDefaultPermissions(role.value));
      for (const permission of [Permission.ViewContent, Permission.EditMdx, Permission.DeleteWorkspace]) {
        const cell: HTMLElement = screen.getByTestId(`role-grant-${role.value}-${permission}`);
        const allowed: boolean = granted.has(permission);
        expect(cell).toHaveAttribute('data-role-grant', allowed ? 'yes' : 'no');
        expect(cell).toHaveTextContent(new RegExp(`^${role.label}: ${allowed ? 'can' : 'cannot'} `));
      }
    }
  });
});
