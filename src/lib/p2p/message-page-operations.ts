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
/**
 * A read that came back empty because the key genuinely is not there.
 *
 * The distinction is load-bearing, not pedantry. `sendLocalDBGet` rejects for
 * BOTH "no such key" and "the request timed out after 5s" / "the socket is
 * down", and the append path treats a null return as "this conversation is
 * new" — it then fabricates metadata with `latestPage: 0` and writes a page
 * containing the single message that triggered it. That overwrites page 0 and
 * orphans pages 1..N, because nothing else records their existence. One
 * transient timeout silently destroys a conversation.
 *
 * The same string test is already used twice in message-pagination-store; it
 * was never applied to the two functions where getting it wrong loses data.
 */
function isGenuinelyAbsent(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Key not found') || message.includes('No keys found');
}

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
        // Parsed back to bigint, like peerCid. Serialized as a string and left
        // as one, every ownership comparison is string-vs-bigint and therefore
        // always false — which silently turns the delete guard into "refuse
        // everything", including the account's own sweep.
        ownerCid: typeof parsed.ownerCid === 'string' ? BigInt(parsed.ownerCid) : parsed.ownerCid,
        peerCid: typeof parsed.peerCid === 'string' ? BigInt(parsed.peerCid) : parsed.peerCid
      } as ConversationMetadata;
    }
    return null;
  } catch (error) {
    if (isGenuinelyAbsent(error)) return null;
    // Anything else is a failure to READ, not an absence of data. Returning
    // null here is what let a 5s timeout be mistaken for a new conversation.
    throw error;
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
  const serializableMetadata = {
    ...metadata,
    peerCid: metadata.peerCid.toString(),
    // Stamped so this record can later be proved ours — see ConversationMetadata.
    ownerCid: metadata.ownerCid === undefined ? undefined : metadata.ownerCid.toString(),
  };
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
  } catch (error) {
    if (isGenuinelyAbsent(error)) return null;
    // Anything else is a failure to READ, not an absence of data. Returning
    // null here is what let a 5s timeout be mistaken for a new conversation.
    throw error;
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
export interface DeleteScope {
  /** The account performing the delete. */
  ownerCid: bigint | null;
  /**
   * Whether records with no recorded owner may be deleted.
   *
   * False for the automatic sweep, true for an explicit "clear this
   * conversation" — the user has that conversation open and is acting on it
   * deliberately, so refusing would make their own button silently do nothing.
   * A sweep has no such mandate.
   */
  includeUnattributed: boolean;
}

export async function deleteConversationPages(peerCid: bigint, scope: DeleteScope): Promise<void> {
  const metadata = await loadMetadata(peerCid);
  if (!metadata) return;

  // Delete only what we can PROVE belongs to the account doing the deleting.
  //
  // Pages live in LocalDB bucket `0n`, shared by every account on the device,
  // and are keyed by peer alone. cleanupStaleConversations deletes any cached
  // conversation missing from the CURRENT account's peer list — which is true
  // of every conversation belonging to a DIFFERENT account. A second user
  // logging in permanently destroyed the first user's message history, on a
  // device this product explicitly expects to hold several accounts.
  if (metadata.ownerCid === undefined) {
    if (!scope.includeUnattributed) {
      debugLog('MessagePageOperations', `[P2P] Keeping unattributed conversation ${peerCid.toString().slice(0, 8)}: owner unknown`);
      return;
    }
  } else if (scope.ownerCid === null || metadata.ownerCid !== scope.ownerCid) {
    debugLog('MessagePageOperations', `[P2P] Refusing to delete conversation ${peerCid.toString().slice(0, 8)}: it belongs to another account`);
    return;
  }

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

/**
 * `loadMetadata`, but a failed read is reported as absence.
 *
 * For callers where "could not read" and "not there" lead to the same
 * harmless outcome — skip the update, render nothing yet. The append path
 * must NOT use this: there, treating a failed read as a new conversation is
 * what overwrites page 0 and orphans the rest.
 */
export async function tryLoadMetadata(peerCid: bigint): Promise<ConversationMetadata | null> {
  try {
    return await loadMetadata(peerCid);
  } catch {
    return null;
  }
}

/** `loadMessagePage`, with the same tolerance as tryLoadMetadata. */
export async function tryLoadMessagePage(peerCid: bigint, pageNumber: number): Promise<MessagePage | null> {
  try {
    return await loadMessagePage(peerCid, pageNumber);
  } catch {
    return null;
  }
}
