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
  findMessageInPages,
  findUnreadFromPeer,
  updateMessageInPages,
  updatePeerUsernameInMetadata,
  updateUnreadCount,
} from './message-metadata-mutations';
import {
  loadMetadataByKey,
  loadMetadata,
  tryLoadMetadata,
  saveMetadata,
  loadMessagePage,
  tryLoadMessagePage,
  saveMessagePage,
} from './message-page-operations';
import { deleteConversationPages, type DeleteScope } from './message-page-delete';
import { debugLog } from '@/lib/debug-config';
import { withPeerLock } from './peer-write-lock';
import { placeInPage, recordAppend } from './message-page-append';
import { isGenuinelyAbsent } from '@/lib/storage/absence';

export class MessagePaginationStore {
  private readonly dbPrefix = 'p2p_messages';

  public async deleteOldFormat(): Promise<void> {
    try {
      const key: string = `${this.dbPrefix}_conversations`;
      await websocketService.sendLocalDBDelete(0n, key);
      debugLog('MessagePaginationStore', '[P2P] Deleted old monolithic format');
    } catch (error) {
      if (!isGenuinelyAbsent(error)) {
        debugLog('MessagePaginationStore', 'Failed to delete old format:', error);
      }
    }
  }

  public async loadAllMetadata(): Promise<ConversationMetadata[]> {
    const results: ConversationMetadata[] = [];

    try {
      const allKeys: string[] = await websocketService.sendLocalDBListKeys(0n, `${PAGINATED_PREFIX}`);

      if (!allKeys || allKeys.length === 0) {
        debugLog('MessagePaginationStore', '[P2P] No paginated conversations found (fresh install)');
        return results;
      }

      const metadataKeys: string[] = allKeys.filter((key: string) => key.endsWith('_metadata'));
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
      if (isGenuinelyAbsent(error)) {
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

    // The last gate before a duplicate becomes permanent. ILM can redeliver an
    // inbound message after a reload (its delivered-set is memory-only), and the
    // upstream in-memory dedup cannot see it — that window is capped at 100 and
    // comes back EMPTY after a reload. A blind push wrote two copies into one
    // page, and the render-side merge dedups ACROSS batches but not within one,
    // so the pair rendered twice for ever.
    if (currentPage.messages.some((m) => m.id === message.id)) {
      debugLog('MessagePaginationStore', `[P2P] Skipping duplicate message ${message.id}`);
      return;
    }

    placeInPage(currentPage, message);
    recordAppend(metadata, message, isNewConversation, await getCurrentCid());

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

  public async findUnreadFromPeer(peerCid: bigint): Promise<P2PMessage[]> {
    return findUnreadFromPeer(peerCid);
  }

  public async findMessageInPages(peerCid: bigint, messageId: string): Promise<P2PMessage | null> {
    return findMessageInPages(peerCid, messageId);
  }

  public async updateMessageInPages(peerCid: bigint, messageId: string, updates: Partial<P2PMessage>): Promise<boolean> {
    return withPeerLock(peerCid, () => updateMessageInPages(peerCid, messageId, updates));
  }

  public async updatePeerUsernameInMetadata(peerCid: bigint, username: string): Promise<void> {
    return withPeerLock(peerCid, () => updatePeerUsernameInMetadata(peerCid, username));
  }

  public async updateUnreadCount(peerCid: bigint, unreadCount: number): Promise<void> {
    return withPeerLock(peerCid, () => updateUnreadCount(peerCid, unreadCount));
  }
  public async deleteConversationPages(peerCid: bigint, scope: DeleteScope): Promise<void> {
    return deleteConversationPages(peerCid, scope);
  }
}

// Singleton export
export const messagePaginationStore: MessagePaginationStore = new MessagePaginationStore();
