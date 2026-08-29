/**
 * YJS Chunking Strategy
 *
 * Bridges the generic Merkle tree with YJS documents.
 * Handles YJS-specific encoding/decoding of document state.
 */

import * as Y from 'yjs';
import type { ChunkingStrategy } from '../merkle-tree';
import { BinaryChunkingStrategy } from '../merkle-tree';

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
    const state: Uint8Array<ArrayBufferLike> = Y.encodeStateAsUpdate(doc);
    return this.binaryStrategy.chunk(state, chunkSize);
  }

  /**
   * Reconstruct YJS document from chunks
   * Note: Creates a NEW document - caller must decide how to merge
   */
  reconstruct(chunks: Uint8Array[]): Y.Doc {
    const fullState: Uint8Array<ArrayBufferLike> = this.binaryStrategy.reconstruct(chunks);
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
