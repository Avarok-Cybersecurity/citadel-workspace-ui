/**
 * In-place edits to a conversation's stored pages and metadata.
 *
 * Split from message-pagination-store so that file keeps the append/rollover
 * path — where the ordering and atomicity reasoning lives — and these three
 * read-modify-write helpers live together. Every one is called under the
 * caller's per-peer lock; none takes one itself.
 */

import {
  tryLoadMetadata,
  tryLoadMessagePage,
  saveMessagePage,
  saveMetadata,
} from './message-page-operations';
import type { P2PMessage } from './p2p-types';

/**
 * Patch one message wherever it is stored.
 *
 * Returns false when the id is in no page — the normal way of reporting
 * "nothing was written", which callers must distinguish from a throw.
 */
export async function updateMessageInPages(
  peerCid: bigint,
  messageId: string,
  updates: Partial<P2PMessage>
): Promise<boolean> {
  const metadata = await tryLoadMetadata(peerCid);
  if (!metadata) return false;

  for (let pageNum = metadata.latestPage; pageNum >= 0; pageNum--) {
    const page = await tryLoadMessagePage(peerCid, pageNum);
    if (!page) continue;

    const msgIndex = page.messages.findIndex((m) => m.id === messageId);
    if (msgIndex !== -1) {
      page.messages[msgIndex] = { ...page.messages[msgIndex], ...updates };
      await saveMessagePage(peerCid, pageNum, page);
      return true;
    }
  }

  return false;
}

export async function updatePeerUsernameInMetadata(
  peerCid: bigint,
  username: string
): Promise<void> {
  const metadata = await tryLoadMetadata(peerCid);
  if (!metadata) return;
  metadata.peerUsername = username;
  metadata.lastUpdated = Date.now();
  await saveMetadata(peerCid, metadata);
}

export async function updateUnreadCount(peerCid: bigint, unreadCount: number): Promise<void> {
  const metadata = await tryLoadMetadata(peerCid);
  if (!metadata) return;
  metadata.unreadCount = unreadCount;
  metadata.lastUpdated = Date.now();
  await saveMetadata(peerCid, metadata);
}
