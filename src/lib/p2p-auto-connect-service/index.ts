/**
 * P2P Auto-Connect Service Module
 *
 * Re-exports all public API from the split module files.
 * Consuming files can import from '@/lib/p2p-auto-connect-service' unchanged.
 */

// Types (originally exported from the monolith)
export type { PeerConnectionInfo } from './types';

// Main Service class + singleton (originally exported from the monolith)
export { P2PAutoConnectService } from './service';

import { P2PAutoConnectService } from './service';
export const p2pAutoConnectService: P2PAutoConnectService = P2PAutoConnectService.getInstance();

import type { PeerConnectPath } from '@/types/ice-servers';
/** How this session's connection to `peerCid` was reported to travel; null when unknown. */
export function connectionPathFor(sessionCid: bigint | null, peerCid: bigint): PeerConnectPath | null {
  if (sessionCid === null) return null;
  return p2pAutoConnectService.getPeerConnectionInfo(sessionCid, peerCid)?.path ?? null;
}
