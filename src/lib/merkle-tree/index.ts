/**
 * Merkle Tree - Barrel Export
 *
 * Re-exports ALL public exports from the module for backward compatibility.
 * Consumers import from '@/lib/merkle-tree' (resolves to this file).
 */

// Hashing utilities
export { sha256Async, sha256Sync, hashPair } from './hashing';

// Types
export type {
  Chunk,
  SerializedChunk,
  ChunkingStrategy,
  MerkleNode,
  MerkleProof,
  ComparisonResult,
  RevisionEntry,
} from './types';

// Chunking strategies
export { BinaryChunkingStrategy, JsonChunkingStrategy } from './strategies';

// Core tree class
export { MerkleTree } from './tree';

// Divergence detector
export { MerkleDivergenceDetector } from './divergence-detector';

// Revision chain
export { RevisionChain } from './revision-chain';
