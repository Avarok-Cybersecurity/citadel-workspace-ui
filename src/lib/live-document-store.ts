import * as Y from 'yjs';
import { websocketService } from './websocket-service';
import { sha256Sync } from './merkle-tree';
import type { RevisionEntry } from '@/types/p2p-types';
import { stringToBytes, bytesToString } from './utils/encoding-utils';

// Document metadata stored in LocalDB
export interface DocumentMetadata {
  id: string;
  title: string;
  peerCid: string;
  /** CID of the document creator (authority for divergence recovery) */
  creatorCid: string;
  createdAt: number;
  updatedAt: number;
  /** Current root hash of the document */
  rootHash?: string;
  /** Current revision number */
  revision?: number;
}

// Full document data including Yjs state
interface StoredDocument {
  metadata: DocumentMetadata;
  state: number[]; // Yjs encoded state as array (for JSON serialization)
  /** Revision chain for divergence recovery (last N entries) */
  revisionChain?: RevisionEntry[];
}

const DOCUMENTS_KEY_PREFIX = 'live_doc';
const DOCUMENTS_INDEX_KEY = 'live_doc_index';

/**
 * Store for managing live document persistence via LocalDB
 */
class LiveDocumentStore {
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

  /**
   * Initialize the store by loading the document index from LocalDB
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const response = await websocketService.sendLocalDBGet(0n, DOCUMENTS_INDEX_KEY);
      if (response?.value) {
        const indexData = this.decodeValue(response.value);
        const index: string[] = JSON.parse(indexData);

        // Load each document metadata into cache
        for (const docId of index) {
          const doc = await this.loadDocument(docId);
          if (doc) {
            this.documentsCache.set(docId, doc);
          }
        }
      }
      this.initialized = true;
    } catch (error) {
      console.error('[LiveDocStore] Failed to initialize:', error);
      this.initialized = true; // Continue anyway
    }
  }

  /**
   * Create a new document
   */
  async createDocument(
    title: string,
    peerCid: string,
    creatorCid: string,
    initialDoc?: Y.Doc
  ): Promise<DocumentMetadata> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const doc = initialDoc || new Y.Doc();
    const state = Y.encodeStateAsUpdate(doc);
    const rootHash = sha256Sync(state);

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

    // Save to cache
    this.documentsCache.set(id, storedDoc);

    // Save to LocalDB
    await this.saveDocument(id, storedDoc);
    await this.updateIndex();

    return metadata;
  }

  /**
   * Save a document's current state
   */
  async saveDocument(docId: string, doc: StoredDocument): Promise<void> {
    const key = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
    const valueStr = JSON.stringify(doc);
    const valueBytes = stringToBytes(valueStr);

    await websocketService.sendLocalDBSet(0n, key, valueBytes);

    // Update cache
    this.documentsCache.set(docId, doc);
  }

  /**
   * Update a document's Yjs state
   */
  async updateDocumentState(docId: string, ydoc: Y.Doc): Promise<void> {
    const existing = this.documentsCache.get(docId);
    if (!existing) {
      console.warn('[LiveDocStore] Document not found:', docId);
      return;
    }

    const state = Y.encodeStateAsUpdate(ydoc);
    const rootHash = sha256Sync(state);
    const now = Date.now();
    const newRevision = (existing.metadata.revision ?? 0) + 1;

    // Create new revision entry
    const revisionEntry: RevisionEntry = {
      revision: newRevision,
      rootHash,
      timestamp: now,
      prevHash: existing.metadata.rootHash,
    };

    // Keep last 100 revisions
    const revisionChain = [...(existing.revisionChain || []), revisionEntry].slice(-100);

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

  /**
   * Get the revision chain for a document
   */
  async getRevisionChain(docId: string): Promise<RevisionEntry[]> {
    const doc = await this.loadDocument(docId);
    return doc?.revisionChain || [];
  }

  /**
   * Get the current root hash for a document
   */
  async getRootHash(docId: string): Promise<string | null> {
    const doc = await this.loadDocument(docId);
    return doc?.metadata.rootHash || null;
  }

  /**
   * Get the creator CID for a document
   */
  async getCreatorCid(docId: string): Promise<string | null> {
    const doc = await this.loadDocument(docId);
    return doc?.metadata.creatorCid || null;
  }

  /**
   * Check if a CID is the creator of a document
   */
  async isCreator(docId: string, cid: string): Promise<boolean> {
    const creatorCid = await this.getCreatorCid(docId);
    return creatorCid === cid;
  }

  /**
   * Load a document from LocalDB
   */
  async loadDocument(docId: string): Promise<StoredDocument | null> {
    // Check cache first
    const cached = this.documentsCache.get(docId);
    if (cached) return cached;

    try {
      const key = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
      const response = await websocketService.sendLocalDBGet(0n, key);

      if (response?.value) {
        const valueStr = this.decodeValue(response.value);
        const doc: StoredDocument = JSON.parse(valueStr);
        this.documentsCache.set(docId, doc);
        return doc;
      }
    } catch (error) {
      console.error('[LiveDocStore] Failed to load document:', docId, error);
    }

    return null;
  }

  /**
   * Load a document into a Y.Doc instance
   */
  async loadIntoYDoc(docId: string, targetDoc?: Y.Doc): Promise<Y.Doc | null> {
    const stored = await this.loadDocument(docId);
    if (!stored) return null;

    const doc = targetDoc || new Y.Doc();
    const state = new Uint8Array(stored.state);
    Y.applyUpdate(doc, state);

    return doc;
  }

  /**
   * Get document metadata
   */
  async getDocumentMetadata(docId: string): Promise<DocumentMetadata | null> {
    const doc = await this.loadDocument(docId);
    return doc?.metadata || null;
  }

  /**
   * List all documents for a peer
   */
  async listDocumentsForPeer(peerCid: string): Promise<DocumentMetadata[]> {
    await this.initialize();

    const docs: DocumentMetadata[] = [];
    this.documentsCache.forEach((doc) => {
      if (doc.metadata.peerCid === peerCid) {
        docs.push(doc.metadata);
      }
    });

    // Sort by most recently updated
    docs.sort((a, b) => b.updatedAt - a.updatedAt);

    return docs;
  }

  /**
   * List all documents
   */
  async listAllDocuments(): Promise<DocumentMetadata[]> {
    await this.initialize();

    const docs: DocumentMetadata[] = [];
    this.documentsCache.forEach((doc) => {
      docs.push(doc.metadata);
    });

    // Sort by most recently updated
    docs.sort((a, b) => b.updatedAt - a.updatedAt);

    return docs;
  }

  /**
   * Delete a document
   */
  async deleteDocument(docId: string): Promise<void> {
    this.documentsCache.delete(docId);

    // Delete from LocalDB
    const key = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
    await websocketService.sendLocalDBSet(0n, key, []); // Set to empty to "delete"

    await this.updateIndex();
  }

  /**
   * Update the document index in LocalDB
   */
  private async updateIndex(): Promise<void> {
    const docIds = Array.from(this.documentsCache.keys());
    const valueStr = JSON.stringify(docIds);
    const valueBytes = stringToBytes(valueStr);

    await websocketService.sendLocalDBSet(0n, DOCUMENTS_INDEX_KEY, valueBytes);
  }

  /**
   * Decode a value from LocalDB response
   */
  private decodeValue(value: any): string {
    if (Array.isArray(value)) {
      return bytesToString(value);
    }
    if (typeof value === 'string') {
      return value;
    }
    throw new Error('Unexpected value type');
  }
}

export const liveDocumentStore = LiveDocumentStore.getInstance();
