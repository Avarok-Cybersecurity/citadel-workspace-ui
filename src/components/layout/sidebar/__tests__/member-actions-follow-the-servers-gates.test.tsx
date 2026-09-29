/**
 * A member's row offers only what the server will do for you, and says why the rest is off.
 *
 * Found live (2026-09-29): a Member saw an Admin's Manage Permissions, Change
 * Role and Remove Member all enabled; each could only end in a refusal.
 *
 * Real: the gate and the menu items. The permission answer is a plain value --
 * the shape `usePermission` returns -- not a mocked hook.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { UsePermissionResult } from '@/hooks/use-permission-result';
import { PERMISSION_SENTENCE } from '@/lib/workspace-response-handler/describe-error';
import {
  memberActionBlocks, ONLY_ADMINS_CHANGE_ROLES, ONLY_ADMINS_MANAGE_PERMISSIONS, type MemberActionBlocks,
} from '../member-actions-gate';
import { MemberActionItems } from '../MemberActionItems';

function answer(fields: Partial<UsePermissionResult>): UsePermissionResult {
  // A settled answer by default; each case overrides the field it is about.
  return { allowed: false, loading: false, reason: null, unanswered: false, answered: true, refresh: async (): Promise<void> => undefined, ...fields };
}

const DENIED: UsePermissionResult = answer({});
const GRANTED: UsePermissionResult = answer({ allowed: true });

describe('memberActionBlocks', () => {
  it('blocks all three for a Member with no RemoveUsers, each with its reason', () => {
    expect(memberActionBlocks('Member', DENIED)).toEqual({
      managePermissions: ONLY_ADMINS_MANAGE_PERMISSIONS,
      changeRole: ONLY_ADMINS_CHANGE_ROLES,
      remove: PERMISSION_SENTENCE.RemoveUsers,
    });
  });

  it('blocks nothing for an Admin or an Owner, in either casing or the object form', () => {
    for (const role of ['Admin', 'owner', { Owner: null }]) {
      expect(memberActionBlocks(role, GRANTED)).toEqual({ managePermissions: null, changeRole: null, remove: null });
    }
  });

  it('follows RemoveUsers separately: a Member granted it may remove, not re-role', () => {
    const blocks: MemberActionBlocks = memberActionBlocks('Member', GRANTED);
    expect(blocks.remove).toBeNull();
    expect(blocks.changeRole).toBe(ONLY_ADMINS_CHANGE_ROLES);
  });

  it('offers everything while the role and the permission are still unknown', () => {
    for (const pending of [answer({ loading: true }), answer({ answered: false }), answer({ unanswered: true })]) {
      expect(memberActionBlocks(undefined, pending)).toEqual({ managePermissions: null, changeRole: null, remove: null });
    }
  });
});

function openMenu(blocks: MemberActionBlocks): void {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <MemberActionItems blocks={blocks} onManagePermissions={() => undefined} onEditMember={() => undefined} onRemoveMember={() => undefined} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe('the member actions menu', () => {
  it('disables what is blocked and shows the reasons once each', () => {
    openMenu(memberActionBlocks('Member', DENIED));
    for (const name of [/manage permissions/i, /change role/i, /remove member/i]) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('data-disabled');
    }
    expect(screen.getByText(ONLY_ADMINS_CHANGE_ROLES)).toBeInTheDocument();
    expect(screen.getByText(PERMISSION_SENTENCE.RemoveUsers)).toBeInTheDocument();
  });

  it('enables all three, with no note, when nothing is blocked', () => {
    openMenu({ managePermissions: null, changeRole: null, remove: null });
    for (const name of [/manage permissions/i, /change role/i, /remove member/i]) {
      expect(screen.getByRole('menuitem', { name })).not.toHaveAttribute('data-disabled');
    }
    expect(screen.queryByTestId('member-actions-blocked-note')).toBeNull();
  });
});
