/**
 * `adoptDocument` must not replace a stored document because it could not read
 * it.
 *
 * The call-site half of `a-failed-read-is-not-an-empty-document`, driven through
 * the REAL loader.
 *
 * The first version of this file mocked `../persistence`, which is the module
 * holding the defect — so it could not fail on the unfixed code, and the control
 * proved it: with origin/master's loader restored, the loader test went red and
 * these stayed green. A test that replaces the broken function with a correct
 * fake measures the fake. So the fake is one layer lower, at
 * `websocketService`, and everything above it is production code.
 *
 * Assertions are on what is left ON DISK, not on what the call returned: a
 * rejection that had already overwritten the key would still be a loss.
 *
 * The sequence being prevented: Bob reopens a document he edited yesterday, the
 * first store action after a page load. The LocalDB get times out. `loadDocument`
 * answers null, adopt reads that as "not stored yet", and a fresh empty
 * `StoredDocument` replaces his content and his whole revision chain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredDocument } from '../types';

/** A LocalDB standing in for the agent, keyed exactly as persistence keys it. */
const store: Map<string, string> = new Map<string, string>();
/** Set to make the next document read fail the way a timeout does. */
let readFails: Error | null = null;

const dbGet: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const dbSet: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const dbDelete: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendLocalDBGet: dbGet,
    sendLocalDBSet: dbSet,
    sendLocalDBDelete: dbDelete,
  },
}));

const { LiveDocumentStore } = await import('../service');
const { DOCUMENTS_KEY_PREFIX, DOCUMENTS_INDEX_KEY } = await import('../types');

/**
 * A store with its own empty cache, as the sibling index test builds one.
 *
 * The constructor is private and `getInstance` memoises, so a shared instance
 * would carry `documentsCache` between cases -- and adopt's first line is a
 * cache check, which would then answer before any read happened and make every
 * assertion here vacuous.
 */
type Store = ReturnType<typeof LiveDocumentStore.getInstance>;
const freshStore = (): Store => new (LiveDocumentStore as unknown as { new (): Store })();


/** A document with content and history, i.e. something there is to lose. */
function existing(id: string): StoredDocument {
  return {
    metadata: {
      id,
      title: 'Yesterday',
      peerCid: '1',
      creatorCid: '2',
      createdAt: 1,
      updatedAt: 2,
      rootHash: 'h',
      revision: 7,
    },
    state: [1, 2, 3, 4],
    revisionChain: [{ revision: 7, hash: 'h', timestamp: 2 }],
  } as unknown as StoredDocument;
}

/** What persistence writes: the JSON text, as the byte array the agent carries. */
const toBytes = (text: string): number[] => Array.from(new TextEncoder().encode(text));

function readBack(id: string): StoredDocument | undefined {
  const raw: string | undefined = store.get(`${DOCUMENTS_KEY_PREFIX}_${id}`);
  return raw === undefined ? undefined : (JSON.parse(raw) as StoredDocument);
}

describe('adopting a document whose stored copy could not be read', () => {
  beforeEach(() => {
    store.clear();
    store.set(DOCUMENTS_INDEX_KEY, JSON.stringify(['doc-1']));
    store.set(`${DOCUMENTS_KEY_PREFIX}_doc-1`, JSON.stringify(existing('doc-1')));
    readFails = null;

    dbGet.mockReset();
    dbSet.mockReset();
    dbDelete.mockReset();

    dbGet.mockImplementation(async (_cid: bigint, key: string) => {
      if (readFails && key.startsWith(DOCUMENTS_KEY_PREFIX) && key !== DOCUMENTS_INDEX_KEY) {
        throw readFails;
      }
      const raw: string | undefined = store.get(key);
      // How the agent reports a key that is not there.
      if (raw === undefined) throw new Error('Key not found');
      return { value: toBytes(raw) };
    });
    dbSet.mockImplementation(async (_cid: bigint, key: string, value: number[]) => {
      store.set(key, new TextDecoder().decode(new Uint8Array(value)));
    });
    dbDelete.mockImplementation(async (_cid: bigint, key: string) => {
      store.delete(key);
    });
  });

  it('leaves the stored document alone when the read failed', async () => {
    readFails = new Error('LocalDB request timed out after 5000ms');
    const liveStore: Store = freshStore();

    await expect(liveStore.adoptDocument('doc-1', 'Yesterday', '1', '2')).rejects.toThrow(
      /timed out/,
    );

    const after: StoredDocument | undefined = readBack('doc-1');
    expect(after?.state).toEqual([1, 2, 3, 4]);
    expect(after?.metadata.revision).toBe(7);
    expect(after?.revisionChain).toHaveLength(1);
  });

  it('still adopts a document that genuinely is not stored yet', async () => {
    // The control. A store that refused every adopt would pass the test above
    // and break the path adopt exists for -- receiving a document from a peer.
    const liveStore: Store = freshStore();

    await liveStore.adoptDocument('doc-2', 'From Alice', '1', '2');

    expect(readBack('doc-2')).toBeDefined();
    expect(store.get(DOCUMENTS_INDEX_KEY)).toContain('doc-2');
  });

  it('is still a no-op when the document is already stored and readable', async () => {
    const liveStore: Store = freshStore();

    await liveStore.adoptDocument('doc-1', 'Renamed', '1', '2');

    expect(readBack('doc-1')?.metadata.title).toBe('Yesterday');
    expect(readBack('doc-1')?.metadata.revision).toBe(7);
  });
});
