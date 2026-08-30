/**
 * `hasPermission` returns `false` for a cache MISS, and every caller that
 * renders a denial needs to know the difference.
 *
 * A three-user office run told all three users "You do not have permission to
 * send messages here" and took their composer away: the office chat gated on
 * `SendMessages`, and the answer for that domain had never been stored. Nothing
 * at the call site could tell that from a real refusal.
 *
 * `hasAnswerFor` is that difference. The workspace root counts, because
 * `hasPermission` falls back to it — a root entry is an answer for every domain
 * beneath it, which is exactly why a miss on the child is not "no".
 */
import { describe, it, expect } from 'vitest';
import { hasAnswerFor, hasPermission } from '../cache';
import { Permission, type DomainPermissions } from '../types';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

function entry(permissions: Permission[]): DomainPermissions {
  return { role: null, permissions: new Set(permissions) } as unknown as DomainPermissions;
}

describe('whether an answer exists', () => {
  it('is false for a cache nobody has filled', () => {
    const cache: Map<string, DomainPermissions> = new Map();
    expect(hasAnswerFor(cache, 'node-1')).toBe(false);

    // The whole point: the permission check says the same thing here as it does
    // for a real refusal.
    expect(hasPermission(cache, 'node-1', Permission.SendMessages)).toBe(false);
  });

  it('is true once that domain has answered', () => {
    // The positive control: a version returning false always would satisfy the
    // test above and make every permission unenforceable.
    const cache: Map<string, DomainPermissions> = new Map([['node-1', entry([])]]);
    expect(hasAnswerFor(cache, 'node-1')).toBe(true);

    // And an answer that grants nothing is still an answer -- a real denial.
    expect(hasPermission(cache, 'node-1', Permission.SendMessages)).toBe(false);
  });

  it('counts the workspace root, because the permission check falls back to it', () => {
    const cache: Map<string, DomainPermissions> = new Map([
      [WORKSPACE_ROOT_ID, entry([Permission.SendMessages])],
    ]);
    expect(hasAnswerFor(cache, 'node-1')).toBe(true);
    expect(hasPermission(cache, 'node-1', Permission.SendMessages)).toBe(true);
  });
});
