/**
 * YJS P2P Provider - Sync Message Handlers
 *
 * Handles SyncStep1, SyncStep2, live updates, full-state,
 * request-full-state, and hash-check messages.
 */

import * as Y from 'yjs';
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import type { YjsSyncMessage, SyncState } from './types';
import { sendSyncMessage, sendAck } from './sending';
import type { SendingContext } from './sending';

/** Subset of provider state needed by sync handlers */
export interface SyncHandlerContext extends SendingContext {
  readonly doc: Y.Doc;
  syncState: SyncState;
  initialSyncComplete: boolean;
  updateMerkleTree: () => void;
  handleHashMismatch: (remoteHash: string) => void;
}

/**
 * Handle SyncStep1: Peer sent their state vector
 * We should:
 * 1. Send our own state vector (if we haven't)
 * 2. Compute and send the diff they need (SyncStep2)
 */
export function handleSyncStep1(
  ctx: SyncHandlerContext,
  stateVector: Uint8Array,
  _message: YjsSyncMessage
): void {
  // Avoid responding to duplicate/old sync messages
  if (ctx.syncState === 'synced' && ctx.initialSyncComplete) {
    debugLog('YjsP2PProvider', `[Yjs] Ignoring SyncStep1 - already synced`);
    // Just send SyncStep2 with any updates they might need
    const diff = Y.encodeStateAsUpdate(ctx.doc, stateVector);
    if (diff.length > 2) { // More than empty update
      sendSyncMessage(ctx, 'sync_step2', diff, false); // No ACK needed for response
    }
    return;
  }

  debugLog('YjsP2PProvider', `[Yjs] Received SyncStep1 from peer`);

  // Compute diff that peer needs
  const diff = Y.encodeStateAsUpdate(ctx.doc, stateVector);

  // Only send our state vector back if we're in idle state (haven't initiated sync yet)
  // This prevents the ping-pong pattern
  if (ctx.syncState === 'idle') {
    const myStateVector = Y.encodeStateVector(ctx.doc);
    sendSyncMessage(ctx, 'sync_step1', myStateVector, false);
  }

  // Send SyncStep2 with the diff they need (no ACK required - reduces traffic)
  sendSyncMessage(ctx, 'sync_step2', diff, false);

  // Update state
  ctx.syncState = 'awaiting_step2_response';
}

/**
 * Handle SyncStep2: Peer sent differential update
 */
export function handleSyncStep2(
  ctx: SyncHandlerContext,
  diff: Uint8Array,
  message: YjsSyncMessage
): void {
  // Only log if this is the initial sync or a significant update
  if (!ctx.initialSyncComplete) {
    debugLog('YjsP2PProvider', `[Yjs] Initial sync: received ${diff.length} bytes from peer`);
  }

  // Apply the diff
  Y.applyUpdate(ctx.doc, diff, 'remote');

  // Update Merkle tree
  ctx.updateMerkleTree();

  // Send ACK with our current hash
  sendAck(ctx, message.message_id);

  // Mark initial sync as complete
  ctx.initialSyncComplete = true;
  ctx.syncState = 'synced';

  // Emit sync complete event
  eventEmitter.emit('yjs:sync-complete', { documentId: ctx.documentId });
  eventEmitter.emit('yjs:document-update', { documentId: ctx.documentId });
}

/**
 * Handle live update during normal operation
 */
export function handleUpdate(
  ctx: SyncHandlerContext,
  update: Uint8Array,
  message: YjsSyncMessage
): void {
  // Apply the update
  Y.applyUpdate(ctx.doc, update, 'remote');

  // Update Merkle tree
  ctx.updateMerkleTree();

  // Send ACK if required
  if (message.requires_ack) {
    sendAck(ctx, message.message_id);
  }

  // Verify hash matches if provided
  if (message.doc_hash && ctx.merkleTree) {
    const localHash = ctx.merkleTree.getRootHash();
    if (localHash !== message.doc_hash) {
      debugLog('YjsP2PProvider', `Hash mismatch after update! Local: ${localHash}, Remote: ${message.doc_hash}`);
      ctx.handleHashMismatch(message.doc_hash);
    }
  }

  // Emit update event for UI
  eventEmitter.emit('yjs:document-update', { documentId: ctx.documentId });
}

/**
 * Handle full state from creator (divergence recovery)
 */
export function handleFullState(
  ctx: SyncHandlerContext,
  fullState: Uint8Array,
  message: YjsSyncMessage
): void {
  debugLog('YjsP2PProvider', `[Yjs] Received full state from creator (${fullState.length} bytes)`);

  // Apply creator's authoritative state
  ctx.doc.transact(() => {
    Y.applyUpdate(ctx.doc, fullState, 'creator-resync');
  });

  // Rebuild Merkle tree
  ctx.updateMerkleTree();

  // Send ACK
  sendAck(ctx, message.message_id);

  ctx.syncState = 'synced';
  eventEmitter.emit('yjs:document-update', { documentId: ctx.documentId });
}

/**
 * Handle request for full state (from collaborator)
 */
export function handleRequestFullState(
  ctx: SyncHandlerContext,
  _message: YjsSyncMessage
): void {
  // Only creator should respond
  if (ctx.ownCid !== ctx.creatorCid) {
    debugLog('YjsP2PProvider', `[Yjs] Ignoring full state request - not the creator`);
    return;
  }

  debugLog('YjsP2PProvider', `[Yjs] Sending full state as creator`);

  const fullState = Y.encodeStateAsUpdate(ctx.doc);
  sendSyncMessage(ctx, 'full_state', fullState, true);
}

/**
 * Handle hash check request
 */
export function handleHashCheck(
  ctx: SyncHandlerContext,
  message: YjsSyncMessage
): void {
  if (!ctx.merkleTree) return;

  const localHash = ctx.merkleTree.getRootHash();

  if (message.doc_hash && localHash !== message.doc_hash) {
    ctx.handleHashMismatch(message.doc_hash);
  } else {
    // Send our hash back for verification
    sendSyncMessage(ctx, 'hash_check', new Uint8Array(0), false, localHash);
  }
}
