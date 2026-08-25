/**
 * Instance Inbound Router (Singleton)
 *
 * Thin router class that delegates extraction to message-routing
 * and uses routing configuration from routing-rules.
 *
 * Routes incoming WebSocket messages to the correct instance.
 * Only runs on the leader instance (the one managing the WebSocket).
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { describeForwarded } from '@/lib/p2p/message-fingerprint';
import { instanceChannel } from './instance-channel';
import { debugLog } from '@/lib/debug-config';
import { INTERVAL } from '../timeout-constants';
import {
  REQUEST_TRACKING_TIMEOUT_MS,
  LEADER_MUST_PROCESS_LOCALLY,
  getMessageType,
  shouldBroadcast,
} from './routing-rules';
import { extractRequestId, extractTargetCid } from './message-routing';
import { OrphanBuffer } from './orphan-buffer';

debugLog('InstanceInboundRouter', '[ILM-Router] Module loading...');

class InstanceInboundRouter {
  private static instance: InstanceInboundRouter;

  private isActive: boolean = false;
  private pendingRequestMap: Map<string, { instanceId: string; timestamp: number }> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * Buffer for messages whose owner couldn't be found at dispatch
   * time. See `orphan-buffer.ts` for the timer/replay lifecycle.
   * Drained when `instance:registered` fires with a matching CID; on
   * timeout, the buffer invokes `processLocalMessage` so we never
   * silently strand a real message.
   */
  private readonly orphanBuffer = new OrphanBuffer(
    (message) => this.processLocalMessage(message),
  );

  private constructor() {
    debugLog('InstanceInboundRouter', '[ILM-Router] Constructor called, setting up event listeners...');
    this.setupEventListeners();
    this.startCleanupInterval();
    debugLog('InstanceInboundRouter', '[ILM-Router] Constructor complete');
  }

  public static getInstance(): InstanceInboundRouter {
    if (!InstanceInboundRouter.instance) {
      InstanceInboundRouter.instance = new InstanceInboundRouter();
    }
    return InstanceInboundRouter.instance;
  }

  // ── Event Listeners ──────────────────────────────────────────────────

  private setupEventListeners(): void {
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      this.isActive = data.isLeader;
      if (this.isActive) {
        debugLog('InstanceInboundRouter', '[ILM-Router] Activated as leader');
      } else {
        debugLog('InstanceInboundRouter', '[ILM-Router] Deactivated (no longer leader)');
      }
    });

    eventEmitter.on('channel:inbound-message', (data: { payload: unknown; senderInstanceId: string }) => {
      const messageType = getMessageType(data.payload);
      debugLog('InstanceInboundRouter', `[ILM-Router] Received forwarded message: type=${messageType}`);
      this.processLocalMessage(data.payload);
    });

    eventEmitter.on('channel:outbound-request', (data: { requestId?: string; senderInstanceId: string; payload?: unknown }) => {
      debugLog('InstanceInboundRouter', `[ILM-Router] channel:outbound-request requestId=${data.requestId}, sender=${data.senderInstanceId}, active=${this.isActive}`);
      if (this.isActive && data.requestId) {
        this.registerPendingRequest(data.requestId, data.senderInstanceId);
      }
    });

    // Drain the orphan buffer when a follower's cid-report arrives.
    // `instance:registered` fires for every cid-update; the buffer
    // is keyed by CID, so non-matching events are a cheap no-op.
    eventEmitter.on('instance:registered', (data: { instanceId: string; cid: bigint | null }) => {
      if (data.cid === null) return;
      this.orphanBuffer.drainForCid(data.cid.toString(), (entry) => {
        // Re-route via routeByCid so the just-registered owner is
        // picked up (instance map now has the entry). The recursion
        // is safe: the cid is now known, so we won't re-enter the
        // orphan branch.
        this.routeByCid(entry.message, entry.messageType);
      });
    });
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [requestId, entry] of this.pendingRequestMap) {
        if (now - entry.timestamp > REQUEST_TRACKING_TIMEOUT_MS) {
          this.pendingRequestMap.delete(requestId);
        }
      }
    }, INTERVAL.CLEANUP_MS);
  }

  registerPendingRequest(requestId: string, instanceId: string): void {
    this.pendingRequestMap.set(requestId, { instanceId, timestamp: Date.now() });
    debugLog('InstanceInboundRouter', `[ILM-Router] Registered pending request ${requestId} -> ${instanceId}`);
  }

  // ── Routing ──────────────────────────────────────────────────────────

  routeMessage(message: Record<string, unknown>): void {
    if (!this.isActive) {
      debugLog('InstanceInboundRouter', '[ILM-Router] routeMessage called but not leader');
      return;
    }

    const messageType = getMessageType(message);
    const requestId = extractRequestId(message);
    debugLog('InstanceInboundRouter',
      `[ILM-Router] routeMessage: type=${messageType}, requestId=${requestId}, pendingMapSize=${this.pendingRequestMap.size}`
    );

    if (shouldBroadcast(messageType)) {
      debugLog('InstanceInboundRouter', `[ILM-Router] Broadcasting ${messageType}`);
      this.broadcastToAll(message);
      return;
    }

    if (requestId) {
      const routed = this.routeByRequestId(message, messageType, requestId);
      if (routed) return;
    }

    this.routeByCid(message, messageType);
  }

  private routeByRequestId(
    message: Record<string, unknown>,
    messageType: string,
    requestId: string,
  ): boolean {
    const pending = this.pendingRequestMap.get(requestId);
    if (!pending) return false;

    debugLog('InstanceInboundRouter',
      `[ILM-Router] Routing ${messageType} by request_id ${requestId} -> ${pending.instanceId}`
    );
    this.pendingRequestMap.delete(requestId);

    if (messageType === 'ConnectSuccess' || messageType === 'RegisterSuccess') {
      const cid = extractTargetCid(message);
      if (cid) {
        debugLog('InstanceInboundRouter', `[ILM-Router] Registering CID ${cid} for instance ${pending.instanceId}`);
        instanceManager.registerInstance(pending.instanceId, BigInt(cid));
      }
    }

    if (pending.instanceId === instanceManager.instanceId) {
      this.processLocalMessage(message);
    } else {
      instanceChannel.forwardToInstance(pending.instanceId, message);
      if (LEADER_MUST_PROCESS_LOCALLY.has(messageType)) {
        debugLog('InstanceInboundRouter', `[ILM-Router] Also processing ${messageType} locally for central state (via request_id path)`);
        this.processLocalMessage(message);
      }
    }
    return true;
  }

  private routeByCid(message: Record<string, unknown>, messageType: string): void {
    const targetCid = extractTargetCid(message);
    debugLog('InstanceInboundRouter', `[ILM-Router] Routing ${messageType} (CID: ${targetCid || 'none'})`);

    if (!targetCid) {
      this.processLocalMessage(message);
      return;
    }

    const targetInstance = instanceManager.findInstanceByCid(BigInt(targetCid));

    if (targetInstance) {
      if (targetInstance === instanceManager.instanceId) {
        this.processLocalMessage(message);
      } else {
        instanceChannel.forwardToInstance(targetInstance, message);
        if (LEADER_MUST_PROCESS_LOCALLY.has(messageType)) {
          debugLog('InstanceInboundRouter', `[ILM-Router] Also processing ${messageType} locally for central state (ILM visibility)`);
          this.processLocalMessage(message);
        }
      }
    } else {
      if (messageType === 'ConnectSuccess' || messageType === 'RegisterSuccess') {
        debugLog('InstanceInboundRouter', `[ILM-Router] Registering CID ${targetCid} for self (leader's own connection)`);
        instanceManager.registerInstance(instanceManager.instanceId, BigInt(targetCid));
        this.processLocalMessage(message);
        return;
      }
      const knownInstances = instanceManager.getAllInstances();
      debugLog('InstanceInboundRouter', `[ILM-Router] No instance owns CID ${targetCid}, message may be lost`);
      debugLog('InstanceInboundRouter', `[ILM-Router] Known instances: ${knownInstances.map(i => `${i.instanceId}->${i.cid?.toString()}`).join(', ')}`);
      // Self-heal: BUFFER the orphaned message for up to the buffer
      // timeout, then either replay to the correct tab when a
      // cid-report lands OR fall back to processing locally on
      // timeout. Prior to the buffer, the current message was always
      // processed on the leader tab immediately — visible misdelivery
      // for user-facing notifications (chat messages, file-transfer
      // prompts) on every first message after a stale CID map. The
      // buffer holds for the BroadcastChannel round-trip; if no
      // follower owns the CID, the fallback timer makes the leader
      // process locally so we never strand a real message.
      this.orphanBuffer.push(targetCid, message, messageType);
      instanceChannel.requestCidReport();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private broadcastToAll(message: Record<string, unknown>): void {
    instanceChannel.broadcast(message);
    this.processLocalMessage(message);
  }

  private processLocalMessage(message: unknown): void {
    // The listener count is the diagnostic that matters here. A message emitted
    // with no subscriber vanishes silently -- no error, no trace -- and that is
    // indistinguishable from never having arrived. The router's own receiver
    // attaches at module load, but the P2P messenger subscribes to
    // 'websocket-message' only when it is constructed later in app init, so a
    // message forwarded into a still-booting tab lands in exactly that window.
    // Joined to the sending tab's `[ILM-Router] forward ->` line by fingerprint.
    const listeners = eventEmitter.listenerCount('websocket-message');
    if (listeners === 0) {
      debugLog('InstanceInboundRouter',
        `[ILM-Router] emit with NO listeners ${describeForwarded(message)} — message is lost here`);
    } else {
      debugLog('InstanceInboundRouter',
        `[ILM-Router] emit listeners=${listeners} ${describeForwarded(message)}`);
    }
    eventEmitter.emit('websocket-message', message);
  }

  routeToInstance(targetInstanceId: string, message: unknown): void {
    if (targetInstanceId === instanceManager.instanceId) {
      this.processLocalMessage(message);
    } else {
      instanceChannel.forwardToInstance(targetInstanceId, message);
    }
  }

  isRouterActive(): boolean {
    return this.isActive;
  }
}

// Export singleton instance + class (the latter for testing).
export const instanceInboundRouter = InstanceInboundRouter.getInstance();
export { InstanceInboundRouter };
