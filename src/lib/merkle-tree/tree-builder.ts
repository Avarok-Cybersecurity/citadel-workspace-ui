/**
 * Merkle Tree - Tree Builder
 *
 * Static tree construction from leaf hashes. Builds the binary Merkle
 * tree bottom-up, handling odd-length levels by duplicating the last node.
 */

import { sha256Sync, hashPair } from './hashing';
import type { MerkleNode } from './types';

/**
 * Build Merkle tree from leaf hashes
 */
export function buildTree(leafHashes: string[]): MerkleNode {
  if (leafHashes.length === 0) {
    // Empty tree
    return {
      hash: sha256Sync(new Uint8Array(0)),
      level: 0,
    };
  }

  // Create leaf nodes
  let currentLevel: MerkleNode[] = leafHashes.map((hash, index) => ({
    hash,
    chunkIndex: index,
    level: Math.ceil(Math.log2(leafHashes.length)) || 1,
  }));

  let level: number = currentLevel[0].level - 1;

  // Build tree bottom-up
  while (currentLevel.length > 1) {
    const nextLevel: MerkleNode[] = [];

    for (let i: number = 0; i < currentLevel.length; i += 2) {
      const left: MerkleNode = currentLevel[i];
      const right: MerkleNode = currentLevel[i + 1] || left; // Duplicate last if odd

      nextLevel.push({
        hash: hashPair(left.hash, right.hash),
        left,
        right: currentLevel[i + 1] ? right : undefined, // Only set right if it exists
        level,
      });
    }

    currentLevel = nextLevel;
    level--;
  }

  // Ensure root is at level 0
  currentLevel[0].level = 0;
  return currentLevel[0];
}
