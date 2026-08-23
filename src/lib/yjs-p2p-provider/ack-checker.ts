/**
 * YJS P2P Provider - ACK Timeout & Divergence Handling
 *
 * Manages pending ACK tracking, timeout detection, and
 * hash-mismatch-driven divergence recovery.
 */

import * as Y from 'yjs';
import { debugLog } from '@/lib/debug-config';
import type { SyncState } from './types';
import { sendSyncMessage } from './sending';
import type { SendingContext } from './sending';
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
  const now = Date.now();
  let timedOutCount = 0;

  for (const [messageId, pending] of ctx.pendingAcks.entries()) {
    if (now - pending.sentAt > YJS_ACK_TIMEOUT_MS) {
      timedOutCount++;
      if (pending.retryCount < YJS_MAX_RETRIES) {
        debugLog('YjsP2PProvider', `ACK timeout for ${messageId}, retry ${pending.retryCount + 1}/${YJS_MAX_RETRIES}`);
        pending.retryCount++;
        pending.sentAt = now;
      } else {
        debugLog('YjsP2PProvider', `ACK timeout for ${messageId} - giving up (peer may be offline)`);
        ctx.pendingAcks.delete(messageId);
      }
    }
  }

  if (timedOutCount > 3 && !ctx.initialSyncComplete) {
    debugLog('YjsP2PProvider', `[Yjs] Multiple ACK timeouts (${timedOutCount}), attempting resync`);
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
    const doc = (ctx as AckCheckerContext).doc;
    const fullState = Y.encodeStateAsUpdate(doc);
    sendSyncMessage(ctx, 'full_state', fullState, true);
  } else {
    debugLog('YjsP2PProvider', `[Yjs] Collaborator: requesting full state from creator`);
    sendSyncMessage(ctx, 'request_full', new Uint8Array(0), false);
  }
}
