/**
 * The first store action after a page load must not erase the document index.
 *
 * `updateIndex` overwrites the persisted index with `documentsCache.keys()`,
 * and only the two list functions ran `initialize()`. So when the first action
 * after a load was adopt/create/delete, the cache held one entry (or zero) and
 * the index — the ONLY enumeration of documents — was rewritten to just that,
 * making every other document permanently unlistable.
 *
 * There was also a read-modify-write race: `initialize()` guarded itself with
 * a boolean set at the END of the load, so an `updateIndex` racing an
 * in-flight initialize read a half-populated cache and persisted it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredDocument } from '../types';

interface FakeDB {
  index: string[];
  docs: Map<string, StoredDocument>;
}

const db: FakeDB = { index: [], docs: new Map<string, StoredDocument>() };
let gateIndexLoad: Promise<void> | null = null;
let indexLoads: number = 0;

vi.mock('../persistence', () => ({
  loadIndexFromDB: async (): Promise<string[]> => {
    indexLoads += 1;
    if (gateIndexLoad) await gateIndexLoad;
    return [...db.index];
  },
  loadDocumentFromDB: async (id: string): Promise<StoredDocument | null> => db.docs.get(id) ?? null,
  saveDocumentToDB: async (id: string, doc: StoredDocument): Promise<void> => {
    db.docs.set(id, doc);
  },
  saveIndexToDB: async (ids: string[]): Promise<void> => {
    db.index = [...ids];
  },
  deleteDocumentFromDB: async (id: string): Promise<void> => {
    db.docs.delete(id);
  },
  decodeValue: (v: unknown): string => String(v),
}));

const { LiveDocumentStore } = await import('../service');

/** Reach past the singleton: each test needs a store with a COLD cache. */
type Store = ReturnType<typeof LiveDocumentStore.getInstance>;
const freshStore = (): Store => new (LiveDocumentStore as unknown as { new (): Store })();

const docRecord = (id: string): StoredDocument => ({
  metadata: { id, title: id, peerCid: '1', creatorCid: '2', createdAt: 1, updatedAt: 1, rootHash: 'h', revision: 0 },
  state: [],
  revisionChain: [],
});

describe('the first store action after a page load', () => {
  beforeEach((): void => {
    db.index = [];
    db.docs.clear();
    gateIndexLoad = null;
    indexLoads = 0;
  });

  it('createDocument keeps existing documents listable', async () => {
    db.index = ['doc-a'];
    db.docs.set('doc-a', docRecord('doc-a'));

    const store: Store = freshStore();
    const meta = await store.createDocument('New doc', '1', '2');

    expect(db.index, 'the pre-existing document fell out of the index').toContain('doc-a');
    expect(db.index).toContain(meta.id);
  });

  it('adoptDocument keeps existing documents listable', async () => {
    db.index = ['doc-a'];
    db.docs.set('doc-a', docRecord('doc-a'));

    const store: Store = freshStore();
    await store.adoptDocument('doc-x', 'Shared doc', '1', '2');

    expect(db.index, 'the pre-existing document fell out of the index').toContain('doc-a');
    expect(db.index).toContain('doc-x');
  });

  it('deleteDocument removes only the deleted document from the index', async () => {
    db.index = ['doc-a', 'doc-b'];
    db.docs.set('doc-a', docRecord('doc-a'));
    db.docs.set('doc-b', docRecord('doc-b'));

    const store: Store = freshStore();
    await store.deleteDocument('doc-b');

    expect(db.index, 'deleting one document unlisted the other').toEqual(['doc-a']);
  });

  it('shares one index load among concurrent initializers', async () => {
    const store: Store = freshStore();
    await Promise.all([store.initialize(), store.initialize()]);
    expect(indexLoads, 'each caller ran its own load').toBe(1);
  });

  it('does not write a half-populated cache over the index mid-initialize', async () => {
    db.index = ['doc-a'];
    db.docs.set('doc-a', docRecord('doc-a'));

    let release: () => void = () => undefined;
    gateIndexLoad = new Promise<void>((resolve) => {
      release = resolve;
    });

    const store: Store = freshStore();
    // A list kicks off initialize, which is now parked on the gate…
    const listing = store.listAllDocuments();
    // …and a create lands while it is in flight.
    const creating = store.createDocument('New doc', '1', '2');
    release();
    const [, meta] = await Promise.all([listing, creating]);

    expect(db.index, 'the in-flight initialize lost the race and doc-a was unlisted').toContain('doc-a');
    expect(db.index).toContain(meta.id);
  });
});
