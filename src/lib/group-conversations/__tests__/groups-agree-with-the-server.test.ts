/**
 * A group deleted while you were offline must stop appearing.
 *
 * Every group event is additive or arrives only while you are online: a create
 * you performed, an invite you received, a deletion you were connected to be
 * told about. Restore is a union merge. So nothing could ever REMOVE a group
 * the client did not watch disappear — it survived every reload, because
 * restore read it back and merged it in again.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The wire is the only thing mocked: sendGroupListRequest reaches a WebSocket.
// Everything else here -- the store, the mapping, the snapshot rule -- is the
// production code, which is the whole point of testing the seam and not the
// hook.
vi.mock('../group-requests', () => ({ sendGroupListRequest: vi.fn(async () => {}) }));
import {
  reconcileGroups,
  applyGroupList,
  requestGroupReconcile,
  resetGroupReconcileState,
} from '../reconcile-groups';
import { getGroups, updateGroups } from '../group-store';
import { toGroupEvents } from '../group-events';
import type { GroupConversation } from '@/types/group';

function group(id: string): GroupConversation {
  return {
    id,
    name: id,
    ownerId: '1',
    members: [],
    createdAt: 0,
    unreadCount: 0,
    lastMessageTime: 0,
    lastMessagePreview: '',
    roles: [],
  } as unknown as GroupConversation;
}

const key = (mgid: string) => ({ cid: BigInt(1), mgid: BigInt(mgid) });

describe('reconcileGroups', () => {
  it('drops a group the server no longer lists', () => {
    const held = [group('1:7'), group('1:9')];
    const next = reconcileGroups(held, ['1:7'], new Set(['1:7', '1:9']));
    expect(next.map((g) => g.id)).toEqual(['1:7']);
  });

  it('keeps a group created after the request went out', () => {
    // The server's snapshot predates it, so its absence proves nothing. Judging
    // it by that answer deletes a group the user just made.
    const held = [group('1:7'), group('1:99')];
    const next = reconcileGroups(held, ['1:7'], new Set(['1:7']));
    expect(next.map((g) => g.id)).toEqual(['1:7', '1:99']);
  });

  it('returns the same array when nothing changed, so no listener re-renders', () => {
    const held = [group('1:7')];
    expect(reconcileGroups(held, ['1:7'], new Set(['1:7']))).toBe(held);
  });
});

describe('the list response', () => {
  it('maps GroupListGroupsSuccess to group ids', () => {
    const events = toGroupEvents(
      { GroupListGroupsSuccess: { cid: BigInt(1), group_list: [key('7'), key('9')] } },
      BigInt(1),
      'me',
      () => 'peer',
    );
    expect(events).toEqual([
      { name: 'group:list-received', payload: { groupIds: ['1:7', '1:9'] } },
    ]);
  });

  it('emits NOTHING when group_list is null', () => {
    // Option<Vec<..>> on the wire. Null is "no answer", not "you are in no
    // groups" — reconciling against it deletes every group the account has.
    const events = toGroupEvents(
      { GroupListGroupsSuccess: { cid: BigInt(1), group_list: null } },
      BigInt(1),
      'me',
      () => 'peer',
    );
    expect(events).toEqual([]);
  });

  it('accepts an empty list, which DOES mean no groups', () => {
    const events = toGroupEvents(
      { GroupListGroupsSuccess: { cid: BigInt(1), group_list: [] } },
      BigInt(1),
      'me',
      () => 'peer',
    );
    expect(events).toEqual([
      { name: 'group:list-received', payload: { groupIds: [] } },
    ]);
  });
});

describe('through the store', () => {
  beforeEach(() => {
    resetGroupReconcileState();
    updateGroups(() => [group('1:7'), group('1:9')]);
  });

  it('ignores a list nobody asked for', () => {
    // A late list — one that arrives after a reconnect, say — judges groups
    // created since by an answer that predates all of them. With no request
    // outstanding, the only safe reading of a list is none.
    applyGroupList(['1:7']);
    expect(getGroups().map((g) => g.id)).toEqual(['1:7', '1:9']);
  });

  it('removes the missing group once one WAS asked for', async () => {
    // The positive control for the test above: same call, same list, opposite
    // outcome — so "ignored" is a decision and not an inert code path.
    await requestGroupReconcile();
    applyGroupList(['1:7']);
    expect(getGroups().map((g) => g.id)).toEqual(['1:7']);
  });

  it('answers only the request in flight — a second list is ignored', async () => {
    await requestGroupReconcile();
    applyGroupList(['1:7']);
    applyGroupList([]);
    expect(getGroups().map((g) => g.id)).toEqual(['1:7']);
  });
});
