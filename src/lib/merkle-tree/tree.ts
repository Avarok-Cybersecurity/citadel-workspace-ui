/**
 * Merkle Tree - Core Tree Class
 *
 * Generic Merkle tree for any data type. Provides O(log n) divergence
 * detection and efficient chunk-based sync.
 */

import { sha256Sync } from './hashing';
import type {
  Chunk,
  SerializedChunk,
  ChunkingStrategy,
  MerkleNode,
  MerkleProof,
} from './types';
import { buildTree } from './tree-builder';

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
    strategyType: string;
  };

  /**
   * No `sourceDataHash`.
   *
   * It used to be computed here and in `applyRemoteChunks`, as
   *
   *     sha256Sync(new Uint8Array(chunks.flatMap(c => Array.from(serialize(c.data)))))
   *
   * — the whole document flattened into a boxed `number[]`, copied
   * element-by-element into a `Uint8Array`, then hashed a SECOND time (the
   * per-chunk hashes above are the first). For a 200 KB Yjs state that is ~196
   * intermediate arrays plus a 200,000-element array, and `sha256Sync` is a
   * per-byte JS loop.
   *
   * It ran on every `updateFromDocument`, which the coalescer flushes every
   * 300 ms of sustained typing, and on every remote sync message. Nothing read
   * it: the field was returned only by `getMetadata()`, and `getMetadata()` has
   * no callers anywhere in `src/`. The root hash and the per-chunk hashes are
   * what the sync protocol actually compares.
   */
  private constructor(
    root: MerkleNode,
    chunks: Chunk<C>[],
    strategy: ChunkingStrategy<T, C>,
  ) {
    this.root = root;
    this.chunks = chunks;
    this.strategy = strategy;
    this.metadata = {
      createdAt: Date.now(),
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
    const rawChunks: ReturnType<typeof strategy.chunk> = strategy.chunk(data, chunkSize);

    const chunks: Chunk<C>[] = rawChunks.map((c, index) => ({
      index,
      data: c,
      hash: sha256Sync(strategy.serialize(c)),
    }));

    const root: MerkleNode = buildTree(chunks.map(c => c.hash));

    return new MerkleTree(root, chunks, strategy);
  }

  getRootHash(): string {
    return this.root.hash;
  }

  getLeafCount(): number {
    return this.chunks.length;
  }

  getTreeHeight(): number {
    return Math.ceil(Math.log2(this.chunks.length)) || 1;
  }

  getChunk(index: number): Chunk<C> | undefined {
    return this.chunks[index];
  }

  getAllChunks(): Chunk<C>[] {
    return [...this.chunks];
  }

  /**
   * Generate a proof structure for transmission
   */
  getProof(includeChunks: boolean = false): MerkleProof {
    const levelHashes: string[][] = [];
    const height: number = this.getTreeHeight();

    const collectLevel = (node: MerkleNode, targetLevel: number, collected: string[]): void => {
      if (node.level === targetLevel) {
        collected.push(node.hash);
        return;
      }
      if (node.left) collectLevel(node.left, targetLevel, collected);
      if (node.right) collectLevel(node.right, targetLevel, collected);
    };

    for (let l: number = 0; l <= height; l++) {
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
    const proof: MerkleProof = this.getProof(false);

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
    if (this.root.hash === remoteProof.rootHash) {
      return [];
    }

    if (this.chunks.length !== remoteProof.leafCount) {
      return this.chunks.map((_, i) => i);
    }

    const diverged: number[] = [];
    const localLeafHashes: string[] = this.chunks.map(c => c.hash);
    const remoteLeafHashes: string[] = remoteProof.levelHashes[remoteProof.treeHeight] || [];

    for (let i: number = 0; i < localLeafHashes.length; i++) {
      if (localLeafHashes[i] !== remoteLeafHashes[i]) {
        diverged.push(i);
      }
    }

    return diverged;
  }

  reconstructData(): T {
    return this.strategy.reconstruct(this.chunks.map(c => c.data));
  }

  getMetadata(): { createdAt: number; strategyType: string; } {
    return { ...this.metadata };
  }

  /**
   * Apply chunks from remote proof to update local tree
   * Returns a new tree with merged chunks
   */
  applyRemoteChunks(remoteChunks: SerializedChunk[]): MerkleTree<T, C> {
    const newChunks: Chunk<C>[] = [...this.chunks];

    for (const remote of remoteChunks) {
      if (remote.index >= 0 && remote.index < newChunks.length) {
        const data: ReturnType<typeof this.strategy.deserialize> = this.strategy.deserialize(new Uint8Array(remote.data));
        newChunks[remote.index] = {
          index: remote.index,
          data,
          hash: remote.hash,
        };
      }
    }

    const root: MerkleNode = buildTree(newChunks.map(c => c.hash));
    return new MerkleTree(root, newChunks, this.strategy);
  }
}
