/**
 * The local cache of a document replica, in the app's one IndexedDB (storage-utils). The value
 * is stored by Structured Clone, so the snapshot stays a Uint8Array and the seq a bigint: no
 * JSON, no revivers.
 *
 * Keyed by account AND node. Several accounts can be signed in to one browser, and one
 * account's copy of a document must never open in another's tab: that one may not be
 * allowed to read it. A value that is there but malformed is an error, never "no cache".
 */
import { dbGet, dbPut } from '@/lib/storage-utils';
import type { CachedDocument, DocumentCache } from './ports';

const keyOf = (account: bigint, nodeId: string): string => `cdoc-collab:${account.toString()}:${nodeId}`;

/** A stored value read back; throws when it is not a CachedDocument. */
export function readCached(value: unknown): CachedDocument | null {
  if (value === undefined) return null;
  const v: Partial<Record<keyof CachedDocument, unknown>> = typeof value === 'object' && value !== null ? value : {};
  if (typeof v.docVersion !== 'number' || typeof v.seq !== 'bigint' || !ArrayBuffer.isView(v.snapshot)) {
    throw new Error('the cached document is not in the shape this client writes');
  }
  return { docVersion: v.docVersion, seq: v.seq, snapshot: new Uint8Array(v.snapshot.buffer, v.snapshot.byteOffset, v.snapshot.byteLength).slice() };
}

export function indexedDbDocumentCache(account: bigint): DocumentCache {
  return {
    load: async (nodeId: string): Promise<CachedDocument | null> => readCached(await dbGet<unknown>('keyValue', keyOf(account, nodeId))),
    save: (nodeId: string, document: CachedDocument): Promise<void> =>
      dbPut('keyValue', keyOf(account, nodeId), { docVersion: document.docVersion, seq: document.seq, snapshot: document.snapshot.slice() }),
  };
}
