/**
 * Merkle Tree - Built-in Chunking Strategies
 *
 * Provides BinaryChunkingStrategy and JsonChunkingStrategy
 * for common data types.
 */

import type { ChunkingStrategy } from './types';

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
    const size: number = chunkSize ?? this.defaultChunkSize;
    const chunks: Uint8Array[] = [];

    for (let i: number = 0; i < data.length; i += size) {
      chunks.push(data.slice(i, Math.min(i + size, data.length)));
    }

    // Ensure at least one chunk for empty data
    if (chunks.length === 0) {
      chunks.push(new Uint8Array(0));
    }

    return chunks;
  }

  reconstruct(chunks: Uint8Array[]): Uint8Array {
    const totalLength: number = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result: Uint8Array<ArrayBuffer> = new Uint8Array(totalLength);
    let offset: number = 0;

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
    const json: string = JSON.stringify(data);
    const bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(json);
    const binaryStrategy: BinaryChunkingStrategy = new BinaryChunkingStrategy(chunkSize ?? this.defaultChunkSize);
    return binaryStrategy.chunk(bytes, chunkSize);
  }

  reconstruct(chunks: Uint8Array[]): T {
    const binaryStrategy: BinaryChunkingStrategy = new BinaryChunkingStrategy();
    const bytes: Uint8Array<ArrayBufferLike> = binaryStrategy.reconstruct(chunks);
    const json: string = new TextDecoder().decode(bytes);
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
