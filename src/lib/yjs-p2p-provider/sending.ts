/**
 * YJS P2P Provider - Sending Methods
 *
 * Functions for sending sync messages, updates, ACKs, and awareness
 * updates via the P2P WebSocket transport.
 */

import { websocketService } from '@/lib/websocket-service';
import { debugLog } from '@/lib/debug-config';
import type {
  SyncSubType,
  YjsSyncMessage,
  YjsAckMessage,
  YjsAwarenessMessage,
  YjsP2PMessage,
  PendingAck,
} from './types';
import type { YjsMerkleTree } from '@/lib/yjs-merkle-strategy';

/** Subset of provider state needed by sending functions */
export interface SendingContext {
  readonly ownCid: string | null;
  readonly peerCid: string;
  readonly documentId: string;
  readonly creatorCid: string | null;
  revision: number;
  readonly merkleTree: YjsMerkleTree | null;
  readonly pendingAcks: Map<string, PendingAck>;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(documentId: string): string {
  return `${documentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send a P2P message via websocket service
 */
export function sendP2PMessage(ctx: SendingContext, message: YjsP2PMessage): void {
  if (!ctx.ownCid) return;

  websocketService.sendP2PMessage(
    BigInt(ctx.ownCid),
    BigInt(ctx.peerCid),
    JSON.stringify(message)
  ).catch((error: unknown) => {
    debugLog('YjsP2PProvider', 'Failed to send message:', error);
  });
}

/**
 * Send a sync message with proper structure
 */
export function sendSyncMessage(
  ctx: SendingContext,
  subType: SyncSubType,
  data: Uint8Array,
  requiresAck: boolean,
  docHash?: string
): void {
  if (!ctx.ownCid) return;

  const messageId = generateMessageId(ctx.documentId);
  const hash = docHash ?? (ctx.merkleTree?.getRootHash());

  const message: YjsSyncMessage = {
    type: 'yjs_sync',
    sub_type: subType,
    document_id: ctx.documentId,
    data: Array.from(data),
    doc_hash: hash,
    revision: ctx.revision,
    message_id: messageId,
    requires_ack: requiresAck,
    is_creator: ctx.ownCid === ctx.creatorCid,
  };

  if (requiresAck) {
    ctx.pendingAcks.set(messageId, {
      messageId,
      sentAt: Date.now(),
      expectedHash: hash,
      retryCount: 0,
    });
  }

  sendP2PMessage(ctx, message);
}

/**
 * Send a live document update
 */
export function sendUpdate(ctx: SendingContext, update: Uint8Array): void {
  ctx.revision++;
  sendSyncMessage(ctx, 'update', update, true);
}

/**
 * Send ACK for a received message
 */
export function sendAck(ctx: SendingContext, messageId: string): void {
  if (!ctx.ownCid) return;

  const message: YjsAckMessage = {
    type: 'yjs_ack',
    document_id: ctx.documentId,
    message_id: messageId,
    local_hash: ctx.merkleTree?.getRootHash() ?? '',
    revision: ctx.revision,
  };

  sendP2PMessage(ctx, message);
}

/**
 * Send awareness update
 */
export function broadcastAwareness(ctx: SendingContext, update: Uint8Array): void {
  if (!ctx.ownCid) return;

  const message: YjsAwarenessMessage = {
    type: 'yjs_awareness',
    document_id: ctx.documentId,
    awareness: Array.from(update),
  };

  sendP2PMessage(ctx, message);
}
