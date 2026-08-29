/**
 * P2P Auto-Connect: Incoming Connection Handler
 *
 * Handles incoming PeerConnect requests when another peer initiates.
 * Extracted from connection-logic.ts to stay under 250-line limit.
 */

import { websocketService } from '../websocket-service';
import { eventEmitter } from '../event-emitter';
import { debugLog } from '@/lib/debug-config';
import type { AutoConnectState } from './state';
import { FRESH_CONNECTION_THRESHOLD_MS } from './types';
import { getCurrentCid } from './cid-resolver';
import type { PeerConnectionInfo } from '@/lib/p2p-auto-connect/types';

/**
 * Handle incoming PeerConnect request (when other peer initiates).
 *
 * This function ONLY accepts incoming connections - it does NOT call PeerConnect back.
 * Calling PeerConnect back would cause an infinite loop.
 *
 * Notification field mapping (from backend peer_event.rs):
 * - notification.cid = TARGET's CID (who should accept - this is US)
 * - notification.peer_cid = INITIATOR's CID (who called PeerConnect)
 */
export async function handleIncomingPeerConnect(
  state: AutoConnectState,
  notification: { cid?: bigint; peer_cid?: bigint; peer_username?: string },
  broadcastPeerConnected: (localCid: bigint, peerCid: bigint, peerUsername: string) => void
): Promise<void> {
  const targetCid: bigint | undefined = notification.cid;
  const initiatorCid: bigint | undefined = notification.peer_cid;
  const peerUsername: string = notification.peer_username || '';

  if (initiatorCid === undefined || targetCid === undefined) {
    debugLog('P2PAutoConnectService', 'Invalid PeerConnectNotification - missing cid or peer_cid');
    return;
  }

  const currentCid: bigint | null = await getCurrentCid();
  if (!currentCid) {
    debugLog('P2PAutoConnectService', 'No current CID, cannot process incoming connection');
    return;
  }

  // Only process if WE are the target
  if (targetCid !== currentCid) {
    debugLog('P2PAutoConnectService', `P2PAutoConnect: Ignoring PeerConnectNotification - target is ${targetCid.toString().slice(0, 8)}... (we are ${currentCid.toString().slice(0, 8)}...)`);
    return;
  }

  // Check existing connection - distinguish fresh vs stale
  if (state.isPeerConnectedForSession(currentCid, initiatorCid)) {
    const peerInfo: PeerConnectionInfo | null = state.getPeerConnectionInfo(currentCid, initiatorCid);
    const connectionAge: number = peerInfo ? Date.now() - peerInfo.connectedAt : Infinity;
    if (connectionAge < FRESH_CONNECTION_THRESHOLD_MS) {
      debugLog('P2PAutoConnectService', `P2PAutoConnect: Connection to ${initiatorCid.toString().slice(0, 8)}... is fresh (${connectionAge}ms old), skipping`);
    } else {
      debugLog('P2PAutoConnectService', `Local connectedPeers has ${initiatorCid.toString().slice(0, 8)}... but peer is reconnecting. Clearing stale state.`);
      state.setPeerDisconnected(currentCid, initiatorCid);
    }
  }

  // Handle simultaneous connect scenario
  if (state.hasPendingConnection(initiatorCid)) {
    debugLog('P2PAutoConnectService', `P2PAutoConnect: SIMULTANEOUS_CONNECT detected for ${initiatorCid.toString().slice(0, 8)}...`);
    state.removePendingConnection(initiatorCid);
    state.cancelRetry(initiatorCid);
  }

  // Mark initiator as connected - INSTANT update
  broadcastPeerConnected(currentCid, initiatorCid, peerUsername);
  state.cancelRetry(initiatorCid);
  debugLog('P2PAutoConnectService', `P2PAutoConnect: Incoming connection from ${initiatorCid.toString().slice(0, 8)}... (they initiated)`);

  try {
    debugLog('P2PAutoConnectService', `P2PAutoConnect: Sending PeerConnectAccept for ${initiatorCid.toString().slice(0, 8)}...`);
    await websocketService.acceptPeerConnect(currentCid, initiatorCid, notification);
    debugLog('P2PAutoConnectService', `P2PAutoConnect: PeerConnectAccept sent for ${initiatorCid.toString().slice(0, 8)}...`);
    eventEmitter.emit('p2p-connection-established', { peerCid: initiatorCid });
  } catch (error) {
    const errMsg: string = String(error);
    if (errMsg.includes('already connected') || errMsg.includes('Already connected')) {
      debugLog('P2PAutoConnectService', `P2PAutoConnect: Channel already exists for ${initiatorCid.toString().slice(0, 8)}...`);
      eventEmitter.emit('p2p-connection-established', { peerCid: initiatorCid });
    } else {
      debugLog('P2PAutoConnectService', `Failed to accept connection from ${initiatorCid.toString().slice(0, 8)}...:`, error);
      state.setPeerDisconnected(currentCid, initiatorCid);
    }
  }
}
