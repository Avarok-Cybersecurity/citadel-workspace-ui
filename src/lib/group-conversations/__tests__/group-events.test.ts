/**
 * use-group-state subscribes to six group:* events and nothing emitted any of
 * them, so the group list could never populate. These pin the mapping that
 * fills that gap — response in, events out.
 *
 * The member-state cases pin the REAL wire shape: citadel_types'
 * `MemberState::EnteredGroup { cids }` / `LeftGroup { cids }`. An earlier
 * version of this suite pinned `Joined`/`Kicked` variants that do not exist on
 * the wire, which is precisely how the mapping shipped broken with green tests.
 */
import { describe, it, expect } from 'vitest';
import { toGroupEvents } from '../group-events';

const SELF = 100n;
const KEY = { cid: 7n, mgid: 42n };

/** Roster stand-in: names 9n, leaves everyone else to the cid-string fallback. */
const peerName = (cid: bigint): string => (cid === 9n ? 'bob' : cid.toString());

describe('toGroupEvents', () => {
  it('turns GroupCreateSuccess into group:created, which is what adds the group', () => {
    const events = toGroupEvents({ GroupCreateSuccess: { cid: 7n, group_key: KEY } }, SELF, 'alice', peerName);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('group:created');
    expect(events[0].payload).toMatchObject({ groupId: '7:42', ownerId: '7', ownerUsername: 'alice' });
  });

  it('treats GroupChannelCreateSuccess the same way', () => {
    const events = toGroupEvents({ GroupChannelCreateSuccess: { cid: 7n, group_key: KEY } }, SELF, 'alice', peerName);

    expect(events[0]?.name).toBe('group:created');
  });

  it('maps an invite to group:invite-received, naming the inviter from the roster', () => {
    // The wire carries only the inviter's cid. The name matters because the
    // invite handler drops a nameless inviter as malformed — an empty username
    // here silently discarded every invite ever received.
    const events = toGroupEvents(
      { GroupInviteNotification: { cid: SELF, peer_cid: 9n, group_key: KEY } }, SELF, 'alice', peerName,
    );

    expect(events[0]?.name).toBe('group:invite-received');
    expect(events[0]?.payload).toMatchObject({ groupId: '7:42', inviterId: '9', inviterUsername: 'bob' });
  });

  it('maps EnteredGroup to one group:member-joined per member, named from the roster', () => {
    // The notification's own `cid` is the RECIPIENT, not the mover — the
    // members live in the variant's cids list.
    const events = toGroupEvents(
      { GroupMemberStateChangeNotification: { cid: SELF, group_key: KEY, state: { EnteredGroup: { cids: [9n, 11n] } } } },
      SELF, 'alice', peerName,
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      name: 'group:member-joined',
      payload: { groupId: '7:42', memberCid: '9', memberUsername: 'bob' },
    });
    expect(events[1].payload).toMatchObject({ memberCid: '11', memberUsername: '11' });
  });

  it('maps LeftGroup to group:member-left per member', () => {
    const events = toGroupEvents(
      { GroupMemberStateChangeNotification: { cid: SELF, group_key: KEY, state: { LeftGroup: { cids: [9n] } } } },
      SELF, 'alice', peerName,
    );

    expect(events).toEqual([
      { name: 'group:member-left', payload: { groupId: '7:42', memberCid: '9' } },
    ]);
  });

  it('accepts member cids that arrived as strings or numbers', () => {
    const events = toGroupEvents(
      { GroupMemberStateChangeNotification: { cid: SELF, group_key: KEY, state: { EnteredGroup: { cids: ['9', 11] } } } },
      SELF, 'alice', peerName,
    );

    expect(events.map((e) => e.payload.memberCid)).toEqual(['9', '11']);
  });

  it('maps GroupEndNotification to group:deleted', () => {
    const events = toGroupEvents({ GroupEndNotification: { cid: 7n, group_key: KEY, success: true } }, SELF, 'alice', peerName);

    expect(events).toEqual([{ name: 'group:deleted', payload: { groupId: '7:42' } }]);
  });

  it('maps GroupLeaveNotification to group:member-left', () => {
    const events = toGroupEvents(
      { GroupLeaveNotification: { cid: 9n, group_key: KEY, success: true, message: '' } }, SELF, 'alice', peerName,
    );

    expect(events[0]?.name).toBe('group:member-left');
    expect(events[0]?.payload).toMatchObject({ memberCid: '9' });
  });

  it('ignores messages that are not group responses', () => {
    expect(toGroupEvents({ PeerRegisterSuccess: { cid: 1n } }, SELF, 'alice', peerName)).toEqual([]);
    expect(toGroupEvents({}, SELF, 'alice', peerName)).toEqual([]);
  });

  it('emits nothing for a member state it does not recognise, rather than guessing', () => {
    const events = toGroupEvents(
      { GroupMemberStateChangeNotification: { cid: SELF, group_key: KEY, state: { Rekeyed: {} } } }, SELF, 'alice', peerName,
    );

    expect(events).toEqual([]);
  });

  it('propagates a malformed group key instead of emitting a wrong group id', () => {
    expect(() => toGroupEvents({ GroupCreateSuccess: { cid: 7n, group_key: null } }, SELF, 'alice', peerName)).toThrow();
  });
});
