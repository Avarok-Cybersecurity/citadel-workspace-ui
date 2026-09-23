/**
 * A session's reported path to a peer, for the peer lists. Separate from the
 * service index so it loads with the sidebar, not the landing page.
 */
import { p2pAutoConnectService } from './index';
import type { PeerConnectPath } from '@/types/ice-servers';

/** How this session's connection to `peerCid` was reported to travel; null when unknown. */
export function connectionPathFor(sessionCid: bigint | null, peerCid: bigint): PeerConnectPath | null {
  if (sessionCid === null) return null;
  return p2pAutoConnectService.getPeerConnectionInfo(sessionCid, peerCid)?.path ?? null;
}
