/**
 * Live Document Store - Document Factory
 *
 * Builds the revision-zero StoredDocument. Extracted from service.ts: the
 * construction lived twice there (createDocument and adoptDocument, byte for
 * byte apart from where the id came from), and the single-flight initialize
 * fix pushed the file past the 250-line cap.
 */

import * as Y from 'yjs';
import { sha256Sync } from '@/lib/merkle-tree';

import type { StoredDocument } from './types';

/** A fresh document at revision 0, under the id the caller decided on. */
export function newStoredDocument(
  id: string,
  title: string,
  peerCid: string,
  creatorCid: string,
  initialDoc?: Y.Doc,
): StoredDocument {
  const now: number = Date.now();
  const doc: Y.Doc = initialDoc || new Y.Doc();
  const state: Uint8Array<ArrayBufferLike> = Y.encodeStateAsUpdate(doc);
  const rootHash: string = sha256Sync(state);

  return {
    metadata: { id, title, peerCid, creatorCid, createdAt: now, updatedAt: now, rootHash, revision: 0 },
    state: Array.from(state),
    revisionChain: [{ revision: 0, rootHash, timestamp: now }],
  };
}
