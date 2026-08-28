/**
 * What a refusal says to the person who hit it.
 *
 * A permission denial rendered as `PermissionDenied: EditTreeStructure
 * required` — the enum name, in a toast, to somebody who has never seen the
 * permission matrix. It reads like compiler output, and it does not say the one
 * thing that helps: ask an administrator. The permission NAMES also differ from
 * the labels that matrix shows, so even a user who had seen that screen could
 * not match the two.
 */

import { describe, it, expect } from 'vitest';
import { describeWorkspaceError } from '../describe-error';

describe('a workspace error', () => {
  it('turns a permission denial into a sentence with a next step', () => {
    const message = describeWorkspaceError({
      PermissionDenied: 'EditTreeStructure required',
    });

    expect(message).not.toMatch(/EditTreeStructure/);
    expect(message).toMatch(/administrator/i);
  });

  it('names no enum variant for any permission it knows', () => {
    for (const permission of [
      'EditMdx',
      'EditTreeStructure',
      'ManageMembers',
      'ManagePermissions',
      'ViewContent',
      'SendMessages',
      'ManageWorkspace',
    ]) {
      const message = describeWorkspaceError({
        PermissionDenied: `${permission} required`,
      });
      expect(message, permission).not.toMatch(new RegExp(permission));
    }
  });

  it('still says something useful for a permission it does not know', () => {
    // A new permission must not fall through to the raw variant name.
    const message = describeWorkspaceError({ PermissionDenied: 'SomeFuturePermission' });

    expect(message).not.toMatch(/SomeFuturePermission/);
    expect(message).toMatch(/permission/i);
  });

  it('passes other errors through, because their detail is the only clue', () => {
    expect(describeWorkspaceError({ NotFound: 'no such office' })).toBe(
      'NotFound: no such office',
    );
    expect(describeWorkspaceError('Workspace not found')).toBe('Workspace not found');
  });

  it('does not render an object as [object Object]', () => {
    expect(describeWorkspaceError({ SomeVariant: { nested: true } })).toBe('SomeVariant');
    expect(describeWorkspaceError(null)).toBe('The server rejected the request.');
  });
});
