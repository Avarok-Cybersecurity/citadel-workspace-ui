/**
 * YJS-specific Merkle Tree Chunking Strategy
 *
 * Bridges the generic Merkle tree with YJS documents.
 * Handles YJS-specific encoding/decoding of document state.
 */

import * as Y from 'yjs';
import {
  ChunkingStrategy,
  BinaryChunkingStrategy,
  MerkleTree,
  MerkleProof,
  RevisionChain,
  sha256Sync,
} from './merkle-tree';

// ============================================
// YJS CHUNKING STRATEGY
// ============================================

/**
 * Chunking strategy for YJS documents
 *
 * Converts Y.Doc state to chunks for Merkle tree operations.
 * Uses encodeStateAsUpdate for full document serialization.
 */
export class YjsChunkingStrategy implements ChunkingStrategy<Y.Doc, Uint8Array> {
  private binaryStrategy: BinaryChunkingStrategy;

  constructor(chunkSize: number = 1024) {
    this.binaryStrategy = new BinaryChunkingStrategy(chunkSize);
  }

  /**
   * Chunk a YJS document by serializing to binary first
   */
  chunk(doc: Y.Doc, chunkSize?: number): Uint8Array[] {
    const state = Y.encodeStateAsUpdate(doc);
    return this.binaryStrategy.chunk(state, chunkSize);
  }

  /**
   * Reconstruct YJS document from chunks
   * Note: Creates a NEW document - caller must decide how to merge
   */
  reconstruct(chunks: Uint8Array[]): Y.Doc {
    const fullState = this.binaryStrategy.reconstruct(chunks);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, fullState, 'merkle-reconstruct');
    return doc;
  }

  serialize(chunk: Uint8Array): Uint8Array {
    return chunk;
  }

  deserialize(data: Uint8Array): Uint8Array {
    return data;
  }

  getTypeId(): string {
    return 'yjs-document';
  }
}

// ============================================
// YJS MERKLE TREE WRAPPER
// ============================================

/**
 * Wrapper around MerkleTree specialized for YJS documents
 *
 * Provides YJS-specific convenience methods and manages
 * the complexity of YJS state serialization.
 */
export class YjsMerkleTree {
  private tree: MerkleTree<Y.Doc, Uint8Array>;
  private strategy: YjsChunkingStrategy;
  private revisionChain: RevisionChain;
  private documentId: string;
  private creatorCid: string | null;

  private constructor(
    tree: MerkleTree<Y.Doc, Uint8Array>,
    strategy: YjsChunkingStrategy,
    documentId: string,
    creatorCid: string | null
  ) {
    this.tree = tree;
    this.strategy = strategy;
    this.revisionChain = new RevisionChain();
    this.documentId = documentId;
    this.creatorCid = creatorCid;

    // Add initial revision
    this.revisionChain.addRevision(tree.getRootHash());
  }

  /**
   * Create Merkle tree from a YJS document
   */
  static fromDocument(
    doc: Y.Doc,
    documentId: string,
    creatorCid: string | null,
    chunkSize: number = 1024
  ): YjsMerkleTree {
    const strategy = new YjsChunkingStrategy(chunkSize);
    const tree = MerkleTree.fromData(doc, strategy, chunkSize);
    return new YjsMerkleTree(tree, strategy, documentId, creatorCid);
  }

  /**
   * Update tree after document changes
   * Call this after applying YJS updates
   */
  updateFromDocument(doc: Y.Doc): void {
    this.tree = MerkleTree.fromData(doc, this.strategy);
    this.revisionChain.addRevision(this.tree.getRootHash());
  }

  /**
   * Get root hash for quick sync check
   */
  getRootHash(): string {
    return this.tree.getRootHash();
  }

  /**
   * Get current revision number
   */
  getRevision(): number {
    return this.revisionChain.getLatest()?.revision ?? 0;
  }

  /**
   * Check if this peer is the document creator
   */
  isCreator(myCid: string): boolean {
    return this.creatorCid === myCid;
  }

  /**
   * Generate proof for transmission
   */
  getProof(includeChunks: boolean = false): YjsMerkleProof {
    const baseProof = this.tree.getProof(includeChunks);
    return {
      ...baseProof,
      documentId: this.documentId,
      creatorCid: this.creatorCid,
      revision: this.getRevision(),
    };
  }

  /**
   * Get proof for specific diverged chunks
   */
  getProofForDivergedChunks(indices: number[]): YjsMerkleProof {
    const baseProof = this.tree.getProofForChunks(indices);
    return {
      ...baseProof,
      documentId: this.documentId,
      creatorCid: this.creatorCid,
      revision: this.getRevision(),
    };
  }

  /**
   * Find which chunks differ from remote
   */
  findDivergedChunks(remoteProof: MerkleProof): number[] {
    return this.tree.findDivergedChunks(remoteProof);
  }

  /**
   * Check if in sync with remote
   */
  isInSync(remoteRootHash: string): boolean {
    return this.tree.getRootHash() === remoteRootHash;
  }

  /**
   * Get revision chain for divergence recovery
   */
  getRevisionChain(): RevisionChain {
    return this.revisionChain;
  }

  /**
   * Export full state for creator authority resync
   */
  exportFullState(): Uint8Array {
    const doc = this.tree.reconstructData();
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Get document ID
   */
  getDocumentId(): string {
    return this.documentId;
  }

  /**
   * Get creator CID
   */
  getCreatorCid(): string | null {
    return this.creatorCid;
  }
}

// ============================================
// EXTENDED PROOF WITH YJS METADATA
// ============================================

/**
 * YJS-specific Merkle proof with additional metadata
 */
export interface YjsMerkleProof extends MerkleProof {
  documentId: string;
  creatorCid: string | null;
  revision: number;
}

// ============================================
// SYNC DECISION HELPER
// ============================================

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
  const localHash = localTree.getRootHash();
  const remoteHash = remoteProof.rootHash;

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
  const diverged = localTree.findDivergedChunks(remoteProof);
  const isCreator = localTree.isCreator(myCid);
  const remoteIsCreator = remoteProof.creatorCid === myCid;

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

// ============================================
// DOCUMENT HASH UTILITY
// ============================================

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
