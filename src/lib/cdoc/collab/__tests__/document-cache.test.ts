/**
 * The IndexedDB cache keeps a replica's bytes and seq exactly, per account, and calls a
 * malformed value what it is. `storage-utils` is replaced by a Map that round-trips through
 * structuredClone, which is what IndexedDB does to a value: jsdom has no IndexedDB and
 * fake-indexeddb is not a dependency (the same stand-in a-peer-group-keeps-its-history uses).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CachedDocument, DocumentCache } from '../ports';

const store: Map<string, unknown> = vi.hoisted((): Map<string, unknown> => new Map<string, unknown>());
vi.mock('@/lib/storage-utils', () => ({
  dbGet: (_s: string, k: string): Promise<unknown> => Promise.resolve(store.has(k) ? structuredClone(store.get(k)) : undefined),
  dbPut: (_s: string, k: string, v: unknown): Promise<void> => { store.set(k, structuredClone(v)); return Promise.resolve(); },
}));

const { indexedDbDocumentCache, readCached } = await import('../document-cache');

const DOC: CachedDocument = { docVersion: 2, seq: 9_007_199_254_740_993n, snapshot: Uint8Array.from([7, 0, 255]) };

describe('the IndexedDB document cache', () => {
  it('reads back the bytes, the version and the u64 seq exactly', async () => {
    const cache: DocumentCache = indexedDbDocumentCache(11n);
    await cache.save('n1', DOC);
    const back: CachedDocument | null = await cache.load('n1');
    expect(back).toEqual(DOC);
    expect(back?.snapshot).toBeInstanceOf(Uint8Array);
  });

  it('never hands one account another account\'s copy', async () => {
    await indexedDbDocumentCache(11n).save('n2', DOC);
    expect(await indexedDbDocumentCache(12n).load('n2')).toBeNull();
  });

  it('calls a malformed value an error, not an empty cache', () => {
    expect(readCached(undefined)).toBeNull();
    expect(() => readCached({ docVersion: 2, seq: 3, snapshot: [1] })).toThrow('not in the shape');
  });
});
