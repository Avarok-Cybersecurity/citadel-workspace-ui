/**
 * The document hash the Yjs provider puts on the wire.
 *
 * This file used to also export `determineSyncAction` — a complete,
 * plausible-looking chunk-level sync strategy (targeted sync, creator
 * authority, full resync) — and `computeStateVectorHash`. Neither had a single
 * caller anywhere, tests included. The provider does its own hash comparison
 * and creator-authority recovery, so the strategy described a mechanism that
 * was never wired: a reader could take it for how sync decisions are made and
 * be entirely wrong. Removed for the same reason the dead sync kernel and the
 * one-ended hash_check protocol were.
 */

import * as Y from 'yjs';
import { sha256Sync } from '../merkle-tree';
import type { YjsMerkleProof, YjsMerkleTree } from './tree';


/**
 * Compute hash of a YJS document's current state
 * Useful for quick comparison without full Merkle tree
 */
export function computeDocumentHash(doc: Y.Doc): string {
  const state: Uint8Array<ArrayBufferLike> = Y.encodeStateAsUpdate(doc);
  return sha256Sync(state);
}
