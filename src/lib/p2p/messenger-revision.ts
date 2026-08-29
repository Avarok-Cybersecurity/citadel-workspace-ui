/**
 * Message revision flow: editing and retracting a sent P2P message.
 *
 * Owns the local-first ordering — the revision is applied to local state and
 * persisted BEFORE the wire send, so a failed send leaves the caller's view
 * consistent and the peer reconciles on next receive. Split from
 * p2p-messenger-manager.ts in the same style as messenger-compatibility.ts:
 * free functions over the conversation manager, so the manager stays a thin
 * orchestrator.
 */

import { createMessageEdit, createMessageDelete } from '@/types/messaging-layer';
import type { MessagingLayer } from '@/types/messaging-layer';
import { applyEdit, applyDelete } from './message-revision';
import { messagePaginationStore } from './message-pagination-store';
import { resolveCurrentCid } from './messenger-cid-resolver';
import type { ConversationManager } from './conversation-manager';

type EmitFn = (event: string, data?: unknown) => void;
type SendRawFn = (recipientCid: bigint, layer: MessagingLayer) => Promise<void>;

/**
 * Revise a message we sent, locally and on the peer.
 *
 * Applied locally FIRST so the edit shows immediately and, if the send fails,
 * the throw reaches the caller with the local state already consistent — the
 * peer reconciles on their next receive rather than us silently diverging.
 */
export async function editMessage(
  conversationManager: ConversationManager,
  emit: EmitFn,
  sendRawMessage: SendRawFn,
  peerCid: bigint,
  messageId: string,
  contents: string,
): Promise<void> {
  const ownCid: bigint | null = await resolveCurrentCid();
  if (!ownCid) throw new Error('Not connected to server');

  const conversation = conversationManager.getConversation(peerCid);
  if (!conversation) throw new Error(`Conversation with ${peerCid} not found`);

  const editedAt: number = Date.now();
  const outcome = applyEdit(conversation, messageId, contents, editedAt, ownCid);
  if (!outcome.applied) {
    // 'not-sender' here means the UI offered edit on someone else's message.
    throw new Error(`Cannot edit message ${messageId}: ${outcome.reason}`);
  }

  await messagePaginationStore.updateMessageInPages(peerCid, messageId, { content: contents, edited_at: editedAt });
  emit('p2p:message-updated', outcome.message);

  await sendRawMessage(peerCid, createMessageEdit(messageId, contents, editedAt));
}

/**
 * Retract a message we sent, locally and on the peer. Removes it outright,
 * matching how group chat already treats a deletion.
 */
export async function deleteMessage(
  conversationManager: ConversationManager,
  emit: EmitFn,
  sendRawMessage: SendRawFn,
  peerCid: bigint,
  messageId: string,
): Promise<void> {
  const ownCid: bigint | null = await resolveCurrentCid();
  if (!ownCid) throw new Error('Not connected to server');

  const conversation = conversationManager.getConversation(peerCid);
  if (!conversation) throw new Error(`Conversation with ${peerCid} not found`);

  const deletedAt: number = Date.now();
  const outcome = applyDelete(conversation, messageId, ownCid);
  if (!outcome.applied) {
    throw new Error(`Cannot delete message ${messageId}: ${outcome.reason}`);
  }

  emit('p2p:message-deleted', { peerCid, messageId });

  await sendRawMessage(peerCid, createMessageDelete(messageId, deletedAt));
}
