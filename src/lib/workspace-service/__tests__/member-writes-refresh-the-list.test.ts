/**
 * The members list has to refresh after an admin changes it.
 *
 * `members:reload` was emitted only from response handlers for `AddMember`,
 * `RemoveMember` and `UpdateMemberRole` — response variants the protocol does
 * not have. All three exist as REQUESTS only; the server answers with `Success`
 * and `MemberRoleUpdated`. So those branches were unreachable and their
 * listeners could never fire: after an admin added a member, removed one, or
 * changed a role, nothing refreshed.
 *
 * It is now emitted after `awaitWriteResponse` resolves — the point at which the
 * change is known to have happened, and the only place that knows it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ resolveWrite: true }));

vi.mock('../await-write-response', () => ({
  awaitWriteResponse: vi.fn(() =>
    h.resolveWrite ? Promise.resolve() : Promise.reject(new Error('refused')),
  ),
}));

import { addMember, removeMember, updateMemberRole } from '../member-operations';
import { eventEmitter } from '@/lib/event-emitter';
import { UserRoleTS } from '@/types/workspace-types';

const sender = { sendProtocolRequest: vi.fn(() => Promise.resolve()) } as never;

function countReloads(run: () => Promise<unknown>) {
  let count = 0;
  const off = eventEmitter.on('members:reload', () => { count += 1; });
  return run()
    .catch(() => undefined)
    .then(() => {
      off();
      return count;
    });
}

beforeEach(() => {
  h.resolveWrite = true;
});

describe('member writes', () => {
  it('ask the members surfaces to reload after an add', async () => {
    expect(await countReloads(() => addMember(sender, 'alice', UserRoleTS.Member))).toBe(1);
  });

  it('ask after a removal', async () => {
    expect(await countReloads(() => removeMember(sender, 'alice'))).toBe(1);
  });

  it('ask after a role change', async () => {
    expect(await countReloads(() => updateMemberRole(sender, 'alice', UserRoleTS.Admin))).toBe(1);
  });

  it('do NOT ask when the server refused', async () => {
    // The reload must follow the confirmation, not the attempt — otherwise the
    // list re-reads and shows the unchanged state as though it were the result.
    h.resolveWrite = false;
    expect(await countReloads(() => addMember(sender, 'alice', UserRoleTS.Member))).toBe(0);
  });
});
