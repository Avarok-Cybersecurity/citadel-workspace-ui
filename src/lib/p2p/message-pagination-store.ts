/**
 * Message Pagination Store
 *
 * Paginated P2P message persistence into the INTERNAL SERVICE's LocalDB, NOT
 * browser IndexedDB (via message-page-operations -> sendLocalDB* ->
 * LocalDBGetKV). "IndexedDB" would imply history survives on the browser alone;
 * it needs the local agent. Fine with no internet, empty with no agent.
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
import { MESSAGES_PER_PAGE, PAGINATED_PREFIX } from './p2p-types';
import {
  loadMetadataByKey,
  loadMetadata,
  tryLoadMetadata,
  saveMetadata,
  loadMessagePage,
  tryLoadMessagePage,
  saveMessagePage,
  deleteConversationPages,
  type DeleteScope,
} from './message-page-operations';
import { debugLog } from '@/lib/debug-config';
import { withPeerLock } from './peer-write-lock';

export class MessagePaginationStore {
  private readonly dbPrefix = 'p2p_messages';

  public async deleteOldFormat(): Promise<void> {
    try {
      const key = `${this.dbPrefix}_conversations`;
      await websocketService.sendLocalDBDelete(0n, key);
      debugLog('MessagePaginationStore', '[P2P] Deleted old monolithic format');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Key not found')) {
        debugLog('MessagePaginationStore', 'Failed to delete old format:', error);
      }
    }
  }

  public async loadAllMetadata(): Promise<ConversationMetadata[]> {
    const results: ConversationMetadata[] = [];

    try {
      const allKeys = await websocketService.sendLocalDBListKeys(0n, `${PAGINATED_PREFIX}`);

      if (!allKeys || allKeys.length === 0) {
        debugLog('MessagePaginationStore', '[P2P] No paginated conversations found (fresh install)');
        return results;
      }

      const metadataKeys = allKeys.filter((key: string) => key.endsWith('_metadata'));
      debugLog('MessagePaginationStore', `[P2P] Found ${metadataKeys.length} conversation metadata keys`);

      for (const key of metadataKeys) {
        try {
          const metadata = await loadMetadataByKey(key);
          if (metadata) {
            results.push(metadata);
          }
        } catch (e) {
          debugLog('MessagePaginationStore', `Failed to load metadata for key ${key}:`, e);
        }
      }

      debugLog('MessagePaginationStore', `[P2P] Loaded ${results.length} conversation(s) from paginated storage`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Key not found') || errorMessage.includes('No keys found')) {
        debugLog('MessagePaginationStore', '[P2P] No paginated conversations found');
      } else {
        debugLog('MessagePaginationStore', 'Failed to load metadata:', error);
      }
    }

    return results;
  }

  public async loadMetadata(peerCid: bigint): Promise<ConversationMetadata | null> {
    return loadMetadata(peerCid);
  }

  public async saveMetadata(peerCid: bigint, metadata: ConversationMetadata): Promise<void> {
    return saveMetadata(peerCid, metadata);
  }

  public async loadMessagePage(peerCid: bigint, pageNumber: number): Promise<MessagePage | null> {
    return loadMessagePage(peerCid, pageNumber);
  }

  public async saveMessagePage(peerCid: bigint, pageNumber: number, page: MessagePage): Promise<void> {
    return saveMessagePage(peerCid, pageNumber, page);
  }

  public async appendMessageToPage(
    peerCid: bigint, message: P2PMessage,
    getCurrentCid: () => Promise<bigint | null>, getPeerUsername: () => string | undefined
  ): Promise<void> {
    return withPeerLock(peerCid, () =>
      this.appendUnserialised(peerCid, message, getCurrentCid, getPeerUsername));
  }
  private async appendUnserialised(
    peerCid: bigint,
    message: P2PMessage,
    getCurrentCid: () => Promise<bigint | null>,
    getPeerUsername: () => string | undefined
  ): Promise<void> {
    let metadata = await loadMetadata(peerCid);
    const isNewConversation = !metadata;

    const ownerCid = await getCurrentCid();

    if (!metadata) {
      metadata = {
        peerCid,
        ownerCid: ownerCid ?? undefined,
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

    // Adopt an unstamped record the first time the account that is actually
    // using it writes to it. Attribution by USE is the only signal available —
    // the key carries no owner — and it is safe in the direction that matters:
    // it can only ever move a record from "nobody may delete this" to "one
    // specific account may".
    if (metadata.ownerCid === undefined && ownerCid !== null) {
      metadata.ownerCid = ownerCid;
    }

    let currentPage = await loadMessagePage(peerCid, metadata.latestPage);
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

    if (currentPage.messages.length >= MESSAGES_PER_PAGE) {
      await saveMessagePage(peerCid, metadata.latestPage, currentPage);

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
      debugLog('MessagePaginationStore', `[P2P] Created new page ${metadata.latestPage} for peer ${peerCid.toString().slice(0, 8)}...`);
    }

    currentPage.messages.push(message);
    currentPage.messages.sort((a, b) => a.timestamp - b.timestamp);
    currentPage.pageTimestamps.minTimestamp = currentPage.messages[0].timestamp;
    currentPage.pageTimestamps.maxTimestamp = currentPage.messages[currentPage.messages.length - 1].timestamp;

    metadata.totalMessageCount++;
    metadata.newestMessageTimestamp = message.timestamp;
    if (isNewConversation || message.timestamp < metadata.oldestMessageTimestamp) {
      metadata.oldestMessageTimestamp = message.timestamp;
    }
    metadata.lastMessageIndex = Math.max(metadata.lastMessageIndex, message.index);
    metadata.lastUpdated = Date.now();

    const currentCid = await getCurrentCid();
    if (message.senderCid !== currentCid && message.status === 'delivered') {
      metadata.unreadCount++;
    }

    // Page first, pointer last: two round-trips, no transaction, and
    // `latestPage` is the only pointer to the page.
    await saveMessagePage(peerCid, metadata.latestPage, currentPage);
    await saveMetadata(peerCid, metadata);
  }

  public async loadLatestMessages(peerCid: bigint): Promise<P2PMessage[]> {
    const metadata = await tryLoadMetadata(peerCid);
    if (!metadata) return [];

    const latestPage = await tryLoadMessagePage(peerCid, metadata.latestPage);
    return latestPage?.messages || [];
  }

  public async updateMessageInPages(peerCid: bigint, messageId: string, updates: Partial<P2PMessage>): Promise<boolean> {
    return withPeerLock(peerCid, () => this.updateMessageInPagesUnserialised(peerCid, messageId, updates));
  }
  private async updateMessageInPagesUnserialised(peerCid: bigint, messageId: string, updates: Partial<P2PMessage>): Promise<boolean> {
    const metadata = await tryLoadMetadata(peerCid);
    if (!metadata) return false;

    for (let pageNum = metadata.latestPage; pageNum >= 0; pageNum--) {
      const page = await tryLoadMessagePage(peerCid, pageNum);
      if (!page) continue;

      const msgIndex = page.messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
        page.messages[msgIndex] = { ...page.messages[msgIndex], ...updates };
        await saveMessagePage(peerCid, pageNum, page);
        return true;
      }
    }

    return false;
  }

  public async updatePeerUsernameInMetadata(peerCid: bigint, username: string): Promise<void> {
    return withPeerLock(peerCid, () => this.updatePeerUsernameInMetadataUnserialised(peerCid, username));
  }
  private async updatePeerUsernameInMetadataUnserialised(peerCid: bigint, username: string): Promise<void> {
    const metadata = await tryLoadMetadata(peerCid);
    if (metadata) {
      metadata.peerUsername = username;
      metadata.lastUpdated = Date.now();
      await saveMetadata(peerCid, metadata);
    }
  }

  public async updateUnreadCount(peerCid: bigint, unreadCount: number): Promise<void> {
    return withPeerLock(peerCid, () => this.updateUnreadCountUnserialised(peerCid, unreadCount));
  }
  private async updateUnreadCountUnserialised(peerCid: bigint, unreadCount: number): Promise<void> {
    const metadata = await tryLoadMetadata(peerCid);
    if (metadata) {
      metadata.unreadCount = unreadCount;
      metadata.lastUpdated = Date.now();
      await saveMetadata(peerCid, metadata);
    }
  }

  public async deleteConversationPages(peerCid: bigint, scope: DeleteScope): Promise<void> {
    return deleteConversationPages(peerCid, scope);
  }
}

// Singleton export
export const messagePaginationStore = new MessagePaginationStore();
