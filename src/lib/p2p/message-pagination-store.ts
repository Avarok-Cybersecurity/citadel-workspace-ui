/**
 * Message Pagination Store
 *
 * Handles persisting P2P messages to IndexedDB using a paginated format.
 * Messages are stored in pages to support lazy loading and efficient storage.
 *
 * Format:
 *   - Metadata: msgs_with_peer_{CID}_metadata
 *   - Pages: msgs_with_peer_{CID}_{pageNumber}
 * Page 0 = oldest messages, higher pages = newer messages
 */

import { websocketService } from '../websocket-service';
import type {
  ConversationMetadata,
  MessagePage,
  P2PMessage,
} from './p2p-types';
import {
  MESSAGES_PER_PAGE,
  PAGINATED_PREFIX,
} from './p2p-types';

export class MessagePaginationStore {
  private readonly dbPrefix = 'p2p_messages';

  /**
   * Delete the old monolithic `p2p_messages_conversations` key.
   * Called once on startup to migrate to paginated format.
   */
  public async deleteOldFormat(): Promise<void> {
    try {
      const key = `${this.dbPrefix}_conversations`;
      await websocketService.sendLocalDBDelete(0n, key);
      console.log('[P2P] Deleted old monolithic format');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Key not found')) {
        console.warn('[P2P] Failed to delete old format:', error);
      }
      // Key not found is fine - means already migrated or fresh install
    }
  }

  /**
   * Load all conversation metadata from LocalDB.
   * Scans for keys matching `msgs_with_peer_*_metadata` pattern.
   * @returns Array of loaded metadata entries
   */
  public async loadAllMetadata(): Promise<ConversationMetadata[]> {
    const results: ConversationMetadata[] = [];

    try {
      // Get all keys from LocalDB that match our metadata pattern
      const allKeys = await websocketService.sendLocalDBListKeys(0n, `${PAGINATED_PREFIX}`);

      if (!allKeys || allKeys.length === 0) {
        console.log('[P2P] No paginated conversations found (fresh install)');
        return results;
      }

      // Filter for metadata keys only
      const metadataKeys = allKeys.filter((key: string) => key.endsWith('_metadata'));
      console.log(`[P2P] Found ${metadataKeys.length} conversation metadata keys`);

      // Load each metadata
      for (const key of metadataKeys) {
        try {
          const metadata = await this.loadMetadataByKey(key);
          if (metadata) {
            results.push(metadata);
          }
        } catch (e) {
          console.warn(`[P2P] Failed to load metadata for key ${key}:`, e);
        }
      }

      console.log(`[P2P] Loaded ${results.length} conversation(s) from paginated storage`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Key not found') || errorMessage.includes('No keys found')) {
        console.log('[P2P] No paginated conversations found');
      } else {
        console.error('[P2P] Failed to load metadata:', error);
      }
    }

    return results;
  }

  /**
   * Load metadata for a specific peer.
   */
  public async loadMetadata(peerCid: bigint): Promise<ConversationMetadata | null> {
    const key = `${PAGINATED_PREFIX}${peerCid.toString()}_metadata`;
    return this.loadMetadataByKey(key);
  }

  /**
   * Load metadata by full key.
   */
  private async loadMetadataByKey(key: string): Promise<ConversationMetadata | null> {
    try {
      const response = await websocketService.sendLocalDBGet(0n, key);
      if (response?.value) {
        const rawValue = response.value;
        let valueStr: string;
        if (Array.isArray(rawValue)) {
          valueStr = new TextDecoder().decode(new Uint8Array(rawValue));
        } else if (typeof rawValue === 'string') {
          valueStr = rawValue;
        } else {
          return null;
        }
        const parsed = JSON.parse(valueStr) as Record<string, unknown>;
        // Convert peerCid from string to bigint (JSON doesn't support bigint)
        return {
          ...parsed,
          peerCid: typeof parsed.peerCid === 'string' ? BigInt(parsed.peerCid) : parsed.peerCid
        } as ConversationMetadata;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save metadata for a peer.
   */
  public async saveMetadata(peerCid: bigint, metadata: ConversationMetadata): Promise<void> {
    const key = `${PAGINATED_PREFIX}${peerCid.toString()}_metadata`;
    // Convert bigint peerCid to string for JSON serialization
    const serializableMetadata = { ...metadata, peerCid: metadata.peerCid.toString() };
    const valueStr = JSON.stringify(serializableMetadata);
    const valueBytes = Array.from(new TextEncoder().encode(valueStr));
    await websocketService.sendLocalDBSet(0n, key, valueBytes);
  }

  /**
   * Load a specific page of messages for a peer.
   * @param peerCid The peer's CID
   * @param pageNumber Page number (0 = oldest, higher = newer)
   * @returns MessagePage or null if not found
   */
  public async loadMessagePage(peerCid: bigint, pageNumber: number): Promise<MessagePage | null> {
    const key = `${PAGINATED_PREFIX}${peerCid.toString()}_${pageNumber}`;
    try {
      const response = await websocketService.sendLocalDBGet(0n, key);
      if (response?.value) {
        const rawValue = response.value;
        let valueStr: string;
        if (Array.isArray(rawValue)) {
          valueStr = new TextDecoder().decode(new Uint8Array(rawValue));
        } else if (typeof rawValue === 'string') {
          valueStr = rawValue;
        } else {
          return null;
        }
        const parsed = JSON.parse(valueStr) as MessagePage & {
          peerCid: string | bigint;
          messages: Array<P2PMessage & { senderCid: string | bigint; recipientCid: string | bigint }>;
        };
        // Convert bigint fields from string (JSON doesn't support bigint)
        return {
          ...parsed,
          peerCid: typeof parsed.peerCid === 'string' ? BigInt(parsed.peerCid) : parsed.peerCid,
          messages: parsed.messages.map((m) => ({
            ...m,
            senderCid: typeof m.senderCid === 'string' ? BigInt(m.senderCid) : m.senderCid,
            recipientCid: typeof m.recipientCid === 'string' ? BigInt(m.recipientCid) : m.recipientCid
          }))
        } as MessagePage;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save a page of messages for a peer.
   */
  public async saveMessagePage(peerCid: bigint, pageNumber: number, page: MessagePage): Promise<void> {
    const key = `${PAGINATED_PREFIX}${peerCid.toString()}_${pageNumber}`;
    // Convert bigint fields to strings for JSON serialization
    const serializablePage = {
      ...page,
      peerCid: page.peerCid.toString(),
      messages: page.messages.map(m => ({
        ...m,
        senderCid: m.senderCid.toString(),
        recipientCid: m.recipientCid.toString()
      }))
    };
    const valueStr = JSON.stringify(serializablePage);
    const valueBytes = Array.from(new TextEncoder().encode(valueStr));
    await websocketService.sendLocalDBSet(0n, key, valueBytes);
  }

  /**
   * Append a message to the latest page, creating a new page if needed.
   * This is the main method for persisting new messages.
   * @param peerCid The peer's CID
   * @param message The message to append
   * @param getCurrentCid Function to get current user's CID (for unread count)
   * @param getPeerUsername Function to get cached peer username
   */
  public async appendMessageToPage(
    peerCid: bigint,
    message: P2PMessage,
    getCurrentCid: () => Promise<bigint | null>,
    getPeerUsername: () => string | undefined
  ): Promise<void> {
    // Load or create metadata
    let metadata = await this.loadMetadata(peerCid);
    const isNewConversation = !metadata;

    if (!metadata) {
      metadata = {
        peerCid,
        peerUsername: getPeerUsername(),
        totalMessageCount: 0,
        oldestMessageTimestamp: message.timestamp,
        newestMessageTimestamp: message.timestamp,
        latestPage: 0,
        messagesPerPage: MESSAGES_PER_PAGE,
        unreadCount: 0,
        lastMessageIndex: 0,
        lastUpdated: Date.now()
      };
    }

    // Load the latest page (or create empty one)
    let currentPage = await this.loadMessagePage(peerCid, metadata.latestPage);
    if (!currentPage) {
      currentPage = {
        peerCid,
        pageNumber: metadata.latestPage,
        messages: [],
        pageTimestamps: {
          minTimestamp: message.timestamp,
          maxTimestamp: message.timestamp
        }
      };
    }

    // Check if page is full - create new page if needed
    if (currentPage.messages.length >= MESSAGES_PER_PAGE) {
      // Save current full page
      await this.saveMessagePage(peerCid, metadata.latestPage, currentPage);

      // Create new page
      metadata.latestPage++;
      currentPage = {
        peerCid,
        pageNumber: metadata.latestPage,
        messages: [],
        pageTimestamps: {
          minTimestamp: message.timestamp,
          maxTimestamp: message.timestamp
        }
      };
      console.log(`[P2P] Created new page ${metadata.latestPage} for peer ${peerCid.toString().slice(0, 8)}...`);
    }

    // Add message to current page
    currentPage.messages.push(message);
    currentPage.messages.sort((a, b) => a.timestamp - b.timestamp);
    currentPage.pageTimestamps.minTimestamp = currentPage.messages[0].timestamp;
    currentPage.pageTimestamps.maxTimestamp = currentPage.messages[currentPage.messages.length - 1].timestamp;

    // Update metadata
    metadata.totalMessageCount++;
    metadata.newestMessageTimestamp = message.timestamp;
    if (isNewConversation || message.timestamp < metadata.oldestMessageTimestamp) {
      metadata.oldestMessageTimestamp = message.timestamp;
    }
    metadata.lastMessageIndex = Math.max(metadata.lastMessageIndex, message.index);
    metadata.lastUpdated = Date.now();

    // Update unread count for incoming messages
    const currentCid = await getCurrentCid();
    if (message.senderCid !== currentCid && message.status === 'delivered') {
      metadata.unreadCount++;
    }

    // Persist both page and metadata
    await Promise.all([
      this.saveMessagePage(peerCid, metadata.latestPage, currentPage),
      this.saveMetadata(peerCid, metadata)
    ]);
  }

  /**
   * Load the most recent messages for a conversation (latest page).
   * Call this when opening a chat to populate the UI.
   */
  public async loadLatestMessages(peerCid: bigint): Promise<P2PMessage[]> {
    const metadata = await this.loadMetadata(peerCid);
    if (!metadata) return [];

    const latestPage = await this.loadMessagePage(peerCid, metadata.latestPage);
    return latestPage?.messages || [];
  }

  /**
   * Update a message's status in its persisted page.
   * Searches all pages to find the message and update it.
   */
  public async updateMessageInPages(peerCid: bigint, messageId: string, updates: Partial<P2PMessage>): Promise<boolean> {
    const metadata = await this.loadMetadata(peerCid);
    if (!metadata) return false;

    // Search all pages for the message (start from latest as most status updates are for recent messages)
    for (let pageNum = metadata.latestPage; pageNum >= 0; pageNum--) {
      const page = await this.loadMessagePage(peerCid, pageNum);
      if (!page) continue;

      const msgIndex = page.messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
        // Found the message - update it
        page.messages[msgIndex] = { ...page.messages[msgIndex], ...updates };
        await this.saveMessagePage(peerCid, pageNum, page);
        return true;
      }
    }

    return false; // Message not found in any page
  }

  /**
   * Update peer username in metadata.
   */
  public async updatePeerUsernameInMetadata(peerCid: bigint, username: string): Promise<void> {
    const metadata = await this.loadMetadata(peerCid);
    if (metadata) {
      metadata.peerUsername = username;
      metadata.lastUpdated = Date.now();
      await this.saveMetadata(peerCid, metadata);
    }
  }

  /**
   * Update unread count in metadata.
   */
  public async updateUnreadCount(peerCid: bigint, unreadCount: number): Promise<void> {
    const metadata = await this.loadMetadata(peerCid);
    if (metadata) {
      metadata.unreadCount = unreadCount;
      metadata.lastUpdated = Date.now();
      await this.saveMetadata(peerCid, metadata);
    }
  }

  /**
   * Delete all pages and metadata for a conversation.
   */
  public async deleteConversationPages(peerCid: bigint): Promise<void> {
    const metadata = await this.loadMetadata(peerCid);
    if (!metadata) return;

    // Delete all message pages
    const deletePromises: Promise<void>[] = [];
    for (let pageNum = 0; pageNum <= metadata.latestPage; pageNum++) {
      const key = `${PAGINATED_PREFIX}${peerCid.toString()}_${pageNum}`;
      deletePromises.push(websocketService.sendLocalDBDelete(0n, key));
    }

    // Delete metadata
    const metadataKey = `${PAGINATED_PREFIX}${peerCid.toString()}_metadata`;
    deletePromises.push(websocketService.sendLocalDBDelete(0n, metadataKey));

    await Promise.all(deletePromises);
    console.log(`[P2P] Deleted ${metadata.latestPage + 1} pages + metadata for peer ${peerCid.toString().slice(0, 8)}...`);
  }
}

// Singleton export
export const messagePaginationStore = new MessagePaginationStore();
