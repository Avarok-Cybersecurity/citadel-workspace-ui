/**
 * P2P Registration Service - Connection Lifecycle
 *
 * Handles session sync from GetSessions, auto-accept settings,
 * and accept/decline registration requests.
 */

import { websocketService } from '../websocket-service';
import { peerRegistrationStore } from '../peer-registration-store';
import { stringToBytes, bytesToString } from '../utils/encoding-utils';
import { wireMapEntries } from '@/lib/wire-map';
import { debugLog } from '@/lib/debug-config';
import { eventEmitter } from '../event-emitter';
import type { Peer, PeerInfoResponse, PendingRequestEntry } from './types';
import { AUTO_ACCEPT_KEY, RETRY_BACKOFF_MS, DEFAULT_LIST_RETRIES } from './constants';
import { getCurrentCid, listRegisteredPeers } from './discovery';
import { registerPeer } from './registration';

/**
 * List currently registered peers with retry logic.
 * Reduced retries and backoff to prevent UI freeze.
 */
export async function listRegisteredPeersWithRetry(
  pendingRequests: Map<string, PendingRequestEntry>,
  maxRetries = DEFAULT_LIST_RETRIES
): Promise<PeerInfoResponse[]> {
  let lastError: Error | null = null;
  for (let i: number = 0; i < maxRetries; i++) {
    try {
      return await listRegisteredPeers(pendingRequests);
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!lastError.message?.includes('timed out')) {
        throw error;
      }
      debugLog('P2PRegistrationService', `ListRegisteredPeers attempt ${i + 1}/${maxRetries} timed out, retrying...`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }
  }
  throw lastError || new Error('ListRegisteredPeers failed after retries');
}

/**
 * Sync peer connections from GetSessions data.
 *
 * Validates cached peer_connections against the server's ListRegisteredPeers
 * before adding them. The server is the source of truth for peer registrations.
 */
export async function syncPeerConnectionsFromSession(
  peerConnections: Record<string, { cid: bigint; peer_cid: bigint; peer_username: string }> | undefined,
  allPeers: Map<bigint, Peer>,
  registeredPeers: Map<bigint, Peer>,
  pendingRequests: Map<string, PendingRequestEntry>
): Promise<void> {
  if (!peerConnections) {
    debugLog('P2PRegistrationService', '[P2P Registration] No peer connections to sync');
    return;
  }

  // peer_connections is a Rust HashMap: a JS Map here, on which Object.keys is
  // []. Cached-peer sync after a reconnect therefore synced nothing.
  const peerEntries = wireMapEntries<{ cid: bigint; peer_cid: bigint; peer_username: string }>(
    peerConnections, 'peer_connections',
  );
  const peerCids: string[] = peerEntries.map(([cid]) => cid);
  debugLog('P2PRegistrationService', '[P2P Registration] Syncing peer connections from session:', peerCids);

  let serverPeerCids: Set<bigint> | null = null;
  try {
    const serverPeers: PeerInfoResponse[] = await listRegisteredPeers(pendingRequests);
    serverPeerCids = new Set(
      serverPeers.map(p => p.cid as bigint).filter((c): c is bigint => c !== undefined)
    );
    debugLog('P2PRegistrationService',
      `[P2P Registration] Server has ${serverPeerCids.size} registered peers:`,
      Array.from(serverPeerCids).map(c => c.toString())
    );
  } catch (error: unknown) {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes('CID 0') || errorMessage?.includes('No active')) {
      debugLog('P2PRegistrationService', '[P2P Registration] No active session, skipping sync of cached peer data');
      return;
    }
    debugLog('P2PRegistrationService', '[P2P Registration] Failed to validate peers against server, skipping sync:', errorMessage);
    return;
  }

  for (const [peerCidStr, peerInfo] of peerEntries) {
    const peerCid: bigint = BigInt(peerCidStr);

    if (serverPeerCids && !serverPeerCids.has(peerCid)) {
      debugLog('P2PRegistrationService', `[P2P Registration] Skipping stale peer ${peerCid.toString()} (not in server registry)`);
      continue;
    }

    if (registeredPeers.has(peerCid)) {
      debugLog('P2PRegistrationService', `[P2P Registration] Peer ${peerCid.toString()} already registered`);
      continue;
    }

    const peer: Peer = {
      cid: peerCid,
      username: peerInfo.peer_username || `User ${peerCid.toString().slice(0, 8)}`,
      fullName: peerInfo.peer_username || `User ${peerCid.toString().slice(0, 8)}`,
      isOnline: false,
      isRegistered: true
    };

    allPeers.set(peerCid, peer);
    registeredPeers.set(peerCid, peer);

    debugLog('P2PRegistrationService', `[P2P Registration] Added validated peer from session: ${peerCid.toString()} (${peer.username})`);
    eventEmitter.emit('p2p:peer-registered', { peer });
  }
}

/**
 * Get auto-accept setting from LocalDB.
 * @param cidOverride - Optional CID to use instead of fetching via getCurrentCid().
 */
export async function getAutoAcceptSetting(cidOverride?: bigint): Promise<boolean> {
  try {
    const currentCid = cidOverride ?? await getCurrentCid();
    if (!currentCid || currentCid === 0n) return false;

    const result = await websocketService.sendLocalDBGet(currentCid, AUTO_ACCEPT_KEY);
    if (result?.value) {
      const decoded: string = bytesToString(result.value);
      return decoded === 'true';
    }
  } catch (error: unknown) {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes('Key not found')) {
      debugLog('P2PRegistrationService', '[P2P] Auto-accept setting not found, using default: false');
    } else {
      debugLog('P2PRegistrationService', 'Failed to get auto-accept setting:', error);
    }
  }
  return false;
}

/**
 * Set auto-accept setting in LocalDB.
 */
export async function setAutoAcceptSetting(autoAccept: boolean): Promise<void> {
  const currentCid = await getCurrentCid();
  if (!currentCid || currentCid === 0n) {
    throw new Error('No active user session');
  }
  try {
    await websocketService.sendLocalDBSet(currentCid, AUTO_ACCEPT_KEY, stringToBytes(String(autoAccept)));
    debugLog('P2PRegistrationService', `[P2P] Auto-accept setting saved: ${autoAccept}`);
  } catch (error) {
    debugLog('P2PRegistrationService', 'Failed to save auto-accept setting:', error);
    throw error;
  }
}

/**
 * Handle incoming registration - uses notification's cid (recipient) instead of getCurrentCid().
 */
export async function handleIncomingRegistrationWithCid(
  notificationCid: bigint,
  peerCid: bigint,
  peerUsername: string | undefined,
  pendingRequests: Map<string, PendingRequestEntry>
): Promise<void> {
  const autoAccept = await getAutoAcceptSetting(notificationCid);

  if (autoAccept) {
    debugLog('P2PRegistrationService', `[P2P] Auto-accepting registration from ${peerUsername || peerCid.toString()}`);
    await acceptRegistrationRequest(peerCid, peerUsername, pendingRequests);
  } else {
    debugLog('P2PRegistrationService', `[P2P] Adding registration from ${peerUsername || peerCid.toString()} to pending requests (recipient: ${notificationCid.toString()})`);
    try {
      await peerRegistrationStore.handleIncomingRequest({
        cid: notificationCid,
        peer_cid: peerCid,
        peer_username: peerUsername
      });
    } catch (error) {
      debugLog('P2PRegistrationService', 'handleIncomingRequest threw error:', error);
      throw error;
    }
  }
}

/**
 * Accept a registration request - registers back with the peer.
 */
export async function acceptRegistrationRequest(
  peerCid: bigint,
  peerUsername: string | undefined,
  pendingRequests: Map<string, PendingRequestEntry>,
  registeredPeers?: Map<bigint, Peer>
): Promise<void> {
  const currentCid = await getCurrentCid();
  if (!currentCid || currentCid === 0n) {
    throw new Error('No active user session');
  }
  if (peerCid === currentCid) {
    throw new Error('Cannot register with self');
  }

  debugLog('P2PRegistrationService', `[P2P] Accepting registration from ${peerUsername || peerCid.toString()}`);
  await registerPeer(peerCid, { connectAfterRegister: false }, pendingRequests);
  await peerRegistrationStore.removeRequestByPeerCid(peerCid);

  if (registeredPeers) {
    const peer: Peer = registeredPeers.get(peerCid) || {
      cid: peerCid,
      username: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      fullName: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      isOnline: true,
      isRegistered: true
    };
    registeredPeers.set(peerCid, peer);
  }

  eventEmitter.emit('p2p:registration-accepted', { peerCid, peerUsername });
}

/**
 * Decline a registration request - removes from pending requests.
 */
export async function declineRegistrationRequest(peerCid: bigint): Promise<void> {
  debugLog('P2PRegistrationService', `[P2P] Declining registration from ${peerCid.toString()}`);
  await peerRegistrationStore.removeRequestByPeerCid(peerCid);
  eventEmitter.emit('p2p:registration-declined', { peerCid });
}
