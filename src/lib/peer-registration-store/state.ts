/**
 * Peer Registration Store - State Management
 *
 * In-memory state queries and mutations for pending/outgoing requests.
 * All functions are pure or operate on the provided arrays.
 */

import { connectionManager } from '../connection';
import { instanceManager } from '../multi-instance';
import { getSelectedUser } from '../tab-context';
import { debugLog } from '@/lib/debug-config';
import type { PendingPeerRequest, OutgoingPeerRequest } from './types';

/**
 * Get current session CID.
 * Priority: 1) instanceManager.cid (sync), 2) connectionInfo (sync),
 *           3) tab context (async), 4) tab session (async)
 */
export async function getCurrentSessionCid(): Promise<bigint | null> {
  const instanceCid = instanceManager.cid;
  if (instanceCid) {
    return instanceCid;
  }

  const connectionInfo = connectionManager.getConnectionInfo();
  if (connectionInfo?.cid) {
    return connectionInfo.cid;
  }

  // The storage fallback cannot be allowed to THROW.
  //
  // Everything above this line is in memory and is what answers in a normal
  // session; these two read IndexedDB, which is unavailable under strict
  // privacy settings and in some embedded contexts. A rejection here used to
  // propagate through `emitUpdate` and take the whole announcement with it, so
  // an incoming contact request was recorded and never mentioned -- the app
  // knew somebody had asked to connect and nothing on screen said so.
  //
  // Unknown is a legitimate answer: the caller already treats a null CID as
  // "cannot scope by account" and shows what it has.
  try {
    const tabSelection = await getSelectedUser();
    const tabSession = await connectionManager.getTabSelectedSession();
    return tabSelection?.selectedCid || tabSession?.cid || null;
  } catch (error) {
    debugLog('PeerRegistrationStore', 'Could not read the selected session; treating it as unknown:', error);
    return null;
  }
}

/**
 * Get pending requests filtered by current session CID
 */
export async function getFilteredPendingRequests(
  pendingRequests: PendingPeerRequest[]
): Promise<PendingPeerRequest[]> {
  const currentCid = await getCurrentSessionCid();
  if (!currentCid) {
    return [...pendingRequests];
  }
  return pendingRequests.filter(r => r.cid === currentCid);
}

/**
 * Get count of pending requests for current session
 */
export async function getFilteredPendingCount(
  pendingRequests: PendingPeerRequest[]
): Promise<number> {
  const currentCid = await getCurrentSessionCid();
  const allCount: number = pendingRequests.length;
  if (!currentCid) {
    debugLog('PeerRegistrationStore', `[P2P] getPendingCount: no currentCid, returning allCount=${allCount}`);
    return allCount;
  }
  const filteredCount: number = pendingRequests.filter(r => r.cid === currentCid).length;
  debugLog('PeerRegistrationStore', `[P2P] getPendingCount: currentCid=${currentCid.toString()}, allCount=${allCount}, filteredCount=${filteredCount}`);
  return filteredCount;
}

/**
 * Check if a request from a specific peer already exists
 */
export function hasRequestFromPeer(
  pendingRequests: PendingPeerRequest[],
  peerCid: bigint,
  targetCid?: bigint
): boolean {
  if (targetCid !== undefined) {
    return pendingRequests.some(r => r.peer_cid === peerCid && r.cid === targetCid);
  }
  return pendingRequests.some(r => r.peer_cid === peerCid);
}

/**
 * Check if we have an outgoing request to a specific peer
 */
export function hasOutgoingRequestTo(
  outgoingRequests: OutgoingPeerRequest[],
  peerCid: bigint,
  fromCid?: bigint
): boolean {
  if (fromCid !== undefined) {
    return outgoingRequests.some(r => r.toCid === peerCid && r.fromCid === fromCid);
  }
  return outgoingRequests.some(r => r.toCid === peerCid);
}

/**
 * Get outgoing requests filtered by current session CID
 */
export async function getFilteredOutgoingRequests(
  outgoingRequests: OutgoingPeerRequest[]
): Promise<OutgoingPeerRequest[]> {
  const currentCid = await getCurrentSessionCid();
  if (!currentCid) {
    return [...outgoingRequests];
  }
  return outgoingRequests.filter(r => r.fromCid === currentCid);
}

/**
 * Get outgoing request target CIDs as a Set for quick lookup
 */
export async function getOutgoingRequestCidSet(
  outgoingRequests: OutgoingPeerRequest[]
): Promise<Set<bigint>> {
  const requests: OutgoingPeerRequest[] = await getFilteredOutgoingRequests(outgoingRequests);
  return new Set(requests.map(r => r.toCid));
}

/**
 * Remove a pending request by ID from the array, returning the new array
 */
export function removePendingById(
  pendingRequests: PendingPeerRequest[],
  requestId: string
): PendingPeerRequest[] {
  return pendingRequests.filter(r => r.id !== requestId);
}

/**
 * Remove pending requests by peer CID, returning the new array
 */
export function removePendingByPeerCid(
  pendingRequests: PendingPeerRequest[],
  peerCid: bigint
): PendingPeerRequest[] {
  return pendingRequests.filter(r => r.peer_cid !== peerCid);
}

/**
 * Remove an outgoing request by ID, returning the new array
 */
export function removeOutgoingById(
  outgoingRequests: OutgoingPeerRequest[],
  requestId: string
): OutgoingPeerRequest[] {
  return outgoingRequests.filter(r => r.id !== requestId);
}

/**
 * Remove outgoing requests by peer CID, returning the new array
 */
export function removeOutgoingByPeerCid(
  outgoingRequests: OutgoingPeerRequest[],
  peerCid: bigint,
  fromCid?: bigint
): OutgoingPeerRequest[] {
  if (fromCid !== undefined) {
    return outgoingRequests.filter(
      r => !(r.toCid === peerCid && r.fromCid === fromCid)
    );
  }
  return outgoingRequests.filter(r => r.toCid !== peerCid);
}
