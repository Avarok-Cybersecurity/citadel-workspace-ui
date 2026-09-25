/**
 * Which screen the file manager shows, decided in one place.
 *
 * Two defects lived in the inline chain this replaced:
 *
 * - "No Peers Connected" was the answer while the peer list was still being
 *   fetched, and also for the one render between a peer arriving and the
 *   first peer being auto-selected. A registered, online peer read as none.
 * - Everything waited on a CID read from the global connection, which a tab
 *   that resumed its session does not have for seconds. See useFileManagerContent.
 */
import { TreeScope } from '@/types/revfs-types';

export type FileManagerScreen = 'connecting' | 'finding-peers' | 'no-peers' | 'loading' | 'error' | 'browser';

export interface FileManagerScreenInputs {
  myCid: bigint | null;
  storageMode: TreeScope;
  peersLoading: boolean;
  peerCount: number;
  selectedPeerCid: bigint | null;
  treeLoading: boolean;
  hasError: boolean;
  hasTree: boolean;
}

export function fileManagerScreen(i: FileManagerScreenInputs): FileManagerScreen {
  if (!i.myCid) return 'connecting';
  if (i.storageMode === TreeScope.Peer) {
    if (i.peerCount === 0) return i.peersLoading ? 'finding-peers' : 'no-peers';
    // A peer exists; the selection effect picks it on the next render.
    if (!i.selectedPeerCid) return 'finding-peers';
  }
  if (i.treeLoading) return 'loading';
  if (i.hasError || !i.hasTree) return 'error';
  return 'browser';
}
