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

async function requireCid(): Promise<bigint> {
  const connectionInfo = (await import('../connection')).connectionManager.getConnectionInfo();
  const cid = connectionInfo?.cid || null;
  if (!cid) {
    throw new Error('Not connected to server');
  }
  return BigInt(cid);
}

function requireClient() {
  const client = websocketService.getClient();
  if (!client) {
    throw new Error('WebSocket client not initialized');
  }
  return client;
}

/** Returns the request_id so the caller can correlate the eventual response. */
export async function sendGroupCreate(
  initialMembers: Array<{ cid: string; username: string; roleId?: string }>
): Promise<string> {
  const requestId = crypto.randomUUID();
  const cid = await requireCid();
  const request = {
    GroupCreate: {
      cid,
      request_id: requestId,
      initial_users_to_invite: initialMembers.map(m => BigInt(m.cid)),
    },
  };
  await requireClient().sendDirectToInternalService(toInternalServiceRequest(request));
  return requestId;
}

export async function sendGroupInvite(groupId: string, peerCid: string): Promise<void> {
  const cid = await requireCid();
  const request = {
    GroupInvite: {
      cid,
      peer_cid: BigInt(peerCid),
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await requireClient().sendDirectToInternalService(toInternalServiceRequest(request));
}

export async function sendGroupLeave(groupId: string): Promise<void> {
  const cid = await requireCid();
  const request = {
    GroupLeave: {
      cid,
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await requireClient().sendDirectToInternalService(toInternalServiceRequest(request));
}

export async function sendGroupKick(groupId: string, memberCid: string): Promise<void> {
  const cid = await requireCid();
  const request = {
    GroupKick: {
      cid,
      peer_cid: BigInt(memberCid),
      group_key: groupIdToKey(groupId),
      request_id: crypto.randomUUID(),
    },
  };
  await requireClient().sendDirectToInternalService(toInternalServiceRequest(request));
}

export async function sendGroupListRequest(): Promise<void> {
  const cid = await requireCid();
  const request = {
    GroupListGroupsFor: {
      cid,
      peer_cid: null,
      request_id: crypto.randomUUID(),
    },
  };
  await requireClient().sendDirectToInternalService(toInternalServiceRequest(request));
}
