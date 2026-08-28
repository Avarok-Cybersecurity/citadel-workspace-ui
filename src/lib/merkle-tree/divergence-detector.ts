/**
 * Merkle Tree - Divergence Detector
 *
 * Stateless utility for comparing Merkle trees and computing minimal diffs.
 */

import type { MerkleProof, ComparisonResult, SerializedChunk } from './types';
import { MerkleTree } from './tree';

// ============================================
// DIVERGENCE DETECTOR (STATELESS)
// ============================================

/**
 * Stateless utility for comparing Merkle trees
 */
export class MerkleDivergenceDetector {
  /**
   * Quick check if two trees are in sync (O(1))
   */
  static quickCheck(localRoot: string, remoteRoot: string): boolean {
    return localRoot === remoteRoot;
  }

  /**
   * Full comparison between local tree and remote proof
   */
  static compare<T, C>(
    local: MerkleTree<T, C>,
    remoteProof: MerkleProof
  ): ComparisonResult {
    // Quick sync check
    if (local.getRootHash() === remoteProof.rootHash) {
      return {
        status: 'in_sync',
        divergedIndices: [],
      };
    }

    // Find diverged chunks
    const diverged: number[] = local.findDivergedChunks(remoteProof);

    if (diverged.length === 0) {
      // Hash mismatch but no specific divergence found
      // This shouldn't happen, but handle gracefully
      return {
        status: 'diverged',
        divergedIndices: [],
        details: 'Root hash mismatch but no chunk divergence found',
      };
    }

    // Determine direction of divergence if possible
    const localCount: number = local.getLeafCount();
    const remoteCount: number = remoteProof.leafCount;

    if (localCount > remoteCount) {
      return {
        status: 'local_ahead',
        divergedIndices: diverged,
        details: `Local has ${localCount} chunks, remote has ${remoteCount}`,
      };
    } else if (localCount < remoteCount) {
      return {
        status: 'local_behind',
        divergedIndices: diverged,
        details: `Local has ${localCount} chunks, remote has ${remoteCount}`,
      };
    }

    return {
      status: 'diverged',
      divergedIndices: diverged,
    };
  }

  /**
   * Compute minimal diff - only return chunks that need to be sent
   */
  static computeMinimalDiff<T, C>(
    local: MerkleTree<T, C>,
    divergedIndices: number[]
  ): SerializedChunk[] {
    const proof: MerkleProof = local.getProofForChunks(divergedIndices);
    return proof.chunks || [];
  }
}
