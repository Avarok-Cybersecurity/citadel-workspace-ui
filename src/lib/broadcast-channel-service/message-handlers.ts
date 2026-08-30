/**
 * Broadcast Channel Service - Message Handlers
 *
 * Handlers for each broadcast message type received from other tabs.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { getSelectedUser , type TabUserContext } from '@/lib/tab-context';
import { instanceManager } from '@/lib/multi-instance';
import { debugLog } from '@/lib/debug-config';
import { BROADCAST_MESSAGE_TYPES } from '@/lib/multi-instance/routing-rules';
import type { BroadcastMessage, PendingRequest } from './types';

/**
 * Handle workspace-response messages from leader tab.
 * Forwards to event system for non-leader tabs after CID filtering.
 */
export async function handleWorkspaceResponse(
  message: BroadcastMessage,
  isLeader: boolean,
  isResponseForThisCid: (requestId: string, tabCid: bigint) => boolean
): Promise<void> {
  if (!isLeader && message.data) {
    const tabSelection: TabUserContext | null = await getSelectedUser();
    const tabCid: bigint | undefined = tabSelection?.selectedCid;

    if (message.targetCid && tabCid && message.targetCid !== tabCid) {
      debugLog('BroadcastChannelService', `Skipping notification for CID ${message.targetCid.toString().slice(0, 8)}... (we are ${tabCid.toString().slice(0, 8)}...)`);
      return;
    }

    // The notification's OWN cid, not the one the leader stamped.
    //
    // `targetCid` is set for exactly three types, so for everything else the
    // check above compares `undefined` and never skips. Group notifications are
    // built with `request_id: None` as well, so the request-id gate below passes
    // too -- and a follower tab held session B while a peer invited session A to
    // a group, mapped the invite with B's identity, and AUTO-ACCEPTED it. B's
    // sidebar gained a group it was never invited to and the backend received a
    // GroupRespondRequest carrying B's cid.
    //
    // Reading the payload's own cid closes that generically, for every
    // notification type rather than the three somebody remembered to stamp.
    // This is the rule CLAUDE.md states as "never process messages where CID
    // doesn't match".
    const addressedTo: bigint | null = notificationCid(message.data);
    if (addressedTo !== null && tabCid && addressedTo !== tabCid) {
      debugLog('BroadcastChannelService', `Skipping ${messageVariant(message.data) ?? 'message'} addressed to ${addressedTo.toString().slice(0, 8)}... (we are ${tabCid.toString().slice(0, 8)}...)`);
      return;
    }

    const d: Record<string, unknown> = message.data as Record<string, Record<string, unknown> | unknown>;
    const requestId: unknown = d.request_id ||
      (d.ListAllPeersResponse as Record<string, unknown> | undefined)?.request_id ||
      (d.ListRegisteredPeersResponse as Record<string, unknown> | undefined)?.request_id ||
      (d.GetSessionsResponse as Record<string, unknown> | undefined)?.request_id ||
      (d.LocalDBGetKVSuccess as Record<string, unknown> | undefined)?.request_id ||
      (d.LocalDBSetKVSuccess as Record<string, unknown> | undefined)?.request_id;

    if (!requestId || (tabCid && isResponseForThisCid(requestId as string, tabCid))) {
      debugLog('BroadcastChannelService', 'Forwarding workspace response to event system');
      eventEmitter.emit('websocket-message', message.data);
      eventEmitter.emit('broadcast-workspace-response', message.data);
    }
  }
}

/** The variant name of a wire message, i.e. its single top-level key. */
function messageVariant(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const keys: string[] = Object.keys(data as Record<string, unknown>);
  return keys.length === 1 ? keys[0] : null;
}

/**
 * Which session a broadcast message is addressed to, or null if it is not
 * addressed to one.
 *
 * Null means "forward it": plenty of traffic legitimately names no session --
 * the request/response messages a follower proxies through the leader, for one
 * -- and dropping those would silence the follower entirely.
 *
 * `BROADCAST_MESSAGE_TYPES` are also treated as unaddressed even when they
 * carry a cid. Those are deliberate fan-out: every tab needs to know about a
 * disconnect or a deregistration, and filtering them by cid would undo that on
 * purpose-built behaviour.
 */
function notificationCid(data: unknown): bigint | null {
  const variant: string | null = messageVariant(data);
  if (variant === null || BROADCAST_MESSAGE_TYPES.includes(variant)) return null;

  const payload: unknown = (data as Record<string, unknown>)[variant];
  if (!payload || typeof payload !== 'object') return null;

  const cid: unknown = (payload as Record<string, unknown>).cid;
  if (typeof cid === 'bigint') return cid;
  // The wire carries u64 as a string in some paths; a cid that does not parse
  // names nobody, and guessing is how a message reaches the wrong session.
  if (typeof cid === 'string' && /^\d+$/.test(cid)) return BigInt(cid);
  return null;
}

/**
 * Handle register-request messages to track CID ownership of requests.
 */
export function handleRegisterRequest(
  message: BroadcastMessage,
  pendingRequests: Map<string, PendingRequest>
): void {
  const data: Record<string, unknown> | null = message.data as Record<string, unknown> | null;
  if (data && data.requestId && data.cid) {
    pendingRequests.set(data.requestId as string, {
      cid: data.cid as bigint,
      insertTime: Date.now()
    });
  }
}

export function handleStateSync(message: BroadcastMessage): void {
  eventEmitter.emit('broadcast-state-sync', message.data);
}

/**
 * Handle connection-status messages by forwarding to event system.
 */
export function handleConnectionStatus(message: BroadcastMessage): void {
  eventEmitter.emit('broadcast-connection-status', message.data);
}

/**
 * Handle P2P raw messages for Yjs sync forwarding to non-leader tabs.
 */
export function handleP2PRawMessage(
  message: BroadcastMessage,
  isLeader: boolean
): void {
  if (!isLeader && message.data) {
    debugLog('BroadcastChannelService', 'Forwarding P2P raw message to event system');
    eventEmitter.emit('p2p:raw-message', message.data);
  }
}

/**
 * Handle P2P notification messages for chat processing on follower tabs.
 */
export async function handleP2PNotification(
  message: BroadcastMessage,
  isLeader: boolean
): Promise<void> {
  debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification received:', {
    isLeader,
    hasData: !!message.data,
    fromTabId: message.tabId
  });

  if (!isLeader && message.data) {
    const p2pData: Record<string, unknown> = message.data as Record<string, unknown>;
    const notification: Record<string, unknown> | undefined = p2pData.notification as Record<string, unknown> | undefined;
    const messageBytes: unknown = p2pData.messageBytes;
    if (!notification) {
      debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification: No notification in data');
      return;
    }

    const tabSelection: TabUserContext | null = await getSelectedUser();
    const tabCid: bigint | null = tabSelection?.selectedCid ?? instanceManager.cid;
    const notificationCid: string | undefined = notification.cid?.toString();
    const peerCid: string | undefined = notification.peer_cid?.toString();
    const tabCidStr: string | undefined = tabCid?.toString();

    debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification checking session match:', {
      notificationCid,
      peerCid,
      tabCidStr,
      hasMessageBytes: !!messageBytes,
      messageLength: Array.isArray(notification.message) ? notification.message.length : 0,
      isMatch: tabCidStr && notificationCid === tabCidStr
    });

    if (tabCidStr && notificationCid === tabCidStr) {
      debugLog('BroadcastChannelService', '[BroadcastChannel] Forwarding P2P notification for our session', {
        notificationCid,
        tabCidStr,
        peerCid
      });
      eventEmitter.emit('websocket-message', { MessageNotification: notification });
    } else {
      debugLog('BroadcastChannelService', '[BroadcastChannel] P2P notification NOT for our session, ignoring', {
        notificationCid,
        tabCidStr,
        reason: !tabCidStr ? 'no tabCid selected' : 'CID mismatch'
      });
    }
  } else if (isLeader) {
    debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification: Ignoring (we are leader)');
  }
}
