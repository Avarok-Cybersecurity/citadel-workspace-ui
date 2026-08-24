/**
 * Turning internal-service group responses into the events the UI listens for.
 *
 * `use-group-state` subscribes to group:created, group:invite-received,
 * group:member-joined, group:member-left, group:member-kicked and group:deleted.
 * NOTHING emitted any of them, and GroupCreateSuccess was handled nowhere, so
 * the group list could never populate: createGroup fired its request, the
 * response was dropped, and the sidebar stayed empty forever.
 *
 * This is the missing half. Kept pure — a response in, an event out — so the
 * mapping can be tested without a socket.
 */

import { groupKeyToId, parseGroupKey } from './group-key';

export interface GroupEvent {
  name:
    | 'group:created'
    | 'group:invite-received'
    | 'group:member-joined'
    | 'group:member-left'
    | 'group:deleted';
  payload: Record<string, unknown>;
}

/** Field names the backend uses for the member whose state changed. */
type MemberState = { Joined?: unknown; Left?: unknown; Kicked?: unknown } | string;

function variant(message: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const value = message[name];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/**
 * Map one websocket message to the group event it implies, or null when it is
 * not a group response.
 *
 * `selfCid` is needed because the backend reports member changes without saying
 * whether they concern us, and because a create response names no owner other
 * than the caller.
 */
export function toGroupEvent(
  message: Record<string, unknown>,
  selfCid: bigint,
  selfUsername: string,
): GroupEvent | null {
  const created = variant(message, 'GroupCreateSuccess') ?? variant(message, 'GroupChannelCreateSuccess');
  if (created) {
    return {
      name: 'group:created',
      payload: {
        groupId: groupKeyToId(parseGroupKey(created.group_key)),
        // The backend carries no group name; the creator's own name stands in
        // until a rename lands, which is what use-group-state falls back to.
        name: '',
        ownerId: String(created.cid ?? selfCid),
        ownerUsername: selfUsername,
      },
    };
  }

  const invited = variant(message, 'GroupInviteNotification');
  if (invited) {
    return {
      name: 'group:invite-received',
      payload: {
        groupId: groupKeyToId(parseGroupKey(invited.group_key)),
        groupName: '',
        inviterId: String(invited.peer_cid ?? ''),
        inviterUsername: '',
      },
    };
  }

  const memberChange = variant(message, 'GroupMemberStateChangeNotification');
  if (memberChange) {
    const groupId = groupKeyToId(parseGroupKey(memberChange.group_key));
    const state = memberChange.state as MemberState;
    const kind = typeof state === 'string' ? state : Object.keys(state ?? {})[0];
    const memberCid = String(memberChange.cid ?? '');

    if (kind === 'Joined') {
      return {
        name: 'group:member-joined',
        payload: { groupId, memberCid, memberUsername: '' },
      };
    }
    if (kind === 'Left' || kind === 'Kicked') {
      return { name: 'group:member-left', payload: { groupId, memberCid } };
    }
    return null;
  }

  const left = variant(message, 'GroupLeaveNotification');
  if (left) {
    return {
      name: 'group:member-left',
      payload: {
        groupId: groupKeyToId(parseGroupKey(left.group_key)),
        memberCid: String(left.cid ?? ''),
      },
    };
  }

  const ended = variant(message, 'GroupEndNotification');
  if (ended) {
    return {
      name: 'group:deleted',
      payload: { groupId: groupKeyToId(parseGroupKey(ended.group_key)) },
    };
  }

  return null;
}
