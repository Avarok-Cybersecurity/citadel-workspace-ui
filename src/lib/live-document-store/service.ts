/**
 * Live Document Store - Service
 *
 * Singleton for managing live document persistence via LocalDB.
 * Maintains an in-memory cache and delegates I/O to persistence helpers.
 */

import * as Y from 'yjs';
import { sha256Sync } from '@/lib/merkle-tree';
import { debugLog } from '@/lib/debug-config';
import type { RevisionEntry } from '@/types/p2p-types';

import type { DocumentMetadata, StoredDocument } from './types';
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
  private initialized = false;

  private constructor() {}

  static getInstance(): LiveDocumentStore {
    if (!LiveDocumentStore.instance) {
      LiveDocumentStore.instance = new LiveDocumentStore();
    }
    return LiveDocumentStore.instance;
  }

  /** Initialize the store by loading the document index from LocalDB */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const index: string[] = await loadIndexFromDB();
      for (const docId of index) {
        const doc: StoredDocument | null = await loadDocumentFromDB(docId);
        if (doc) {
          this.documentsCache.set(docId, doc);
        }
      }
      this.initialized = true;
    } catch (error) {
      debugLog('LiveDocumentStore', 'Failed to initialize:', error);
      this.initialized = true; // Continue anyway
    }
  }

  /** Create a new document */
  async createDocument(
    title: string,
    peerCid: string,
    creatorCid: string,
    initialDoc?: Y.Doc,
  ): Promise<DocumentMetadata> {
    const id = crypto.randomUUID();
    const now: number = Date.now();

    const doc = initialDoc || new Y.Doc();
    const state = Y.encodeStateAsUpdate(doc);
    const rootHash: string = sha256Sync(state);

    const metadata: DocumentMetadata = {
      id,
      title,
      peerCid,
      creatorCid,
      createdAt: now,
      updatedAt: now,
      rootHash,
      revision: 0,
    };

    const initialRevision: RevisionEntry = {
      revision: 0,
      rootHash,
      timestamp: now,
    };

    const storedDoc: StoredDocument = {
      metadata,
      state: Array.from(state),
      revisionChain: [initialRevision],
    };

    this.documentsCache.set(id, storedDoc);
    await this.saveDocument(id, storedDoc);
    await this.updateIndex();

    return metadata;
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

    const now: number = Date.now();
    const doc = new Y.Doc();
    const state = Y.encodeStateAsUpdate(doc);
    const rootHash: string = sha256Sync(state);

    const storedDoc: StoredDocument = {
      metadata: { id: docId, title, peerCid, creatorCid, createdAt: now, updatedAt: now, rootHash, revision: 0 },
      state: Array.from(state),
      revisionChain: [{ revision: 0, rootHash, timestamp: now }],
    };

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

    const state = Y.encodeStateAsUpdate(ydoc);
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

    const doc = targetDoc || new Y.Doc();
    const state: Uint8Array<ArrayBuffer> = new Uint8Array(stored.state);
    Y.applyUpdate(doc, state);

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
    this.documentsCache.delete(docId);
    await deleteDocumentFromDB(docId);
    await this.updateIndex();
  }

  /** Update the document index in LocalDB */
  private async updateIndex(): Promise<void> {
    const docIds: string[] = Array.from(this.documentsCache.keys());
    await saveIndexToDB(docIds);
  }
}
