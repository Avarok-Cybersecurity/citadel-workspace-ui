/**
 * YJS P2P Provider - Non-Sync Message Handlers
 *
 * Handles ACK, awareness, and divergence messages.
 */

import * as Y from 'yjs';
import { applyAwarenessUpdate } from 'y-protocols/awareness';
import type { Awareness } from 'y-protocols/awareness';
import { debugLog } from '@/lib/debug-config';
import type {
  YjsAwarenessMessage,
  YjsAckMessage,
  YjsDivergenceMessage,
  SyncState,
} from './types';
import { sendSyncMessage } from './sending';
import type { SendingContext } from './sending';

/** Subset of provider state needed by message handlers */
export interface MessageHandlerContext extends SendingContext {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  syncState: SyncState;
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
  const pending = ctx.pendingAcks.get(message.message_id);
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

/**
 * Handle divergence notification
 */
export function handleDivergenceMessage(
  ctx: MessageHandlerContext,
  message: YjsDivergenceMessage
): void {
  debugLog('YjsP2PProvider', `[Yjs] Received divergence notification: ${message.action}`);

  ctx.syncState = 'diverged';

  if (message.action === 'full_resync') {
    // If we're the creator, send full state
    if (ctx.ownCid === ctx.creatorCid) {
      const fullState: Uint8Array<ArrayBufferLike> = Y.encodeStateAsUpdate(ctx.doc);
      sendSyncMessage(ctx, 'full_state', fullState, true);
    } else {
      // Request full state from creator
      sendSyncMessage(ctx, 'request_full', new Uint8Array(0), false);
    }
  }
}
