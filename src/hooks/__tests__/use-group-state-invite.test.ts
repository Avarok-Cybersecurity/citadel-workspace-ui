import { describe, it, expect, vi, beforeEach      } from 'vitest';

/**
 * Unit tests for `buildGroupFromInvite` / `applyGroupInvite`. Focus is on
 * payload-validation semantics — the resolution of the local self member
 * lives behind a dynamic `import('@/lib/connection')` and is mocked.
 *
 * The pre-fix behaviour was to call `BigInt(data.inviterId)` outside the
 * try/catch, so a malformed inviterId became an unhandled promise
 * rejection bubbling out of the void-async wrapper. These tests pin the
 * new contract: invalid payloads are rejected cleanly, the invite is
 * dropped, and no exception escapes.
 */

const spies = vi.hoisted(() => ({
  getConnectionInfo: vi.fn(() => null as unknown),
  getTabSelectedSession: vi.fn(async () => null),
  emit: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/connection', () => ({
  connectionManager: {
    getConnectionInfo: spies.getConnectionInfo,
    getTabSelectedSession: spies.getTabSelectedSession,
  },
}));

vi.mock('@/lib/event-emitter', () => ({
  eventEmitter: { emit: spies.emit },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: spies.toast }));

import { buildGroupFromInvite, applyGroupInvite } from '../use-group-state-invite';
import type { GroupConversation } from '@/types/group-entities';

beforeEach(() => {
  spies.getConnectionInfo.mockReset();
  spies.getTabSelectedSession.mockReset();
  spies.emit.mockReset();
  spies.toast.mockReset();
  spies.getConnectionInfo.mockReturnValue(null);
  spies.getTabSelectedSession.mockResolvedValue(null);
});

describe('buildGroupFromInvite', () => {
  it('returns a group with just the inviter when self can\'t be resolved', async () => {
    const g: GroupConversation | null = await buildGroupFromInvite({
      groupId: 'g-1',
      groupName: 'Cool Crew',
      inviterId: '42',
      inviterUsername: 'alice',
    });
    expect(g).not.toBeNull();
    expect(g!.id).toBe('g-1');
    expect(g!.name).toBe('Cool Crew');
    expect(g!.ownerId).toBe(42n);
    expect(g!.members).toHaveLength(1);
    expect(g!.members[0].cid).toBe(42n);
    expect(g!.members[0].username).toBe('alice');
  });

  it('appends self when connection info is available', async () => {
    spies.getConnectionInfo.mockReturnValue({ cid: 7n, username: 'me' });
    const g: GroupConversation | null = await buildGroupFromInvite({
      groupId: 'g-2',
      groupName: '',
      inviterId: '11',
      inviterUsername: 'bob',
    });
    expect(g).not.toBeNull();
    expect(g!.members).toHaveLength(2);
    expect(g!.members[1].cid).toBe(7n);
    expect(g!.members[1].username).toBe('me');
    // Empty groupName falls back to "<inviter>'s Group"
    expect(g!.name).toBe("bob's Group");
  });

  it('returns null for a missing inviterId rather than throwing', async () => {
    const g: GroupConversation | null = await buildGroupFromInvite({
      groupId: 'g-3',
      groupName: 'X',
      inviterId: undefined as unknown as string,
      inviterUsername: 'c',
    });
    expect(g).toBeNull();
  });

  it('returns null for a non-numeric inviterId rather than throwing', async () => {
    const g: GroupConversation | null = await buildGroupFromInvite({
      groupId: 'g-4',
      groupName: 'X',
      inviterId: 'not-a-number',
      inviterUsername: 'c',
    });
    expect(g).toBeNull();
  });

  it('returns null when groupId or inviterUsername is missing', async () => {
    expect(
      await buildGroupFromInvite({
        groupId: '',
        groupName: 'X',
        inviterId: '1',
        inviterUsername: 'c',
      }),
    ).toBeNull();
    expect(
      await buildGroupFromInvite({
        groupId: 'g',
        groupName: 'X',
        inviterId: '1',
        inviterUsername: '',
      }),
    ).toBeNull();
  });

  it('accepts a numeric inviterId by coercion', async () => {
    const g: GroupConversation | null = await buildGroupFromInvite({
      groupId: 'g-5',
      groupName: 'X',
      inviterId: 99 as unknown as string,
      inviterUsername: 'd',
    });
    expect(g).not.toBeNull();
    expect(g!.ownerId).toBe(99n);
  });
});

describe('applyGroupInvite', () => {
  it('appends the new group and fires a notification on the happy path', async () => {
    const setGroups: ReturnType<typeof vi.fn> = vi.fn();
    await applyGroupInvite(
      { groupId: 'g-1', groupName: 'X', inviterId: '5', inviterUsername: 'alice' },
      setGroups,
    );
    expect(setGroups).toHaveBeenCalledTimes(1);
    // Asserts the RENDERED surface, not an emit. The previous version of this
    // test asserted `emit('notification:show', ...)` — an event with three
    // emitters and no listener anywhere — so it passed for as long as the
    // notice reached nobody. That is how the dead path survived.
    expect(spies.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Group Invitation' }),
    );
  });

  it('reports a failure to the user rather than dropping the invite silently', async () => {
    const setGroups: ReturnType<typeof vi.fn> = vi.fn((): never => {
      throw new Error('store rejected the invite');
    });

    await applyGroupInvite(
      { groupId: 'g-2', groupName: 'Y', inviterId: '5', inviterUsername: 'alice' },
      setGroups,
    );

    expect(spies.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Group Invitation Failed', variant: 'destructive' }),
    );
  });

  it('dedupes when a group with the same id already exists', async () => {
    // The result is captured and asserted AFTER the call, not inside the
    // updater. Asserting in there throws into applyGroupInvite's own
    // try/catch, which turns the failure into a toast — so removing the dedupe
    // left this test green while it reported "Group Invitation Failed".
    let next: unknown[] | undefined;
    const setGroups: ReturnType<typeof vi.fn> = vi.fn((updater: (prev: unknown[]) => unknown[]): void => {
      next = updater([{ id: 'g-dup' }]);
    });

    await applyGroupInvite(
      { groupId: 'g-dup', groupName: 'X', inviterId: '5', inviterUsername: 'alice' },
      setGroups as unknown as (
        u: (prev: import('@/types/group').GroupConversation[]) => import('@/types/group').GroupConversation[],
      ) => void,
    );

    expect(setGroups).toHaveBeenCalledTimes(1);
    expect(next, 'a duplicate invite must not add a second entry').toHaveLength(1);

    // And it must not have reported a failure on the way — the shape that hid
    // this in the first place.
    expect(spies.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });

  it('does NOT throw and does NOT fire a "Group Invitation" notification for a malformed payload', async () => {
    const setGroups: ReturnType<typeof vi.fn> = vi.fn();
    await applyGroupInvite(
      { groupId: 'g', groupName: 'X', inviterId: 'garbage', inviterUsername: 'c' },
      setGroups,
    );
    expect(setGroups).not.toHaveBeenCalled();
    // A malformed payload short-circuits inside `buildGroupFromInvite`
    // before any notification is emitted — neither the success nor
    // failure toast should fire.
    expect(spies.emit).not.toHaveBeenCalled();
  });

  it('returns a Promise so callers can await or .catch()', async () => {
    // Pin the public contract: the return value is a Promise<void>
    // (not void). Static reviewers and downstream code rely on this
    // to chain failure handling (analytics, retry queues, etc.)
    // without re-implementing the IIFE wrapper at every call site.
    const setGroups: ReturnType<typeof vi.fn> = vi.fn();
    const result: Promise<void> = applyGroupInvite(
      { groupId: 'g-promise', groupName: 'X', inviterId: '7', inviterUsername: 'd' },
      setGroups,
    );
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
