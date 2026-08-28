/**
 * Acknowledged cross-tab forwarding.
 *
 * A forward used to be a bare BroadcastChannel post: no ack, no retry, and
 * MessageNotification is not in LEADER_MUST_PROCESS_LOCALLY, so the leader kept
 * no copy. Three ways that lost a message — the target tab mid-reload (the
 * channel does not queue for absent listeners), a tab whose P2P handler had not
 * subscribed yet, and a "ghost" instance that died without announcing it.
 *
 * One mechanism covers all three: the leader retains every forward until the
 * target acks. Ack drops it; a cid re-registration replays it; a timeout falls
 * back to processing locally and unregisters the ghost. The receiving tab acks
 * only once its P2P handler is attached, so an ack always means the message
 * reached something that can act on it.
 *
 * Split from instance-inbound-router.ts to keep that file under the 250-line
 * cap, and because "how a forward is guaranteed" is a separate concern from
 * "which tab a message belongs to".
 */

import { eventEmitter } from '../event-emitter';
import { instanceChannel } from './instance-channel';
import { instanceManager } from './instance-manager';
import { getMessageType } from './routing-rules';
import { debugLog } from '@/lib/debug-config';
import { logEmit, mustHoldForP2PHandler } from './router-diagnostics';
import { isP2PMessageHandlerAttached } from '@/lib/p2p/p2p-handler-ready';

/**
 * The orphan buffer's fallback for an un-acked forward.
 *
 * Unregistering the target matters as much as the local fallback: without it
 * every subsequent message to that CID pays the full timeout again before
 * being delivered.
 */
export function makeForwardFallback(processLocally: (message: Record<string, unknown>) => void) {
  return (message: Record<string, unknown>, messageType: string, targetInstanceId?: string): void => {
    if (targetInstanceId) {
      debugLog('InstanceInboundRouter',
        `[ILM-Router] forward to ${targetInstanceId} not acked (${messageType}); unregistering, processing locally`);
      instanceManager.unregisterInstance(targetInstanceId);
      instanceChannel.requestCidReport();
    }
    processLocally(message);
  };
}

/**
 * Wire the receiving side (process + ack) and the leader side (ack retires the
 * retained copy).
 */
export function attachForwardListeners(handlers: {
  processLocally: (message: unknown) => void;
  retireForward: (requestId: string) => void;
}): void {
  eventEmitter.on('channel:inbound-message',
    (data: { payload: unknown; senderInstanceId: string; requestId?: string }) => {
      const messageType = getMessageType(data.payload);
      debugLog('InstanceInboundRouter', `[ILM-Router] Received forwarded message: type=${messageType}`);

      if (data.requestId && !isP2PMessageHandlerAttached()) {
        // Neither process NOR ack. The leader still holds the authoritative
        // copy and will re-forward on cid re-registration or fall back on
        // timeout; processing without acking would split delivery across tabs.
        debugLog('InstanceInboundRouter',
          `[ILM-Router] Withholding ack for ${messageType}: P2P handler not attached`);
        return;
      }

      handlers.processLocally(data.payload);
      if (data.requestId) {
        instanceChannel.sendInboundAck(data.senderInstanceId, data.requestId);
      }
    });

  // Every tab sees this event but only the leader holds entries, so a miss on
  // a follower is normal and needs no leader guard.
  eventEmitter.on('channel:inbound-ack', (data: { requestId: string }) => {
    handlers.retireForward(data.requestId);
  });
}

/**
 * Prune request→instance entries that no response ever came back for.
 *
 * Without this the map grows for the life of the tab: every proxied request
 * that times out, errors, or whose instance disappears leaves an entry behind.
 */
export function startPendingRequestCleanup(
  pending: Map<string, { instanceId: string; timestamp: number }>,
  timeoutMs: number,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now: number = Date.now();
    for (const [requestId, entry] of pending) {
      if (now - entry.timestamp > timeoutMs) pending.delete(requestId);
    }
  }, intervalMs);
}

/**
 * Deliver a message to this tab's subscribers.
 *
 * Holds MessageNotification until the P2P handler has attached. Emitting
 * before then hands it to the services that subscribe at module load and to
 * nobody who can act on it — which is precisely how msg_id=10 was lost in CI
 * run 32912073077: emitted twice to eight listeners, with the P2P handler
 * still absent and attaching moments later.
 */
export function emitLocal(message: unknown): void {
  if (mustHoldForP2PHandler(message)) return;
  logEmit(eventEmitter.listenerCount('websocket-message'), message);
  eventEmitter.emit('websocket-message', message);
}
