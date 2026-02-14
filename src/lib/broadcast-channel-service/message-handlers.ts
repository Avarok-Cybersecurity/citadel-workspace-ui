/**
 * Broadcast Channel Service - Message Handlers
 *
 * Handlers for each broadcast message type received from other tabs.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { getSelectedUser } from '@/lib/tab-context';
import { instanceManager } from '@/lib/multi-instance';
import { debugLog } from '@/lib/debug-config';
import type { BroadcastMessage, PendingRequest } from './types';
import { isLeaderElectionMessage } from './types';

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
    const tabSelection = await getSelectedUser();
    const tabCid = tabSelection?.selectedCid;

    if (message.targetCid && tabCid && message.targetCid !== tabCid) {
      debugLog('BroadcastChannelService', `Skipping notification for CID ${message.targetCid.toString().slice(0, 8)}... (we are ${tabCid.toString().slice(0, 8)}...)`);
      return;
    }

    const d = message.data as Record<string, Record<string, unknown> | unknown>;
    const requestId = d.request_id ||
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

/**
 * Handle register-request messages to track CID ownership of requests.
 */
export function handleRegisterRequest(
  message: BroadcastMessage,
  pendingRequests: Map<string, PendingRequest>
): void {
  const data = message.data as Record<string, unknown> | null;
  if (data && data.requestId && data.cid) {
    pendingRequests.set(data.requestId as string, {
      cid: data.cid as bigint,
      insertTime: Date.now()
    });
  }
}

/**
 * Handle leader-election messages from other tabs.
 */
export function handleLeaderElection(
  message: BroadcastMessage,
  isLeader: boolean,
  tabId: string,
  setLeaderState: (isLeader: boolean, heartbeat: number) => void
): void {
  if (!isLeaderElectionMessage(message.data)) {
    debugLog('BroadcastChannelService', 'Invalid leader election message data, ignoring');
    return;
  }
  const electionData = message.data;

  if (message.isLeader) {
    setLeaderState(isLeader, Date.now());

    if (isLeader && electionData.tabId !== tabId) {
      debugLog('BroadcastChannelService', `Tab ${electionData.tabId} is now the leader`);
      setLeaderState(false, Date.now());
      eventEmitter.emit('leader-changed', { isLeader: false, leaderId: electionData.tabId });
    }
  }
}

/**
 * Handle state-sync messages by forwarding to event system.
 */
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
    const p2pData = message.data as Record<string, unknown>;
    const notification = p2pData.notification as Record<string, unknown> | undefined;
    const messageBytes = p2pData.messageBytes;
    if (!notification) {
      debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification: No notification in data');
      return;
    }

    const tabSelection = await getSelectedUser();
    const tabCid = tabSelection?.selectedCid ?? instanceManager.cid;
    const notificationCid = notification.cid?.toString();
    const peerCid = notification.peer_cid?.toString();
    const tabCidStr = tabCid?.toString();

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
