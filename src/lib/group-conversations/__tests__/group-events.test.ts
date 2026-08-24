/**
 * use-group-state subscribes to six group:* events and nothing emitted any of
 * them, so the group list could never populate. These pin the mapping that
 * fills that gap — response in, event out.
 */
import { describe, it, expect } from 'vitest';
import { toGroupEvent } from '../group-events';

const SELF = 100n;
const KEY = { cid: 7n, mgid: 42n };

describe('toGroupEvent', () => {
  it('turns GroupCreateSuccess into group:created, which is what adds the group', () => {
    const event = toGroupEvent({ GroupCreateSuccess: { cid: 7n, group_key: KEY } }, SELF, 'alice');

    expect(event?.name).toBe('group:created');
    expect(event?.payload).toMatchObject({ groupId: '7:42', ownerId: '7', ownerUsername: 'alice' });
  });

  it('treats GroupChannelCreateSuccess the same way', () => {
    const event = toGroupEvent({ GroupChannelCreateSuccess: { cid: 7n, group_key: KEY } }, SELF, 'alice');

    expect(event?.name).toBe('group:created');
  });

  it('maps an invite to group:invite-received naming the inviter', () => {
    const event = toGroupEvent(
      { GroupInviteNotification: { cid: SELF, peer_cid: 9n, group_key: KEY } }, SELF, 'alice',
    );

    expect(event?.name).toBe('group:invite-received');
    expect(event?.payload).toMatchObject({ groupId: '7:42', inviterId: '9' });
  });

  it('maps a Joined member-state change to group:member-joined', () => {
    const event = toGroupEvent(
      { GroupMemberStateChangeNotification: { cid: 9n, group_key: KEY, state: { Joined: {} } } }, SELF, 'alice',
    );

    expect(event?.name).toBe('group:member-joined');
    expect(event?.payload).toMatchObject({ groupId: '7:42', memberCid: '9' });
  });

  it.each(['Left', 'Kicked'])('maps a %s member-state change to group:member-left', (kind) => {
    const event = toGroupEvent(
      { GroupMemberStateChangeNotification: { cid: 9n, group_key: KEY, state: { [kind]: {} } } }, SELF, 'alice',
    );

    expect(event?.name).toBe('group:member-left');
  });

  it('accepts a member state that arrived as a bare string', () => {
    const event = toGroupEvent(
      { GroupMemberStateChangeNotification: { cid: 9n, group_key: KEY, state: 'Joined' } }, SELF, 'alice',
    );

    expect(event?.name).toBe('group:member-joined');
  });

  it('maps GroupEndNotification to group:deleted', () => {
    const event = toGroupEvent({ GroupEndNotification: { cid: 7n, group_key: KEY, success: true } }, SELF, 'alice');

    expect(event).toEqual({ name: 'group:deleted', payload: { groupId: '7:42' } });
  });

  it('maps GroupLeaveNotification to group:member-left', () => {
    const event = toGroupEvent(
      { GroupLeaveNotification: { cid: 9n, group_key: KEY, success: true, message: '' } }, SELF, 'alice',
    );

    expect(event?.name).toBe('group:member-left');
    expect(event?.payload).toMatchObject({ memberCid: '9' });
  });

  it('ignores messages that are not group responses', () => {
    expect(toGroupEvent({ PeerRegisterSuccess: { cid: 1n } }, SELF, 'alice')).toBeNull();
    expect(toGroupEvent({}, SELF, 'alice')).toBeNull();
  });

  it('ignores a member-state change it does not recognise, rather than guessing', () => {
    const event = toGroupEvent(
      { GroupMemberStateChangeNotification: { cid: 9n, group_key: KEY, state: { Rekeyed: {} } } }, SELF, 'alice',
    );

    expect(event).toBeNull();
  });

  it('propagates a malformed group key instead of emitting a wrong group id', () => {
    expect(() => toGroupEvent({ GroupCreateSuccess: { cid: 7n, group_key: null } }, SELF, 'alice')).toThrow();
  });
});
