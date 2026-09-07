/**
 * Live Document Store - Service
 *
 * Singleton for managing live document persistence via LocalDB.
 * Maintains an in-memory cache and delegates I/O to persistence helpers.
 */

import * as Y from 'yjs';

import { PERSISTED_LOAD_ORIGIN } from '@/lib/yjs-p2p-provider/types';
import { sha256Sync } from '@/lib/merkle-tree';
import { debugLog } from '@/lib/debug-config';
import type { RevisionEntry } from '@/types/p2p-types';

import type { DocumentMetadata, StoredDocument } from './types';
import { newStoredDocument } from './document-factory';
import {
  loadDocumentFromDB,
  saveDocumentToDB,
  loadIndexFromDB,
  saveIndexToDB,
  deleteDocumentFromDB,
} from './persistence';

export class LiveDocumentStore {
  private static instance: LiveDocumentStore;
  private documentsCache: Map<string, StoredDocument> = new Map();
  /** Single-flight guard: null until the first initialize() call. */
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): LiveDocumentStore {
    if (!LiveDocumentStore.instance) {
      LiveDocumentStore.instance = new LiveDocumentStore();
    }
    return LiveDocumentStore.instance;
  }

  /**
   * Initialize the store by loading the document index from LocalDB.
   *
   * Single-flight: every caller shares one load. A boolean flag set at the
   * END of the load let concurrent callers each start a load, and gave
   * `updateIndex` no way to wait for one in flight — it read the cache
   * mid-population and wrote the partial result over the persisted index.
   */
  initialize(): Promise<void> {
    this.initPromise ??= this.loadIndexIntoCache();
    return this.initPromise;
  }

  /**
   * Whether `documentsCache` is a faithful picture of what is stored.
   *
   * `updateIndex` writes `Array.from(cache.keys())` -- the WHOLE index. That
   * is only sound if the index was read. If the read failed, the cache is
   * empty for a reason unrelated to what is stored, and writing it makes every
   * other document permanently unlistable.
   *
   * The comment on `updateIndex`'s `await this.initialize()` says it is there
   * so the index is never overwritten "with the one or zero entries in the
   * cold cache". That covers the NOT-YET-initialised case. It did nothing for
   * the FAILED-to-initialise case, because a failed load resolved like a
   * successful one and `initPromise` memoised it, so the failure was permanent
   * and invisible.
   */
  private indexIsTrustworthy: boolean = false;

  private async loadIndexIntoCache(): Promise<void> {
    try {
      const index: string[] = await loadIndexFromDB();
      for (const docId of index) {
        const doc: StoredDocument | null = await loadDocumentFromDB(docId);
        if (doc) {
          this.documentsCache.set(docId, doc);
        }
      }
      this.indexIsTrustworthy = true;
    } catch (error) {
      debugLog('LiveDocumentStore', 'Failed to initialize:', error);
      // Reading stays best-effort: an unreadable index must not brick the
      // store, so listing and opening still work on whatever is cached.
      // WRITING the index does not -- see `indexIsTrustworthy`.
      //
      // Clearing initPromise makes the next initialize() try again. It was
      // memoised, so one transient failure disabled the index for the life of
      // the page.
      this.initPromise = null;
    }
  }

  /** Create a new document */
  async createDocument(
    title: string,
    peerCid: string,
    creatorCid: string,
    initialDoc?: Y.Doc,
  ): Promise<DocumentMetadata> {
    const storedDoc: StoredDocument = newStoredDocument(
      crypto.randomUUID(), title, peerCid, creatorCid, initialDoc,
    );
    const id: string = storedDoc.metadata.id;

    this.documentsCache.set(id, storedDoc);
    await this.saveDocument(id, storedDoc);
    await this.updateIndex();

    return storedDoc.metadata;
  }

  /** Save a document's current state */
  async saveDocument(docId: string, doc: StoredDocument): Promise<void> {
    await saveDocumentToDB(docId, doc);
    this.documentsCache.set(docId, doc);
  }

  /**
   * Adopt a document this side did not create, so its edits can be persisted.
   *
   * `createDocument` mints a NEW id, which is exactly wrong for a document
   * arriving from a peer: both sides must agree on the id or they are editing
   * two different documents. This keeps the id it was given.
   *
   * Idempotent — a second call is a no-op — so an open path can call it freely
   * without needing to know whether this side is the creator.
   */
  async adoptDocument(docId: string, title: string, peerCid: string, creatorCid: string): Promise<void> {
    if (this.documentsCache.has(docId)) return;
    if (await this.loadDocument(docId)) return;

    const storedDoc: StoredDocument = newStoredDocument(docId, title, peerCid, creatorCid);

    this.documentsCache.set(docId, storedDoc);
    await this.saveDocument(docId, storedDoc);
    await this.updateIndex();
  }

  /** Update a document's Yjs state */
  async updateDocumentState(docId: string, ydoc: Y.Doc): Promise<void> {
    const existing: StoredDocument | undefined = this.documentsCache.get(docId);
    if (!existing) {
      // Resolving here wrote NOTHING while reporting success, and only the
      // CREATOR of a document ever had a cache entry — the recipient's open
      // path builds a tab and no store record. So every peer who received a
      // shared live document lost everything they typed the moment they closed
      // the tab, with no error anywhere. The unmount flush, added specifically
      // "so closing the tab does not drop the last edits", was the same no-op.
      debugLog('LiveDocumentStore', `Cannot persist ${docId}: no local record. Call adoptDocument first.`);
      throw new Error(`Live document ${docId} is not tracked locally, so its edits cannot be saved.`);
    }

    const state: Uint8Array<ArrayBufferLike> = Y.encodeStateAsUpdate(ydoc);
    const rootHash: string = sha256Sync(state);
    const now: number = Date.now();
    const newRevision: number = (existing.metadata.revision ?? 0) + 1;

    const revisionEntry: RevisionEntry = {
      revision: newRevision,
      rootHash,
      timestamp: now,
      prevHash: existing.metadata.rootHash,
    };

    // Keep last 100 revisions
    const revisionChain: RevisionEntry[] = [...(existing.revisionChain || []), revisionEntry].slice(-100);

    const updatedDoc: StoredDocument = {
      metadata: {
        ...existing.metadata,
        updatedAt: now,
        rootHash,
        revision: newRevision,
      },
      state: Array.from(state),
      revisionChain,
    };

    await this.saveDocument(docId, updatedDoc);
  }

  /** Get the revision chain for a document */
  async loadDocument(docId: string): Promise<StoredDocument | null> {
    const cached: StoredDocument | undefined = this.documentsCache.get(docId);
    if (cached) return cached;

    const doc: StoredDocument | null = await loadDocumentFromDB(docId);
    if (doc) {
      this.documentsCache.set(docId, doc);
    }
    return doc;
  }

  /** Load a document into a Y.Doc instance */
  async loadIntoYDoc(docId: string, targetDoc?: Y.Doc): Promise<Y.Doc | null> {
    const stored: StoredDocument | null = await this.loadDocument(docId);
    if (!stored) return null;

    const doc: Y.Doc = targetDoc || new Y.Doc();
    const state: Uint8Array<ArrayBuffer> = new Uint8Array(stored.state);
    // Tagged: `targetDoc` is usually the editor's doc, which has the P2P
    // provider attached, and an untagged apply reaches that provider as a LOCAL
    // edit — so restoring from storage broadcast the whole document on every
    // mount. See `isLocalEdit` for why nothing is lost by not sending it.
    Y.applyUpdate(doc, state, PERSISTED_LOAD_ORIGIN);

    return doc;
  }

  /** Get document metadata */
  async getDocumentMetadata(docId: string): Promise<DocumentMetadata | null> {
    const doc: StoredDocument | null = await this.loadDocument(docId);
    return doc?.metadata || null;
  }

  /** List all documents for a peer */
  async listDocumentsForPeer(peerCid: string): Promise<DocumentMetadata[]> {
    await this.initialize();

    const docs: DocumentMetadata[] = [];
    this.documentsCache.forEach((doc) => {
      if (doc.metadata.peerCid === peerCid) {
        docs.push(doc.metadata);
      }
    });

    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    return docs;
  }

  /** List all documents */
  async listAllDocuments(): Promise<DocumentMetadata[]> {
    await this.initialize();

    const docs: DocumentMetadata[] = [];
    this.documentsCache.forEach((doc) => {
      docs.push(doc.metadata);
    });

    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    return docs;
  }

  /** Delete a document */
  async deleteDocument(docId: string): Promise<void> {
    // Initialize BEFORE mutating: with a cold cache, the delete was a no-op on
    // an empty map and updateIndex's own initialize could re-load this very
    // document while the on-disk record still existed.
    await this.initialize();
    this.documentsCache.delete(docId);
    await deleteDocumentFromDB(docId);
    await this.updateIndex();
  }

  /**
   * Update the document index in LocalDB.
   *
   * The index is the ONLY enumeration of documents, and it is overwritten
   * whole from the cache. Writing it before `initialize()` has absorbed the
   * persisted index — which happened whenever adopt/create/delete was the
   * first store action after a page load, since only the list functions
   * initialize — replaced it with the one or zero entries in the cold cache,
   * making every other document permanently unlistable. Awaiting the
   * (single-flight) initialize also closes the read-modify-write race
   * against a load already in flight.
   */
  private async updateIndex(): Promise<void> {
    await this.initialize();
    if (!this.indexIsTrustworthy) {
      throw new Error(
        'Refusing to write the document index: it was never successfully read, ' +
          'so writing the cache over it would make every document that is not ' +
          'currently cached unlistable.',
      );
    }
    const docIds: string[] = Array.from(this.documentsCache.keys());
    await saveIndexToDB(docIds);
  }
}
