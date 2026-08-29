/**
 * Wire-level dispatch of Citadel message-group requests.
 *
 * Owns the shape of each GroupCreate / GroupInvite / GroupLeave / GroupKick /
 * GroupListGroupsFor request and the connection/client lookup that sends it —
 * including the MessageGroupKey encoding via groupIdToKey (see group-key.ts).
 * Split from hooks/use-group-conversations.ts so the hook keeps React state
 * and error surfacing while the protocol encoding lives beside the other
 * group-conversation wire modules.
 */

import { websocketService } from '@/lib/websocket-service';
import { toInternalServiceRequest } from '@/hooks/use-group-conversations.types';
import { groupIdToKey } from './group-key';
import type { CurrentConnectionInfo } from '@/lib/connection/types';

async function requireCid(): Promise<bigint> {
  const connectionInfo: CurrentConnectionInfo | null = (await import('../connection')).connectionManager.getConnectionInfo();
  const cid: bigint | null = connectionInfo?.cid || null;
  if (!cid) {
    throw new Error('Not connected to server');
  }
  return BigInt(cid);
}

/**
 * Send a group request the way every other subsystem sends one.
 *
 * This used to be `websocketService.getClient()`, which returns null in every
 * FOLLOWER tab by design — there is one WebSocket per browser, the leader owns
 * the client, and followers proxy through it. So all six group operations threw
 * "WebSocket client not initialized" in any tab but one: creating a group,
 * inviting, leaving, kicking, refreshing the list, and — worst — answering an
 * invitation.
 *
 * The invite case corrupted state silently. `applyGroupInvite` adds the group
 * locally first and then calls `sendGroupRespond`; in a follower that threw into
 * a catch that only debugLogs, which is nothing in production. The user saw the
 * group and could be messaged over P2P while the server never recorded their
 * membership: the creator's roster stayed empty, group calls stayed disabled,
 * and the first outbound send failed on a membership error with no UI signal
 * anywhere. Group invitations are CID-routed to the tab owning that session, so
 * the tab that receives one is frequently not the leader.
 *
 * Nothing here needs the raw client. `sendMessage` awaits init, sends directly
 * on the leader and proxies on a follower.
 */
async function sendGroupRequest(request: Record<string, unknown>): Promise<void> {
  await websocketService.sendMessage(toInternalServiceRequest(request) as unknown as Record<string, unknown>);
}

/** Returns the request_id so the caller can correlate the eventual response. */
export async function sendGroupCreate(
  initialMembers: Array<{ cid: string; username: string; roleId?: string }>
): Promise<string> {
  const requestId = crypto.randomUUID();
  const cid: bigint = await requireCid();
  const request = {
    GroupCreate: {
      cid,
      request_id: requestId,
      // The wire type is Vec<UserIdentifier>, an externally-tagged enum — a
      // bare u64 fails to deserialize, the client rejects the request, and it
      // never leaves the browser. Invisible to tsc because
      // toInternalServiceRequest is a cast, and invisible to use because an
      // EMPTY list deserializes fine — only creating a group with members,
      // the one thing the dialog requires, could hit it.
      initial_users_to_invite: initialMembers.map(m => ({ ID: BigInt(m.cid) })),
    },
  };
  await sendGroupRequest(request);
  return requestId;
}

export async function sendGroupInvite(groupId: string, peerCid: string): Promise<void> {
  const cid: bigint = await requireCid();
  const request = {
    GroupInvite: {
      cid,
      peer_cid: BigInt(peerCid),
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await sendGroupRequest(request);
}

/**
 * Answer a group invitation at the backend.
 *
 * The UI's auto-accept used to be local-only: the invitee's sidebar gained the
 * group while the server still counted them merely invited, so the membership
 * broadcast that adds them to everyone else's roster never fired — and since a
 * group's callable roster IS its members, group calls stayed disabled for the
 * creator. `invitation: true` marks this as answering an invite we received
 * rather than a join request we reviewed.
 */
export async function sendGroupRespond(
  groupId: string,
  inviterCid: string,
  accept: boolean
): Promise<void> {
  const cid: bigint = await requireCid();
  const request = {
    GroupRespondRequest: {
      cid,
      peer_cid: BigInt(inviterCid),
      group_key: groupIdToKey(groupId),
      response: accept,
      invitation: true,
      request_id: crypto.randomUUID(),
    },
  };
  await sendGroupRequest(request);
}

export async function sendGroupLeave(groupId: string): Promise<void> {
  const cid: bigint = await requireCid();
  const request = {
    GroupLeave: {
      cid,
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await sendGroupRequest(request);
}

export async function sendGroupKick(groupId: string, memberCid: string): Promise<void> {
  const cid: bigint = await requireCid();
  const request = {
    GroupKick: {
      cid,
      peer_cid: BigInt(memberCid),
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await sendGroupRequest(request);
}

export async function sendGroupListRequest(): Promise<void> {
  const cid: bigint = await requireCid();
  const request = {
    GroupListGroupsFor: {
      cid,
      peer_cid: null,
      request_id: crypto.randomUUID(),
    },
  };
  await sendGroupRequest(request);
}

/**
 * End (delete) a group. Lived inline in GroupChatPage, which is why it was the
 * one group operation that never learned the follower-tab lesson the others
 * eventually did — it is here now, beside its five siblings.
 */
export async function sendGroupEnd(groupId: string): Promise<void> {
  const cid: bigint = await requireCid();
  const request = {
    GroupEnd: {
      cid,
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await sendGroupRequest(request);
}
