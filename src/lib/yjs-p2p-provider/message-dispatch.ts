/**
 * YJS P2P Provider - Inbound Message Dispatch
 *
 * Exact piecewise extraction of `handleMessage` / `handleSyncMessage` from
 * provider.ts, which sat at the file-size limit when destroy() gained the
 * awareness departure broadcast. Behavior unchanged; the comments moved with
 * the code they explain.
 */

import { debugLog } from '@/lib/debug-config';
import type { YjsP2PMessage, YjsSyncMessage } from './types';
import { handleSyncStep1, handleSyncStep2, handleUpdate, handleFullState, handleRequestFullState , type SyncHandlerContext } from './sync-handlers';
import { handleAwarenessMessage, handleAckMessage , type MessageHandlerContext } from './message-handlers';

/** The provider's ctx satisfies both handler-context views. */
export type YjsDispatchContext = SyncHandlerContext & MessageHandlerContext;

export function dispatchYjsMessage(ctx: YjsDispatchContext, message: YjsP2PMessage): void {
  switch (message.type) {
    case 'yjs_sync': dispatchSyncMessage(ctx, message); break;
    case 'yjs_awareness': handleAwarenessMessage(ctx, message); break;
    case 'yjs_ack': handleAckMessage(ctx, message); break;
    // 'yjs_divergence' (handler with no sender) removed; a legacy peer's lands in default.
    default:
      // `setupMessageListener` casts the CBOR payload with `as unknown as
      // YjsP2PMessage`; a future `yjs_*` variant added on the sender side
      // before this switch is updated would otherwise be silently dropped.
      // Surface the unknown type in dev tools so the gap is visible.
      debugLog(
        'YjsP2PProvider',
        'handleMessage: unknown Yjs message type',
        (message as { type?: unknown }).type,
      );
  }
}

function dispatchSyncMessage(ctx: YjsDispatchContext, message: YjsSyncMessage): void {
  const data: Uint8Array<ArrayBuffer> = new Uint8Array(message.data);
  switch (message.sub_type) {
    case 'sync_step1': handleSyncStep1(ctx, data, message); break;
    case 'sync_step2': handleSyncStep2(ctx, data, message); break;
    case 'update': handleUpdate(ctx, data, message); break;
    case 'full_state': handleFullState(ctx, data, message); break;
    case 'request_full': handleRequestFullState(ctx, message); break;
    default:
      // 'hash_check' was removed (never-initiated protocol whose responder
      // answered a MATCH with another hash_check — see types.ts). A legacy
      // peer's hash_check, or any future sub_type, is surfaced here rather
      // than silently dropped.
      debugLog('YjsP2PProvider', 'handleSyncMessage: ignoring unknown sub_type', (message as { sub_type?: unknown }).sub_type);
  }
}
