/**
 * Turning internal-service group responses into the events the UI listens for.
 *
 * `use-group-state` subscribes to group:created, group:invite-received,
 * group:member-joined, group:member-left, group:member-kicked and group:deleted.
 * NOTHING emitted any of them, and GroupCreateSuccess was handled nowhere, so
 * the group list could never populate: createGroup fired its request, the
 * response was dropped, and the sidebar stayed empty forever.
 *
 * This is the missing half. Kept pure — a response in, events out — so the
 * mapping can be tested without a socket. The username resolver is injected
 * because the wire carries only CIDs: GroupInviteNotification names no
 * inviter, and MemberStateChanged names joiners purely by number. Resolving
 * here (from the peer roster the caller supplies) is what keeps the invite
 * path alive at all — `buildGroupFromInvite` rejects a nameless inviter, so
 * emitting an empty username silently dropped every invite ever received.
 */

import { groupKeyToId, parseGroupKey } from './group-key';

export interface GroupEvent {
  name:
    | 'group:created'
    | 'group:invite-received'
    | 'group:member-joined'
    | 'group:member-left'
    | 'group:deleted'
    /**
     * The server's answer to `GroupListGroupsFor` — the only message that can
     * establish a group is GONE. Every other event is additive or arrives only
     * while you are online to see it, so without this a group deleted while
     * offline is in the sidebar forever. See reconcile-groups.ts.
     */
    | 'group:list-received'
    /**
     * The server refused a group operation.
     *
     * `GroupCreateFailure` and its siblings carry a message and a request_id
     * and were mapped by nothing — no failure variant of any group operation
     * had a handler. The dialog resolves on DISPATCH and closes, so a refused
     * create looked exactly like a successful one that had not arrived yet:
     * the form cleared, the dialog shut, and the sidebar never gained the
     * group. Nothing was ever said.
     */
    | 'group:failed';
  payload: Record<string, unknown>;
}

/** Supplies a display name for a CID; the caller decides the fallback. */
export type PeerNameResolver = (cid: bigint) => string;

function variant(message: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const value: unknown = message[name];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/**
 * The member CIDs a MemberStateChanged variant carries.
 *
 * The wire shape is citadel_types' `MemberState::EnteredGroup { cids }` /
 * `LeftGroup { cids }` — a LIST of members, and the notification's own `cid`
 * field is the RECIPIENT's session, not the member who moved. The first cut
 * of this mapping looked for `Joined`/`Left`/`Kicked` variants and read the
 * member from that recipient field: shapes that do not exist on the wire read
 * through a field that means someone else, so no membership change was ever
 * applied and a creator's roster stayed just themselves forever.
 */
function toCid(raw: unknown): bigint | null {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return BigInt(raw as string | number | bigint);
  } catch {
    return null;
  }
}

function memberCids(state: Record<string, unknown>, key: 'EnteredGroup' | 'LeftGroup'): bigint[] {
  const inner: Record<string, unknown> | undefined = variant(state, key);
  if (!inner || !Array.isArray(inner.cids)) return [];
  const cids: bigint[] = [];
  for (const raw of inner.cids) {
    try {
      cids.push(BigInt(raw as string | number | bigint));
    } catch {
      // A cid that does not parse identifies nobody; dropping it beats
      // fabricating a member out of garbage.
    }
  }
  return cids;
}

/**
 * Map one websocket message to the group events it implies — empty when it is
 * not a group response. A single MemberStateChanged can name several members,
 * which is why this returns a list.
 *
 * `selfCid` is needed because a create response names no owner other than the
 * caller; `peerName` because the wire identifies peers only by CID.
 */
export function toGroupEvents(
  message: Record<string, unknown>,
  selfCid: bigint,
  selfUsername: string,
  peerName: PeerNameResolver,
): GroupEvent[] {
  const created: Record<string, unknown> | undefined = variant(message, 'GroupCreateSuccess') ?? variant(message, 'GroupChannelCreateSuccess');
  if (created) {
    return [{
      name: 'group:created',
      payload: {
        groupId: groupKeyToId(parseGroupKey(created.group_key)),
        // The backend carries no group name; the creator's own name stands in
        // until a rename lands, which is what use-group-state falls back to.
        name: '',
        ownerId: String(created.cid ?? selfCid),
        ownerUsername: selfUsername,
      },
    }];
  }

  // Every failure variant the group plane can produce, in one arm. They share
  // a shape — cid, message, request_id — and mapping them individually is how
  // the next one comes to be forgotten.
  for (const name of [
    'GroupCreateFailure',
    'GroupChannelCreateFailure',
    'GroupInviteFailure',
    'GroupJoinFailure',
    'GroupLeaveFailure',
    'GroupKickFailure',
    'GroupDisconnectFailure',
    'GroupEndFailure',
  ]) {
    const failed: Record<string, unknown> | undefined = variant(message, name);
    if (failed) {
      return [{
        name: 'group:failed',
        payload: {
          operation: name.replace(/^Group|Failure$/g, ''),
          message: typeof failed.message === 'string' ? failed.message : '',
          requestId: typeof failed.request_id === 'string' ? failed.request_id : undefined,
        },
      }];
    }
  }

  const invited: Record<string, unknown> | undefined = variant(message, 'GroupInviteNotification');
  if (invited) {
    const inviterCid: bigint = BigInt((invited.peer_cid ?? 0) as string | number | bigint);
    return [{
      name: 'group:invite-received',
      payload: {
        groupId: groupKeyToId(parseGroupKey(invited.group_key)),
        groupName: '',
        inviterId: inviterCid.toString(),
        inviterUsername: peerName(inviterCid),
      },
    }];
  }

  const memberChange: Record<string, unknown> | undefined = variant(message, 'GroupMemberStateChangeNotification');
  if (memberChange) {
    const groupId: string = groupKeyToId(parseGroupKey(memberChange.group_key));
    const state: Record<string, unknown> = (memberChange.state ?? {}) as Record<string, unknown>;
    return [
      ...memberCids(state, 'EnteredGroup').map((cid) => ({
        name: 'group:member-joined' as const,
        payload: { groupId, memberCid: cid, memberUsername: peerName(cid) },
      })),
      ...memberCids(state, 'LeftGroup').map((cid) => ({
        name: 'group:member-left' as const,
        payload: { groupId, memberCid: cid },
      })),
    ];
  }

  const left: Record<string, unknown> | undefined = variant(message, 'GroupLeaveNotification');
  if (left) {
    // A cid that does not parse identifies nobody, so emit nothing. This used
    // to send `String(left.cid ?? '')`, and the handler turned that into
    // `BigInt('')` -- which is 0n, a real cid. A notification arriving without
    // one therefore removed whoever happened to be member zero.
    const cid: bigint | null = toCid(left.cid);
    if (cid === null) return [];
    return [{
      name: 'group:member-left',
      payload: {
        groupId: groupKeyToId(parseGroupKey(left.group_key)),
        memberCid: cid,
      },
    }];
  }

  const ended: Record<string, unknown> | undefined = variant(message, 'GroupEndNotification');
  if (ended) {
    // Gated on `success`. This ignored the field entirely, so a FAILED end
    // still removed the group from the owner's sidebar — the group survived on
    // the server while the only person who could delete it stopped seeing it.
    if (ended.success === false) return [];
    return [{
      name: 'group:deleted',
      payload: { groupId: groupKeyToId(parseGroupKey(ended.group_key)) },
    }];
  }

  // The OTHER members' half of a deletion.
  //
  // `GroupEndNotification` is the owner's own confirmation. Everyone else is
  // told through `GroupDisconnectNotification` — which was handled nowhere, so
  // deleting a group deleted it only for the person who pressed the button.
  // Every other member kept it in the sidebar and kept typing into it, and
  // because the server's group messaging has no membership check, those
  // messages still went somewhere.
  //
  // The same notification is how a KICKED member learns they were removed, and
  // it was equally unhandled.
  const disconnected: Record<string, unknown> | undefined = variant(message, 'GroupDisconnectNotification');
  if (disconnected) {
    return [{
      name: 'group:deleted',
      payload: { groupId: groupKeyToId(parseGroupKey(disconnected.group_key)) },
    }];
  }

  // Both spellings: the internal service declares GroupListGroupsSuccess and
  // GroupListGroupsResponse with the same `group_list` field, and which one a
  // given build sends is not something the UI should have to know.
  const listed: Record<string, unknown> | undefined = variant(message, 'GroupListGroupsSuccess') ?? variant(message, 'GroupListGroupsResponse');
  if (listed) {
    // `group_list` is Option<Vec<..>> on the wire. Null is NOT "you are in no
    // groups" — it is no answer, and reconciling against it would delete every
    // group the account has. Only a real array is a statement about membership.
    if (!Array.isArray(listed.group_list)) return [];
    return [{
      name: 'group:list-received',
      payload: {
        groupIds: listed.group_list.map((key) => groupKeyToId(parseGroupKey(key))),
      },
    }];
  }

  return [];
}
