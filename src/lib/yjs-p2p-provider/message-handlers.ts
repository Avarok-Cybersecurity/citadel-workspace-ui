/**
 * YJS P2P Provider - Non-Sync Message Handlers
 *
 * Handles ACK and awareness messages.
 */

import { applyAwarenessUpdate , type Awareness } from 'y-protocols/awareness';
import { debugLog } from '@/lib/debug-config';
import type {
  YjsAwarenessMessage,
  YjsAckMessage,
} from './types';
import type { SendingContext } from './sending';

/** Subset of provider state needed by message handlers */
export interface MessageHandlerContext extends SendingContext {
  readonly awareness: Awareness;
  handleHashMismatch: (remoteHash: string) => void;
}

/**
 * Handle awareness message
 */
export function handleAwarenessMessage(
  ctx: MessageHandlerContext,
  message: YjsAwarenessMessage
): void {
  const update: Uint8Array<ArrayBuffer> = new Uint8Array(message.awareness);
  applyAwarenessUpdate(ctx.awareness, update, 'remote');
}

/**
 * Handle ACK message
 */
export function handleAckMessage(
  ctx: MessageHandlerContext,
  message: YjsAckMessage
): void {
  const pending: ReturnType<typeof ctx.pendingAcks.get> = ctx.pendingAcks.get(message.message_id);
  if (pending) {
    ctx.pendingAcks.delete(message.message_id);
    debugLog('YjsP2PProvider', `[Yjs] Received ACK for ${message.message_id}`);

    // Verify hash if we have it
    if (ctx.merkleTree && message.local_hash) {
      const localHash: string = ctx.merkleTree.getRootHash();
      if (localHash !== message.local_hash) {
        debugLog('YjsP2PProvider', `Hash mismatch in ACK! Local: ${localHash}, Remote: ${message.local_hash}`);
        ctx.handleHashMismatch(message.local_hash);
      }
    }
  }
}

// handleDivergenceMessage was removed: nothing in the tree ever constructed
// or sent a 'yjs_divergence' message, so this was the dead half of a
// one-ended protocol. Divergence recovery is driven by hash mismatches on
// updates and ACKs via handleHashMismatch (ack-checker.ts).
