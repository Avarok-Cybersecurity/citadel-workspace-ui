/**
 * Message Page Operations
 *
 * Low-level page I/O operations for the paginated message store.
 * Handles reading/writing individual pages and metadata to LocalDB.
 */

import { websocketService } from '../websocket-service';
import { stringToBytes, bytesToString } from '../utils/encoding-utils';
import type {
  ConversationMetadata,
  MessagePage,
  P2PMessage,
} from './p2p-types';
import {
  PAGINATED_PREFIX,
} from './p2p-types';
import { debugLog } from '@/lib/debug-config';

/**
 * Load metadata by full key.
 */
export async function loadMetadataByKey(key: string): Promise<ConversationMetadata | null> {
  try {
    const response = await websocketService.sendLocalDBGet(0n, key);
    if (response?.value) {
      const rawValue = response.value;
      let valueStr: string;
      if (Array.isArray(rawValue)) {
        valueStr = bytesToString(rawValue);
      } else if (typeof rawValue === 'string') {
        valueStr = rawValue;
      } else {
        return null;
      }
      const parsed = JSON.parse(valueStr) as Record<string, unknown>;
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
 * Load metadata for a specific peer.
 */
export async function loadMetadata(peerCid: bigint): Promise<ConversationMetadata | null> {
  const key = `${PAGINATED_PREFIX}${peerCid.toString()}_metadata`;
  return loadMetadataByKey(key);
}

/**
 * Save metadata for a peer.
 */
export async function saveMetadata(peerCid: bigint, metadata: ConversationMetadata): Promise<void> {
  const key = `${PAGINATED_PREFIX}${peerCid.toString()}_metadata`;
  const serializableMetadata = { ...metadata, peerCid: metadata.peerCid.toString() };
  const valueStr = JSON.stringify(serializableMetadata);
  const valueBytes = stringToBytes(valueStr);
  await websocketService.sendLocalDBSet(0n, key, valueBytes);
}

/**
 * Load a specific page of messages for a peer.
 */
export async function loadMessagePage(peerCid: bigint, pageNumber: number): Promise<MessagePage | null> {
  const key = `${PAGINATED_PREFIX}${peerCid.toString()}_${pageNumber}`;
  try {
    const response = await websocketService.sendLocalDBGet(0n, key);
    if (response?.value) {
      const rawValue = response.value;
      let valueStr: string;
      if (Array.isArray(rawValue)) {
        valueStr = bytesToString(rawValue);
      } else if (typeof rawValue === 'string') {
        valueStr = rawValue;
      } else {
        return null;
      }
      const parsed = JSON.parse(valueStr) as MessagePage & {
        peerCid: string | bigint;
        messages: Array<P2PMessage & { senderCid: string | bigint; recipientCid: string | bigint }>;
      };
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
export async function saveMessagePage(peerCid: bigint, pageNumber: number, page: MessagePage): Promise<void> {
  const key = `${PAGINATED_PREFIX}${peerCid.toString()}_${pageNumber}`;
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
  const valueBytes = stringToBytes(valueStr);
  await websocketService.sendLocalDBSet(0n, key, valueBytes);
}

/**
 * Delete all pages and metadata for a conversation.
 */
export async function deleteConversationPages(peerCid: bigint): Promise<void> {
  const metadata = await loadMetadata(peerCid);
  if (!metadata) return;

  const deletePromises: Promise<void>[] = [];
  for (let pageNum = 0; pageNum <= metadata.latestPage; pageNum++) {
    const key = `${PAGINATED_PREFIX}${peerCid.toString()}_${pageNum}`;
    deletePromises.push(websocketService.sendLocalDBDelete(0n, key));
  }

  const metadataKey = `${PAGINATED_PREFIX}${peerCid.toString()}_metadata`;
  deletePromises.push(websocketService.sendLocalDBDelete(0n, metadataKey));

  await Promise.all(deletePromises);
  debugLog('MessagePageOperations', `[P2P] Deleted ${metadata.latestPage + 1} pages + metadata for peer ${peerCid.toString().slice(0, 8)}...`);
}
