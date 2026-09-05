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
import { makeForwardFallback, attachForwardListeners, startPendingRequestCleanup, emitLocal } from './router-forwarding';
import { setP2PReplay } from '@/lib/p2p/p2p-handler-ready';
import { instanceChannel } from './instance-channel';
import { debugLog } from '@/lib/debug-config';
import { routeByRequestId, type PendingRequest } from './route-by-request-id';
import { INTERVAL } from '../timeout-constants';
import {
  REQUEST_TRACKING_TIMEOUT_MS,
  LEADER_MUST_PROCESS_LOCALLY,
  UNRELIABLE_FORWARDS,
  getMessageType,
  shouldBroadcast,
} from './routing-rules';
import { extractRequestId, extractTargetCid } from './message-routing';
import { OrphanBuffer } from './orphan-buffer';
import type { InstanceInfo } from '@/lib/multi-instance/instance-manager-types';

debugLog('InstanceInboundRouter', '[ILM-Router] Module loading...');

class InstanceInboundRouter {
  private static instance: InstanceInboundRouter;

  private isActive: boolean = false;
  private pendingRequestMap: Map<string, PendingRequest> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * Holds messages with no known owner AND forwards awaiting an ack. See
   * `orphan-buffer.ts` for the timer/replay lifecycle and
   * `router-forwarding.ts` for what a timeout does.
   */
  private readonly orphanBuffer: OrphanBuffer = new OrphanBuffer(
    makeForwardFallback((message) => this.processLocalMessage(message)),
  );

  private constructor() {
    // Replays re-enter the same path, so a held message is delivered exactly
    // as a fresh one would be.
    setP2PReplay((message) => this.processLocalMessage(message));
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

    attachForwardListeners({
      processLocally: (message) => this.processLocalMessage(message),
      retireForward: (requestId) => this.orphanBuffer.ack(requestId),
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
    this.cleanupInterval = startPendingRequestCleanup(
      this.pendingRequestMap, REQUEST_TRACKING_TIMEOUT_MS, INTERVAL.CLEANUP_MS);
  }

  registerPendingRequest(requestId: string, instanceId: string): void {
    this.pendingRequestMap.set(requestId, { instanceId, timestamp: Date.now() });
    debugLog('InstanceInboundRouter', `[ILM-Router] Registered pending request ${requestId} -> ${instanceId}`);
  }

  // ── Routing ──────────────────────────────────────────────────────────

  /**
   * Route one inbound message, and report whether it was DELIVERED — that is,
   * whether every tab entitled to this message has now been handed it.
   *
   * The caller needs that answer because there is a second delivery path
   * (`broadcastChannelService.broadcastWorkspaceResponse`) that used to run
   * alongside this one, suppressed only for the types listed in
   * `CID_ROUTED_NOTIFICATIONS`. That list was written for a different purpose —
   * stopping request_id routing — and every message that routes by CID without
   * being on it therefore reached the owning tab TWICE: once forwarded here,
   * once broadcast. All seven group notifications are built with
   * `request_id: None` and a recipient `cid`, so every group invite, join
   * request, member-state change, leave, end and disconnect was delivered
   * twice, and so was `DisconnectNotification` (broadcast here, then broadcast
   * again). A duplicated invite is a duplicated auto-accept.
   *
   * Answering from what actually happened, rather than from a hand-kept list of
   * types someone remembered to add, is what stops that list drifting again.
   */
  routeMessage(message: Record<string, unknown>): boolean {
    if (!this.isActive) {
      debugLog('InstanceInboundRouter', '[ILM-Router] routeMessage called but not leader');
      return false;
    }

    const messageType: ReturnType<typeof getMessageType> = getMessageType(message);
    const requestId: string | null = extractRequestId(message);
    debugLog('InstanceInboundRouter',
      `[ILM-Router] routeMessage: type=${messageType}, requestId=${requestId}, pendingMapSize=${this.pendingRequestMap.size}`
    );

    if (shouldBroadcast(messageType)) {
      debugLog('InstanceInboundRouter', `[ILM-Router] Broadcasting ${messageType}`);
      this.broadcastToAll(message);
      return true; // Every tab already has it.
    }

    if (requestId) {
      const routed: boolean = routeByRequestId({ pendingRequestMap: this.pendingRequestMap, processLocalMessage: (m) => this.processLocalMessage(m) }, message, messageType, requestId);
      if (routed) return true;
    }

    return this.routeByCid(message, messageType);
  }

  /** Returns whether the message reached the instance that owns its CID. */
  private routeByCid(message: Record<string, unknown>, messageType: string): boolean {
    const targetCid: string | null = extractTargetCid(message);
    debugLog('InstanceInboundRouter', `[ILM-Router] Routing ${messageType} (CID: ${targetCid || 'none'})`);

    if (!targetCid) {
      // Nobody can own it, so the leader takes it and the legacy broadcast
      // stays the only way a follower could ever see it. Not delivered.
      this.processLocalMessage(message);
      return false;
    }

    const targetInstance: string | null = instanceManager.findInstanceByCid(BigInt(targetCid));

    if (targetInstance) {
      if (targetInstance === instanceManager.instanceId) {
        this.processLocalMessage(message);
      } else {
        // Retained until the target acks. No ack within the buffer timeout and
        // the fallback above fires — the same terminal path an unowned CID
        // takes — so a dropped BroadcastChannel post can no longer lose the
        // message. A cid re-registration meanwhile drains and re-routes it,
        // which is the mid-reload recovery path.
        if (UNRELIABLE_FORWARDS.has(messageType)) {
          // Fire and forget; see UNRELIABLE_FORWARDS. Retaining a media frame
          // costs a uuid, a timer and the payload PER FRAME, and its fallback
          // decodes another tab's video on this one.
          instanceChannel.forwardToInstance(targetInstance, message);
        } else {
          const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
          this.orphanBuffer.push(targetCid, message, messageType, {
            requestId,
            targetInstanceId: targetInstance,
          });
          instanceChannel.forwardToInstance(targetInstance, message, requestId);
        }
        if (LEADER_MUST_PROCESS_LOCALLY.has(messageType)) {
          debugLog('InstanceInboundRouter', `[ILM-Router] Also processing ${messageType} locally for central state (ILM visibility)`);
          this.processLocalMessage(message);
        }
      }
      return true; // The instance that owns this CID has it.
    } else {
      if (messageType === 'ConnectSuccess' || messageType === 'RegisterSuccess') {
        debugLog('InstanceInboundRouter', `[ILM-Router] Registering CID ${targetCid} for self (leader's own connection)`);
        instanceManager.registerInstance(instanceManager.instanceId, BigInt(targetCid));
        this.processLocalMessage(message);
        return true;
      }
      const knownInstances: InstanceInfo[] = instanceManager.getAllInstances();
      debugLog('InstanceInboundRouter', `[ILM-Router] No instance owns CID ${targetCid}, message may be lost`);
      debugLog('InstanceInboundRouter', `[ILM-Router] Known instances: ${knownInstances.map(i => `${i.instanceId}->${i.cid?.toString()}`).join(', ')}`);
      // Self-heal: buffer the orphan, then replay to the right tab when a
      // cid-report lands, or fall back to processing locally on timeout.
      // Processing on the leader immediately (the old behaviour) misdelivered
      // user-facing notifications on every first message after a stale CID map;
      // the fallback timer still guarantees nothing is stranded.
      if (UNRELIABLE_FORWARDS.has(messageType)) {
        // Dropped, not buffered. A frame replayed after the orphan timeout is
        // two seconds stale, which is a worse artefact than the gap the
        // pipeline already knows how to recover from.
        debugLog('InstanceInboundRouter', `[ILM-Router] Dropping ${messageType} for unowned CID ${targetCid}`);
        instanceChannel.requestCidReport();
        return true; // Deliberately dropped, not awaiting a second path.
      }
      this.orphanBuffer.push(targetCid, message, messageType);
      instanceChannel.requestCidReport();
      // Buffered, not delivered: no instance owns this CID yet. The legacy
      // broadcast remains as the second chance it has always been, and the
      // receiving tab's own CID filter decides whether to keep it.
      return false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private broadcastToAll(message: Record<string, unknown>): void {
    instanceChannel.broadcast(message);
    this.processLocalMessage(message);
  }

  private processLocalMessage(message: unknown): void {
    emitLocal(message); // holds P2P traffic until something can receive it
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
export const instanceInboundRouter: InstanceInboundRouter = InstanceInboundRouter.getInstance();
export { InstanceInboundRouter };
