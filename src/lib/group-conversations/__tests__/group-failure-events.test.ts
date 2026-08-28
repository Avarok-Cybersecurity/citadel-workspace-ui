/**
 * The server refusing a group operation must reach the user.
 *
 * `GroupCreateFailure` and its seven siblings carry a message and a request id,
 * and `toGroupEvents` mapped no failure variant of any group operation. That is
 * invisible rather than merely quiet, because the create dialog resolves on
 * DISPATCH and closes: a refused create looked exactly like a successful one
 * that had not arrived yet — the form cleared, the dialog shut, the sidebar
 * never gained the group, and nothing was said.
 */

import { describe, it, expect } from 'vitest';
import { toGroupEvents } from '../group-events';

const noName = () => 'peer';

describe('a refused group operation', () => {
  it('becomes an event carrying the server\'s reason', () => {
    const [event] = toGroupEvents(
      { GroupCreateFailure: { cid: 1n, message: 'not permitted', request_id: 'r-1' } },
      1n,
      'me',
      noName,
    );

    expect(event.name).toBe('group:failed');
    expect(event.payload.message).toBe('not permitted');
    expect(event.payload.operation).toBe('Create');
  });

  it('covers every failure variant the group plane can produce', () => {
    // Mapping them one at a time is how the next one comes to be forgotten,
    // which is the state this replaced.
    const variants = [
      'GroupCreateFailure',
      'GroupChannelCreateFailure',
      'GroupInviteFailure',
      'GroupJoinFailure',
      'GroupLeaveFailure',
      'GroupKickFailure',
      'GroupDisconnectFailure',
      'GroupEndFailure',
    ];

    for (const variant of variants) {
      const [event] = toGroupEvents(
        { [variant]: { cid: 1n, message: 'refused', request_id: 'r' } },
        1n,
        'me',
        noName,
      );
      expect(event?.name, variant).toBe('group:failed');
    }
  });

  it('still produces an event when the server gave no message', () => {
    // The caller supplies the fallback sentence; dropping the event because the
    // message is empty would restore the silence.
    const [event] = toGroupEvents({ GroupCreateFailure: { cid: 1n } }, 1n, 'me', noName);

    expect(event.name).toBe('group:failed');
    expect(event.payload.message).toBe('');
  });

  it('does not mistake a success for a failure', () => {
    const [event] = toGroupEvents(
      { GroupCreateSuccess: { cid: 1n, group_key: { cid: 1n, mgid: 2n } } },
      1n,
      'me',
      noName,
    );

    expect(event.name).toBe('group:created');
  });
});
