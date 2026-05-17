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

/**
 * How long to hold an orphaned (unknown-CID) message in the self-heal
 * buffer before falling back to processing it on the leader tab.
 * Window picked to cover the BroadcastChannel round-trip for a CID
 * report (typically <50ms across same-origin tabs) with substantial
 * headroom for a sleeping tab, while keeping the user-visible latency
 * acceptable for an interactive notification like a chat message or
 * file-transfer prompt.
 */
const ORPHAN_BUFFER_TIMEOUT_MS = 500;

/** A message held in the orphan buffer pending a cid-report response. */
interface OrphanedMessage {
  message: Record<string, unknown>;
  messageType: string;
  fallbackTimer: ReturnType<typeof setTimeout>;
}

class InstanceInboundRouter {
  private static instance: InstanceInboundRouter;

  private isActive: boolean = false;
  private pendingRequestMap: Map<string, { instanceId: string; timestamp: number }> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  /**
   * CID-keyed buffer for messages whose owner couldn't be found at
   * dispatch time. Drained when an `instance:registered` event matches
   * the CID; otherwise flushed locally after
   * `ORPHAN_BUFFER_TIMEOUT_MS`. Multiple messages can pile up for the
   * same CID during the buffer window (e.g. a burst of
   * FileTransferTickNotifications), hence the array.
   */
  private orphanedMessages: Map<string, OrphanedMessage[]> = new Map();

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

    // Drain the orphan buffer when a follower's cid-report arrives.
    // `instance:registered` fires for every cid-update, so we filter on
    // the CID matching one we're holding messages for.
    eventEmitter.on('instance:registered', (data: { instanceId: string; cid: bigint | null }) => {
      if (data.cid === null) return;
      const cidKey = data.cid.toString();
      const buffered = this.orphanedMessages.get(cidKey);
      if (!buffered || buffered.length === 0) return;
      debugLog('InstanceInboundRouter',
        `[ILM-Router] Draining ${buffered.length} buffered message(s) for CID ${cidKey} -> ${data.instanceId}`
      );
      this.orphanedMessages.delete(cidKey);
      for (const entry of buffered) {
        clearTimeout(entry.fallbackTimer);
        // Re-route via routeByCid so the just-registered owner is
        // picked up (instance map now has the entry). The recursion is
        // safe: the cid is now known, so we won't re-enter the orphan
        // branch.
        this.routeByCid(entry.message, entry.messageType);
      }
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
      // Self-heal: ask every other instance to re-broadcast its CID,
      // BUFFER the orphaned message for up to ORPHAN_BUFFER_TIMEOUT_MS,
      // then either replay to the correct tab when a cid-report lands
      // OR fall back to processing locally on timeout. Prior to the
      // buffer, the current message was always processed on the leader
      // tab immediately — visible misdelivery for user-facing
      // notifications (chat messages, file-transfer prompts) on every
      // first message after a stale CID map. The buffer holds for the
      // BroadcastChannel round-trip; if no follower owns the CID, the
      // fallback timer makes the leader process locally so we never
      // strand a real message.
      this.bufferOrphanedMessage(targetCid, message, messageType);
      instanceChannel.requestCidReport();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Push an orphaned message into the buffer and arm a fallback timer.
   * If `instance:registered` fires for the CID before the timer, the
   * `setupEventListeners` drain replays the message via `routeByCid`.
   */
  private bufferOrphanedMessage(
    cid: string,
    message: Record<string, unknown>,
    messageType: string,
  ): void {
    const fallbackTimer = setTimeout(() => {
      const buffered = this.orphanedMessages.get(cid);
      if (!buffered) return;
      // Remove just this entry (other messages for the same cid may
      // still be in-flight) — identify by reference, not by index, so
      // concurrent drains don't skip past the one we own.
      const remaining = buffered.filter(e => e.fallbackTimer !== fallbackTimer);
      if (remaining.length === 0) {
        this.orphanedMessages.delete(cid);
      } else {
        this.orphanedMessages.set(cid, remaining);
      }
      debugLog('InstanceInboundRouter',
        `[ILM-Router] Orphan buffer timeout for CID ${cid} (${messageType}); falling back to processLocalMessage`,
      );
      this.processLocalMessage(message);
    }, ORPHAN_BUFFER_TIMEOUT_MS);

    const entry: OrphanedMessage = { message, messageType, fallbackTimer };
    const existing = this.orphanedMessages.get(cid);
    if (existing) {
      existing.push(entry);
    } else {
      this.orphanedMessages.set(cid, [entry]);
    }
    debugLog('InstanceInboundRouter',
      `[ILM-Router] Buffered ${messageType} for CID ${cid} (orphan buffer size for cid=${(existing?.length ?? 0) + 1}, timeout ${ORPHAN_BUFFER_TIMEOUT_MS}ms)`,
    );
  }

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
