/**
 * YJS Sync Decision Helper
 *
 * Determines sync actions based on Merkle comparison, plus
 * document hash utility functions.
 */

import * as Y from 'yjs';
import { sha256Sync } from '../merkle-tree';
import type { YjsMerkleProof } from './tree';
import type { YjsMerkleTree } from './tree';

/**
 * Decision result for sync operations
 */
export interface SyncDecision {
  action: 'none' | 'send_update' | 'request_update' | 'send_chunks' | 'request_chunks' | 'full_resync';
  divergedChunks: number[];
  isCreatorAuthority: boolean;
  reason: string;
}

/**
 * Helper to determine sync action based on Merkle comparison
 */
export function determineSyncAction(
  localTree: YjsMerkleTree,
  remoteProof: YjsMerkleProof,
  myCid: string
): SyncDecision {
  const localHash: string = localTree.getRootHash();
  const remoteHash: string = remoteProof.rootHash;

  // In sync - nothing to do
  if (localHash === remoteHash) {
    return {
      action: 'none',
      divergedChunks: [],
      isCreatorAuthority: false,
      reason: 'Already in sync',
    };
  }

  // Find diverged chunks
  const diverged: number[] = localTree.findDivergedChunks(remoteProof);
  const isCreator: boolean = localTree.isCreator(myCid);

  // Few chunks diverged - targeted sync
  if (diverged.length > 0 && diverged.length <= localTree.getProof().leafCount / 2) {
    if (isCreator) {
      return {
        action: 'send_chunks',
        divergedChunks: diverged,
        isCreatorAuthority: true,
        reason: `Creator sending ${diverged.length} diverged chunks`,
      };
    } else {
      return {
        action: 'request_chunks',
        divergedChunks: diverged,
        isCreatorAuthority: false,
        reason: `Collaborator requesting ${diverged.length} chunks from creator`,
      };
    }
  }

  // Major divergence - full resync with creator authority
  if (isCreator) {
    return {
      action: 'full_resync',
      divergedChunks: [],
      isCreatorAuthority: true,
      reason: 'Creator authority: full state broadcast',
    };
  } else {
    return {
      action: 'full_resync',
      divergedChunks: [],
      isCreatorAuthority: false,
      reason: 'Collaborator: requesting full state from creator',
    };
  }
}

/**
 * Compute hash of a YJS document's current state
 * Useful for quick comparison without full Merkle tree
 */
export function computeDocumentHash(doc: Y.Doc): string {
  const state = Y.encodeStateAsUpdate(doc);
  return sha256Sync(state);
}

/**
 * Compute state vector hash (for sync step comparison)
 */
export function computeStateVectorHash(doc: Y.Doc): string {
  const sv = Y.encodeStateVector(doc);
  return sha256Sync(sv);
}
