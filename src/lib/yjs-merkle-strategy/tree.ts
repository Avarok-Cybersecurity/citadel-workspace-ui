/**
 * YJS Merkle Tree Wrapper
 *
 * Provides YJS-specific convenience methods and manages
 * the complexity of YJS state serialization.
 */

import * as Y from 'yjs';
import {
  MerkleTree,
  MerkleProof,
  RevisionChain,
} from '../merkle-tree';
import { YjsChunkingStrategy } from './strategy';

/**
 * YJS-specific Merkle proof with additional metadata
 */
export interface YjsMerkleProof extends MerkleProof {
  documentId: string;
  creatorCid: string | null;
  revision: number;
}

/**
 * Wrapper around MerkleTree specialized for YJS documents
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
    this.revisionChain.addRevision(tree.getRootHash());
  }

  static fromDocument(
    doc: Y.Doc,
    documentId: string,
    creatorCid: string | null,
    chunkSize: number = 1024
  ): YjsMerkleTree {
    const strategy: YjsChunkingStrategy = new YjsChunkingStrategy(chunkSize);
    const tree = MerkleTree.fromData(doc, strategy, chunkSize);
    return new YjsMerkleTree(tree, strategy, documentId, creatorCid);
  }

  updateFromDocument(doc: Y.Doc): void {
    this.tree = MerkleTree.fromData(doc, this.strategy);
    this.revisionChain.addRevision(this.tree.getRootHash());
  }

  getRootHash(): string {
    return this.tree.getRootHash();
  }

  getRevision(): number {
    return this.revisionChain.getLatest()?.revision ?? 0;
  }

  isCreator(myCid: string): boolean {
    return this.creatorCid === myCid;
  }

  getProof(includeChunks: boolean = false): YjsMerkleProof {
    const baseProof: MerkleProof = this.tree.getProof(includeChunks);
    return {
      ...baseProof,
      documentId: this.documentId,
      creatorCid: this.creatorCid,
      revision: this.getRevision(),
    };
  }

  getProofForDivergedChunks(indices: number[]): YjsMerkleProof {
    const baseProof: MerkleProof = this.tree.getProofForChunks(indices);
    return {
      ...baseProof,
      documentId: this.documentId,
      creatorCid: this.creatorCid,
      revision: this.getRevision(),
    };
  }

  findDivergedChunks(remoteProof: MerkleProof): number[] {
    return this.tree.findDivergedChunks(remoteProof);
  }

  isInSync(remoteRootHash: string): boolean {
    return this.tree.getRootHash() === remoteRootHash;
  }

  getRevisionChain(): RevisionChain {
    return this.revisionChain;
  }

  exportFullState(): Uint8Array {
    const doc: ReturnType<typeof this.tree.reconstructData> = this.tree.reconstructData();
    return Y.encodeStateAsUpdate(doc);
  }

  getDocumentId(): string {
    return this.documentId;
  }

  getCreatorCid(): string | null {
    return this.creatorCid;
  }
}
