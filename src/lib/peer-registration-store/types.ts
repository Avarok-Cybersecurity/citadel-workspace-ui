/**
 * Peer Registration Store - Types
 *
 * All interfaces, type aliases, and helper functions for the peer registration store.
 */

import type { InternalServiceRequest } from 'citadel-workspace-client-ts';

/**
 * Incoming peer registration request - received from another peer
 */
export interface PendingPeerRequest {
  id: string;              // UUID for this request
  peer_cid: bigint;        // CID of the requesting peer
  peer_username: string;   // Username of the requesting peer
  timestamp: number;       // When request was received
  cid: bigint;             // Recipient's CID (our CID)
}

/**
 * Outgoing peer registration request - tracks requests we've sent
 * that are awaiting response (peer may be offline for hours/days)
 */
export interface OutgoingPeerRequest {
  id: string;              // UUID for this request (matches request_id sent to server)
  fromCid: bigint;         // Our CID (the requester)
  toCid: bigint;           // Target peer's CID
  peerUsername: string;    // Target peer's username (for display)
  timestamp: number;       // When request was originally sent
  timeLastSent: number;    // When request was last (re)sent - for poll loop
}

/**
 * Entry in the pending KV request map for correlating LocalDB responses
 */
export interface KVPendingEntry {
  resolve: (value?: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Notification data for incoming peer registration
 */
export interface PeerRegisterNotification {
  cid: bigint;
  peer_cid: bigint;
  peer_username?: string;
}

/**
 * Adapts a locally-constructed request object to the WASM-generated InternalServiceRequest type.
 * The cast is needed because locally-built object literals are structurally compatible at runtime
 * but TypeScript cannot verify structural compatibility with WASM-generated nominal types.
 */
export function toInternalServiceRequest(request: Record<string, unknown>): InternalServiceRequest {
  return request as unknown as InternalServiceRequest;
}
