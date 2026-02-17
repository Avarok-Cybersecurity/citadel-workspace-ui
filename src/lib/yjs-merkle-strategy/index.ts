/**
 * YJS Merkle Strategy Module
 *
 * Re-exports all public API for YJS-specific Merkle tree operations.
 */

export { YjsChunkingStrategy } from './strategy';

export type { YjsMerkleProof } from './tree';
export { YjsMerkleTree } from './tree';

export type { SyncDecision } from './sync';
export {
  determineSyncAction,
  computeDocumentHash,
  computeStateVectorHash,
} from './sync';
