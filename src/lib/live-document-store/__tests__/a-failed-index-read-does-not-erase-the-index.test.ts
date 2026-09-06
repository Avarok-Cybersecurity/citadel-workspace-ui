/**
 * An index that could not be READ must not be overwritten.
 *
 * `updateIndex` writes `Array.from(documentsCache.keys())` -- the whole index.
 * Its `await this.initialize()` exists, by its own comment, so the index is
 * never overwritten "with the one or zero entries in the cold cache". That
 * covers the not-yet-initialised case.
 *
 * It did nothing for the FAILED-to-initialise case. `loadIndexIntoCache`
 * caught everything and resolved, `loadIndexFromDB` drew no distinction
 * between "no index yet" and "the read timed out", and `initPromise` memoised
 * the result -- so a single transient failure left the cache empty, marked
 * initialisation complete, and never retried. The next createDocument then
 * wrote an index of exactly one id over the real one, and every other document
 * became permanently unlistable.
 *
 * This is the same mechanism fixed in `peer-registration-store/persistence.ts`
 * and `connection/persist-one-session.ts`: a whole-collection write performed
 * from a collection that was never successfully read.
 *
 * The fake is at the SOCKET, not at `../persistence`. The sibling test
 * `first-action-does-not-erase-the-index` mocks `../persistence` wholesale,
 * which is the module holding this defect -- so it cannot fail on unfixed
 * code, however carefully it is written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LiveDocumentStore } from '../service';

const stored: Map<string, number[]> = new Map<string, number[]>();
let getBehaviour: 'absent' | 'timeout' | 'stored' = 'absent';

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendLocalDBGet: async (_cid: bigint, key: string): Promise<{ value: number[] } | null> => {
      if (getBehaviour === 'timeout') throw new Error('LocalDB request timed out after 5000ms');
      const value: number[] | undefined = stored.get(key);
      if (value === undefined) throw new Error(`Key not found: ${key}`);
      return { value };
    },
    sendLocalDBSet: async (_cid: bigint, key: string, value: number[]): Promise<void> => {
      stored.set(key, value);
    },
    sendLocalDBDelete: async (_cid: bigint, key: string): Promise<void> => {
      stored.delete(key);
    },
  },
}));


// Imported, not spelled out. The first version of this file hardcoded a
// plausible-looking 'live_documents_index'; the real key is 'live_doc_index',
// so the seeded index was a key nothing reads and the assertion checked a key
// nothing writes. The first test PASSED while measuring nothing -- only the
// two beside it, which assert on content rather than absence, exposed it.
import { DOCUMENTS_INDEX_KEY as INDEX_KEY, DOCUMENTS_KEY_PREFIX } from '../types';

/** Put a listed document on disk, index entry and body together. */
function seedDocument(id: string): void {
  const doc = {
    metadata: { id, title: id, peerCid: '1', creatorCid: '1', createdAt: 0, updatedAt: 0 },
    state: [],
  };
  stored.set(
    `${DOCUMENTS_KEY_PREFIX}_${id}`,
    Array.from(new TextEncoder().encode(JSON.stringify(doc))),
  );
}

function indexOnDisk(): string[] | null {
  const raw: number[] | undefined = stored.get(INDEX_KEY);
  if (!raw) return null;
  return JSON.parse(new TextDecoder().decode(new Uint8Array(raw))) as string[];
}

/**
 * A store with no initialisation history.
 *
 * The class is a singleton with a private constructor, so a fresh one comes
 * from resetting the module registry rather than from `new`. `initPromise` and
 * the cache are per-instance, and every test here turns on what a FIRST
 * initialise does -- a shared instance would carry the previous test's cache
 * and its memoised init straight into the next.
 */
async function freshStore(): Promise<LiveDocumentStore> {
  vi.resetModules();
  const { LiveDocumentStore: Cls } = await import('../service');
  return Cls.getInstance();
}

describe('the document index', () => {
  beforeEach(() => {
    stored.clear();
    getBehaviour = 'absent';
  });

  it('is not overwritten when the read failed', async () => {
    // Three documents already listed. Only the index read matters here: it is
    // the one enumeration of what exists.
    stored.set(INDEX_KEY, Array.from(new TextEncoder().encode(JSON.stringify(['a', 'b', 'c']))));

    getBehaviour = 'timeout';
    const store: LiveDocumentStore = await freshStore();

    await expect(
      store.createDocument('notes', '1', '1'),
    ).rejects.toThrow(/never successfully read/);

    expect(
      indexOnDisk(),
      'the three existing ids must still be listed',
    ).toEqual(['a', 'b', 'c']);
  });

  it('IS written for a first-run user whose index genuinely does not exist', async () => {
    // The discrimination. A guard that also blocked this would be safe and
    // useless: nobody could ever create their first document.
    getBehaviour = 'absent';
    const store: LiveDocumentStore = await freshStore();

    const meta = await store.createDocument('notes', '1', '1');

    expect(indexOnDisk()).toEqual([meta.id]);
  });

  it('retries the read rather than memoising the failure', async () => {
    // initPromise memoised a failed load, so one transient timeout disabled
    // the index for the life of the page.
    stored.set(INDEX_KEY, Array.from(new TextEncoder().encode(JSON.stringify(['a']))));
    // Body as well as index entry. `updateIndex` rebuilds the index from the
    // CACHE, and loadIndexIntoCache only caches documents whose body loaded --
    // so seeding the id alone would test that unrelated behaviour instead of
    // the retry this test is about.
    seedDocument('a');

    getBehaviour = 'timeout';
    const store: LiveDocumentStore = await freshStore();
    await expect(store.createDocument('first', '1', '1')).rejects.toThrow(/never successfully read/);

    getBehaviour = 'stored';
    const meta = await store.createDocument('second', '1', '1');

    expect(
      indexOnDisk(),
      'the recovered read must have restored the existing id alongside the new one',
    ).toEqual(expect.arrayContaining(['a', meta.id]));
  });
});
