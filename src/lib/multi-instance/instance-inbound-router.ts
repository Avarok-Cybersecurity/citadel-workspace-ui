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

debugLog('InstanceInboundRouter', '[ILM-Router] Module loading...');

class InstanceInboundRouter {
  private static instance: InstanceInboundRouter;

  private isActive: boolean = false;
  private pendingRequestMap: Map<string, { instanceId: string; timestamp: number }> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

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

    eventEmitter.on(
      'channel:outbound-request',
      (data: { requestId?: string; senderInstanceId: string; payload?: unknown }) => {
        debugLog('InstanceInboundRouter',
          `[ILM-Router] Received channel:outbound-request: requestId=${data.requestId}, sender=${data.senderInstanceId}, active=${this.isActive}`
        );
        if (this.isActive && data.requestId) {
          this.registerPendingRequest(data.requestId, data.senderInstanceId);
        }
      }
    );
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
      debugLog('InstanceInboundRouter', 'routeMessage called but not leader');
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
      debugLog('InstanceInboundRouter', `No instance owns CID ${targetCid}, message may be lost`);
      debugLog('InstanceInboundRouter', `Known instances: ${knownInstances.map(i => `${i.instanceId}->${i.cid?.toString()}`).join(', ')}`);
      // Self-heal: ask every other instance to re-broadcast its CID. Cheap,
      // idempotent, and means a single missed cid-update broadcast doesn't
      // permanently strand CID-routed notifications (Message,
      // PeerRegister, FileTransferRequest, etc.) for a given session.
      // Followers that respond will trigger handleCidUpdate on the leader,
      // which populates the instance map and unblocks subsequent routes.
      //
      // ONE-MESSAGE DELIVERY TRADE-OFF: requestCidReport is fire-and-forget
      // over BroadcastChannel; the very next `processLocalMessage` runs
      // synchronously, so the CURRENT message is always processed on the
      // leader tab before any follower's CID-report response can arrive. A
      // FileTransferRequestNotification destined for a follower can
      // therefore prompt on the leader tab once before correct routing
      // kicks in. Subsequent messages route correctly. We accept this
      // trade-off because the alternative — awaiting reports inline — adds
      // latency and a timeout-vs-deliver decision that the current
      // architecture intentionally pushes to ILM redelivery for genuinely
      // dropped messages.
      instanceChannel.requestCidReport();
      this.processLocalMessage(message);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private broadcastToAll(message: Record<string, unknown>): void {
    instanceChannel.broadcast(message);
    this.processLocalMessage(message);
  }

  private processLocalMessage(message: unknown): void {
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

// Export singleton instance
export const instanceInboundRouter = InstanceInboundRouter.getInstance();

// Also export class for testing
export { InstanceInboundRouter };
