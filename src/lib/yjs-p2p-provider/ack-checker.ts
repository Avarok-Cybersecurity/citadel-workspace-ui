/**
 * YJS P2P Provider - ACK Timeout & Divergence Handling
 *
 * Manages pending ACK tracking, timeout detection, and
 * hash-mismatch-driven divergence recovery.
 */

import * as Y from 'yjs';
import { debugLog } from '@/lib/debug-config';
import type { SyncState } from './types';
import { sendP2PMessage, sendSyncMessage , type SendingContext } from './sending';
import { YJS_ACK_TIMEOUT_MS, YJS_MAX_RETRIES } from './constants';

/** Subset of provider state needed by ACK checker */
export interface AckCheckerContext extends SendingContext {
  readonly doc: Y.Doc;
  syncState: SyncState;
  readonly initialSyncComplete: boolean;
  initiateSync: () => void;
}

/**
 * Check pending ACKs for timeouts and trigger resync if needed
 */
export function checkPendingAcks(ctx: AckCheckerContext): void {
  const now: number = Date.now();

  for (const [messageId, pending] of ctx.pendingAcks.entries()) {
    if (now - pending.sentAt > YJS_ACK_TIMEOUT_MS) {
      if (pending.retryCount < YJS_MAX_RETRIES) {
        debugLog('YjsP2PProvider', `ACK timeout for ${messageId}, retry ${pending.retryCount + 1}/${YJS_MAX_RETRIES}`);
        pending.retryCount++;
        pending.sentAt = now;
        // RETRANSMIT the stored wire message. Before this, the "retry" only
        // re-armed the timer: a lost update was logged as retried three
        // times and then silently abandoned. Convergence survived only
        // because the pre-fix hash bug (provider.ts coalescer) forced a
        // full-document resync on every update — fixing that hash bug
        // WITHOUT this retransmit would turn hidden loss into real silent
        // divergence. The two fixes are coupled. Same message_id: the ACK
        // for any attempt clears the entry, and a duplicate delivery is
        // idempotent under Y.applyUpdate.
        sendP2PMessage(ctx, pending.message);
      } else {
        debugLog('YjsP2PProvider', `ACK timeout for ${messageId} - giving up (peer may be offline)`);
        ctx.pendingAcks.delete(messageId);
      }
    }
  }

  // The initial sync_step1 goes out exactly once, unacked, at construction —
  // the coldest moment for the channel. If it was lost, syncState sat in
  // 'awaiting_step1_response' forever: a "syncing" spinner that never
  // cleared, with nothing scheduled to retry. Re-initiate from this sweep
  // until the first sync completes; initiateSync() self-throttles via
  // YJS_SYNC_COOLDOWN_MS, so this retries at most once per cooldown window.
  // (This subsumes the old `timedOutCount > 3` heuristic, which could never
  // fire for a lost step1 — an unacked message leaves pendingAcks empty.)
  if (!ctx.initialSyncComplete) {
    ctx.initiateSync();
  }
}

/**
 * Handle hash mismatch - initiate divergence recovery
 */
export function handleHashMismatch(ctx: SendingContext, _remoteHash: string): void {
  debugLog('YjsP2PProvider', 'Hash mismatch detected, initiating divergence recovery');

  if (ctx.ownCid === ctx.creatorCid) {
    debugLog('YjsP2PProvider', `[Yjs] Creator authority: broadcasting full state`);
    const doc: Y.Doc = (ctx as AckCheckerContext).doc;
    const fullState: Uint8Array<ArrayBufferLike> = Y.encodeStateAsUpdate(doc);
    sendSyncMessage(ctx, 'full_state', fullState, true);
  } else {
    debugLog('YjsP2PProvider', `[Yjs] Collaborator: requesting full state from creator`);
    sendSyncMessage(ctx, 'request_full', new Uint8Array(0), false);
  }
}
