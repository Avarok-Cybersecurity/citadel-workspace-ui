/**
 * The peers whose shared storage the file manager can browse.
 *
 * `useRegisteredPeers` is the one peer list the app shows; it carries CIDs as
 * strings for display. The file manager keys trees by bigint, so the CID is
 * parsed once here, and a row whose CID does not parse is dropped rather than
 * turned into peer zero.
 */
import type { RegisteredPeer } from '@/hooks/use-registered-peers';

export interface StoragePeer {
  cid: bigint;
  username: string;
}

export function storagePeersFrom(peers: RegisteredPeer[]): StoragePeer[] {
  const out: StoragePeer[] = [];
  for (const peer of peers) {
    if (!/^\d+$/.test(peer.cid) || peer.cid === '0') continue;
    out.push({ cid: BigInt(peer.cid), username: peer.username });
  }
  return out;
}
