/**
 * Merkle Tree - Type Definitions
 *
 * All interfaces and type definitions for the Merkle tree module.
 */

// ============================================
// CHUNK INTERFACES
// ============================================

/**
 * Represents a single chunk of data with its hash
 */
export interface Chunk<T = Uint8Array> {
  index: number;
  data: T;
  hash: string;
}

/**
 * Serialized chunk for network transmission
 */
export interface SerializedChunk {
  index: number;
  hash: string;
  data: number[]; // Uint8Array as array for JSON
}

// ============================================
// CHUNKING STRATEGY INTERFACE
// ============================================

/**
 * Strategy interface for chunking different data types
 *
 * T = Source data type (e.g., Y.Doc, Uint8Array, object)
 * C = Chunk data type (usually Uint8Array)
 *
 * This abstraction allows the Merkle tree to work with any data type.
 */
export interface ChunkingStrategy<T, C = Uint8Array> {
  /**
   * Split source data into chunks
   * @param data Source data to chunk
   * @param chunkSize Optional size hint for chunks
   */
  chunk(data: T, chunkSize?: number): C[];

  /**
   * Reconstruct original data from chunks
   * @param chunks Ordered array of chunks
   */
  reconstruct(chunks: C[]): T;

  /**
   * Serialize a chunk for hashing/transmission
   * @param chunk Chunk to serialize
   */
  serialize(chunk: C): Uint8Array;

  /**
   * Deserialize chunk from bytes
   * @param data Serialized chunk data
   */
  deserialize(data: Uint8Array): C;

  /**
   * Get a unique identifier for this strategy type
   */
  getTypeId(): string;
}

// ============================================
// MERKLE TREE NODE
// ============================================

/**
 * Internal Merkle tree node
 */
export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  /** For leaf nodes: chunk index */
  chunkIndex?: number;
  /** Depth level in tree (0 = root) */
  level: number;
}

// ============================================
// MERKLE PROOF STRUCTURES
// ============================================

/**
 * Proof structure for verification and comparison
 * Contains enough information to verify tree integrity and find divergence
 */
export interface MerkleProof {
  rootHash: string;
  leafCount: number;
  treeHeight: number;
  /**
   * Node hashes organized by level
   * Level 0 = root, Level N = leaves
   */
  levelHashes: string[][];
  /** Optional: actual chunks for diverged data */
  chunks?: SerializedChunk[];
}

/**
 * Result of comparing two Merkle trees
 */
export interface ComparisonResult {
  status: 'in_sync' | 'diverged' | 'local_ahead' | 'local_behind';
  /** Indices of chunks that differ */
  divergedIndices: number[];
  /** Level where divergence was first detected */
  divergenceLevel?: number;
  /** Additional context for debugging */
  details?: string;
}

// ============================================
// REVISION TRACKING
// ============================================

/**
 * Tracks document revisions with hash chain
 */
export interface RevisionEntry {
  revision: number;
  rootHash: string;
  timestamp: number;
  /** Previous revision hash for chain verification */
  prevHash?: string;
}
