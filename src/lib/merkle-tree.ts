/**
 * Generic Merkle Tree Implementation
 *
 * A data-agnostic Merkle tree for divergence detection and efficient sync.
 * Supports O(log n) divergence detection and targeted chunk resync.
 *
 * Design Principles:
 * - SBIO: Pure business logic, no I/O operations
 * - Generic: Works with any data type via ChunkingStrategy
 * - Efficient: Only transfer diverged chunks, not full documents
 *
 * Usage:
 * ```typescript
 * const strategy = new BinaryChunkingStrategy();
 * const tree = MerkleTree.fromData(myData, strategy);
 * const diverged = tree.findDivergedChunks(remoteProof);
 * ```
 */

// ============================================
// HASHING UTILITIES
// ============================================

/**
 * Synchronous SHA-256 hash using Web Crypto API
 * Note: Uses sync pattern with crypto.subtle for consistency
 */
export async function sha256Async(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous SHA-256 using a simple hash algorithm
 * Fallback for contexts where async is not suitable
 * Uses djb2 + fnv1a combination for reasonable collision resistance
 */
export function sha256Sync(data: Uint8Array): string {
  // Use a combination of two hash algorithms for better distribution
  let h1 = 5381; // djb2
  let h2 = 2166136261; // fnv1a

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    // djb2
    h1 = ((h1 << 5) + h1) ^ byte;
    // fnv1a
    h2 ^= byte;
    h2 = Math.imul(h2, 16777619);
  }

  // Combine both hashes and add length for extra entropy
  const combined = [
    (h1 >>> 0).toString(16).padStart(8, '0'),
    (h2 >>> 0).toString(16).padStart(8, '0'),
    data.length.toString(16).padStart(8, '0'),
    ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0'),
  ].join('');

  return combined;
}

/**
 * Hash two strings together (for internal node hashing)
 */
export function hashPair(left: string, right: string): string {
  const combined = new TextEncoder().encode(left + right);
  return sha256Sync(combined);
}

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
// BUILT-IN CHUNKING STRATEGIES
// ============================================

/**
 * Binary chunking strategy for raw Uint8Array data
 */
export class BinaryChunkingStrategy implements ChunkingStrategy<Uint8Array> {
  private defaultChunkSize: number;

  constructor(defaultChunkSize: number = 1024) {
    this.defaultChunkSize = defaultChunkSize;
  }

  chunk(data: Uint8Array, chunkSize?: number): Uint8Array[] {
    const size = chunkSize ?? this.defaultChunkSize;
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < data.length; i += size) {
      chunks.push(data.slice(i, Math.min(i + size, data.length)));
    }

    // Ensure at least one chunk for empty data
    if (chunks.length === 0) {
      chunks.push(new Uint8Array(0));
    }

    return chunks;
  }

  reconstruct(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  serialize(chunk: Uint8Array): Uint8Array {
    return chunk;
  }

  deserialize(data: Uint8Array): Uint8Array {
    return data;
  }

  getTypeId(): string {
    return 'binary';
  }
}

/**
 * JSON chunking strategy for serializable objects
 * Useful for structured data like settings, configs, etc.
 */
export class JsonChunkingStrategy<T> implements ChunkingStrategy<T, Uint8Array> {
  private defaultChunkSize: number;

  constructor(defaultChunkSize: number = 1024) {
    this.defaultChunkSize = defaultChunkSize;
  }

  chunk(data: T, chunkSize?: number): Uint8Array[] {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    const binaryStrategy = new BinaryChunkingStrategy(chunkSize ?? this.defaultChunkSize);
    return binaryStrategy.chunk(bytes, chunkSize);
  }

  reconstruct(chunks: Uint8Array[]): T {
    const binaryStrategy = new BinaryChunkingStrategy();
    const bytes = binaryStrategy.reconstruct(chunks);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  }

  serialize(chunk: Uint8Array): Uint8Array {
    return chunk;
  }

  deserialize(data: Uint8Array): Uint8Array {
    return data;
  }

  getTypeId(): string {
    return 'json';
  }
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
// MERKLE TREE CLASS
// ============================================

/**
 * Generic Merkle tree for any data type
 *
 * @typeparam T - Source data type
 * @typeparam C - Chunk data type (usually Uint8Array)
 */
export class MerkleTree<T, C = Uint8Array> {
  private root: MerkleNode;
  private chunks: Chunk<C>[];
  private strategy: ChunkingStrategy<T, C>;
  private metadata: {
    createdAt: number;
    sourceDataHash: string;
    strategyType: string;
  };

  private constructor(
    root: MerkleNode,
    chunks: Chunk<C>[],
    strategy: ChunkingStrategy<T, C>,
    sourceDataHash: string
  ) {
    this.root = root;
    this.chunks = chunks;
    this.strategy = strategy;
    this.metadata = {
      createdAt: Date.now(),
      sourceDataHash,
      strategyType: strategy.getTypeId(),
    };
  }

  /**
   * Create a Merkle tree from source data
   */
  static fromData<T, C>(
    data: T,
    strategy: ChunkingStrategy<T, C>,
    chunkSize?: number
  ): MerkleTree<T, C> {
    // Chunk the data
    const rawChunks = strategy.chunk(data, chunkSize);

    // Create chunk objects with hashes
    const chunks: Chunk<C>[] = rawChunks.map((c, index) => ({
      index,
      data: c,
      hash: sha256Sync(strategy.serialize(c)),
    }));

    // Build tree from chunks
    const root = MerkleTree.buildTree(chunks.map(c => c.hash));

    // Calculate source data hash for tracking
    const sourceDataHash = sha256Sync(
      new Uint8Array(chunks.flatMap(c => Array.from(strategy.serialize(c.data))))
    );

    return new MerkleTree(root, chunks, strategy, sourceDataHash);
  }

  /**
   * Build Merkle tree from leaf hashes
   */
  private static buildTree(leafHashes: string[]): MerkleNode {
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

    let level = currentLevel[0].level - 1;

    // Build tree bottom-up
    while (currentLevel.length > 1) {
      const nextLevel: MerkleNode[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate last if odd

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

  /**
   * Get the root hash for quick comparison
   */
  getRootHash(): string {
    return this.root.hash;
  }

  /**
   * Get number of leaf nodes (chunks)
   */
  getLeafCount(): number {
    return this.chunks.length;
  }

  /**
   * Get tree height
   */
  getTreeHeight(): number {
    return Math.ceil(Math.log2(this.chunks.length)) || 1;
  }

  /**
   * Get a specific chunk by index
   */
  getChunk(index: number): Chunk<C> | undefined {
    return this.chunks[index];
  }

  /**
   * Get all chunks
   */
  getAllChunks(): Chunk<C>[] {
    return [...this.chunks];
  }

  /**
   * Generate a proof structure for transmission
   */
  getProof(includeChunks: boolean = false): MerkleProof {
    const levelHashes: string[][] = [];
    const height = this.getTreeHeight();

    // Collect hashes at each level
    const collectLevel = (node: MerkleNode, targetLevel: number, collected: string[]) => {
      if (node.level === targetLevel) {
        collected.push(node.hash);
        return;
      }
      if (node.left) collectLevel(node.left, targetLevel, collected);
      if (node.right) collectLevel(node.right, targetLevel, collected);
    };

    for (let l = 0; l <= height; l++) {
      const hashes: string[] = [];
      collectLevel(this.root, l, hashes);
      levelHashes.push(hashes);
    }

    const proof: MerkleProof = {
      rootHash: this.root.hash,
      leafCount: this.chunks.length,
      treeHeight: height,
      levelHashes,
    };

    if (includeChunks) {
      proof.chunks = this.chunks.map(c => ({
        index: c.index,
        hash: c.hash,
        data: Array.from(this.strategy.serialize(c.data)),
      }));
    }

    return proof;
  }

  /**
   * Get proof for specific chunk indices only
   */
  getProofForChunks(indices: number[]): MerkleProof {
    const proof = this.getProof(false);

    proof.chunks = indices
      .filter(i => i >= 0 && i < this.chunks.length)
      .map(i => ({
        index: this.chunks[i].index,
        hash: this.chunks[i].hash,
        data: Array.from(this.strategy.serialize(this.chunks[i].data)),
      }));

    return proof;
  }

  /**
   * Find diverged chunks by comparing with remote proof
   */
  findDivergedChunks(remoteProof: MerkleProof): number[] {
    // Quick check - if root hashes match, we're in sync
    if (this.root.hash === remoteProof.rootHash) {
      return [];
    }

    // Different leaf counts - need full resync
    if (this.chunks.length !== remoteProof.leafCount) {
      return this.chunks.map((_, i) => i);
    }

    // Traverse tree to find diverged chunks
    const diverged: number[] = [];
    const localLeafHashes = this.chunks.map(c => c.hash);
    const remoteLeafHashes = remoteProof.levelHashes[remoteProof.treeHeight] || [];

    for (let i = 0; i < localLeafHashes.length; i++) {
      if (localLeafHashes[i] !== remoteLeafHashes[i]) {
        diverged.push(i);
      }
    }

    return diverged;
  }

  /**
   * Reconstruct original data from chunks
   */
  reconstructData(): T {
    return this.strategy.reconstruct(this.chunks.map(c => c.data));
  }

  /**
   * Get metadata about this tree
   */
  getMetadata() {
    return { ...this.metadata };
  }

  /**
   * Apply chunks from remote proof to update local tree
   * Returns a new tree with merged chunks
   */
  applyRemoteChunks(remoteChunks: SerializedChunk[]): MerkleTree<T, C> {
    const newChunks = [...this.chunks];

    for (const remote of remoteChunks) {
      if (remote.index >= 0 && remote.index < newChunks.length) {
        const data = this.strategy.deserialize(new Uint8Array(remote.data));
        newChunks[remote.index] = {
          index: remote.index,
          data,
          hash: remote.hash,
        };
      }
    }

    // Rebuild tree with new chunks
    const root = MerkleTree.buildTree(newChunks.map(c => c.hash));
    const sourceDataHash = sha256Sync(
      new Uint8Array(newChunks.flatMap(c => Array.from(this.strategy.serialize(c.data))))
    );

    return new MerkleTree(root, newChunks, this.strategy, sourceDataHash);
  }
}

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
    const diverged = local.findDivergedChunks(remoteProof);

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
    const localCount = local.getLeafCount();
    const remoteCount = remoteProof.leafCount;

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
    const proof = local.getProofForChunks(divergedIndices);
    return proof.chunks || [];
  }
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

/**
 * Hash chain for revision history
 * Provides blockchain-like integrity verification
 */
export class RevisionChain {
  private entries: RevisionEntry[] = [];
  private maxLength: number;

  constructor(maxLength: number = 100) {
    this.maxLength = maxLength;
  }

  /**
   * Add a new revision to the chain
   */
  addRevision(rootHash: string): RevisionEntry {
    const prevHash = this.entries.length > 0
      ? this.entries[this.entries.length - 1].rootHash
      : undefined;

    const entry: RevisionEntry = {
      revision: this.entries.length,
      rootHash,
      timestamp: Date.now(),
      prevHash,
    };

    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.maxLength) {
      this.entries = this.entries.slice(-this.maxLength);
    }

    return entry;
  }

  /**
   * Get latest revision
   */
  getLatest(): RevisionEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Get revision by number
   */
  getRevision(revision: number): RevisionEntry | undefined {
    return this.entries.find(e => e.revision === revision);
  }

  /**
   * Find common ancestor revision with remote chain
   */
  findCommonAncestor(remoteEntries: RevisionEntry[]): RevisionEntry | undefined {
    const remoteHashes = new Set(remoteEntries.map(e => e.rootHash));

    // Search from most recent
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (remoteHashes.has(this.entries[i].rootHash)) {
        return this.entries[i];
      }
    }

    return undefined;
  }

  /**
   * Get all entries since a revision
   */
  getEntriesSince(revision: number): RevisionEntry[] {
    return this.entries.filter(e => e.revision > revision);
  }

  /**
   * Export chain for transmission
   */
  export(): RevisionEntry[] {
    return [...this.entries];
  }

  /**
   * Import chain (replaces current)
   */
  import(entries: RevisionEntry[]): void {
    this.entries = [...entries].slice(-this.maxLength);
  }

  /**
   * Verify chain integrity
   */
  verifyIntegrity(): boolean {
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i].prevHash !== this.entries[i - 1].rootHash) {
        return false;
      }
    }
    return true;
  }
}
