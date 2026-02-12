/**
 * Instance Inbound Router
 *
 * Routes incoming WebSocket messages to the correct instance.
 * Only runs on the leader instance (the one managing the WebSocket).
 *
 * Flow:
 * 1. Leader receives message from WebSocket
 * 2. Extract CID from message (target session)
 * 3. Find which instance owns that CID
 * 4. Forward to that instance via InstanceChannel
 *
 * For broadcast messages (no specific CID):
 * - Forward to all instances
 *
 * For messages for leader's own CID:
 * - Process locally (don't send through channel)
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { instanceChannel } from './instance-channel';
import { debugLog } from '@/lib/debug-config';
import type { ResponseType } from 'citadel-workspace-client-ts';

// Debug: Log when this module is loaded
debugLog('InstanceInboundRouter', '[ILM-Router] Module loading...');

// Message types that should be broadcast to all instances
const BROADCAST_MESSAGE_TYPES = [
  'ServerResponse', // Generic server responses
  'DisconnectNotification', // Session disconnected
  'DeregisterSuccess', // Account deleted
  // Add other types that all instances should see
];

// Fields that commonly contain the target CID
const CID_FIELDS = ['cid', 'peer_cid', 'session_cid'];

// Timeout for request tracking (5 minutes)
const REQUEST_TRACKING_TIMEOUT_MS = 5 * 60 * 1000;

class InstanceInboundRouter {
  private static instance: InstanceInboundRouter;

  private isActive: boolean = false;

  // Track which instance made each request (for response routing)
  // Key: requestId, Value: { instanceId, timestamp }
  private pendingRequestMap: Map<string, { instanceId: string; timestamp: number }> =
    new Map();

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

  private setupEventListeners(): void {
    // Listen for leader status changes
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      this.isActive = data.isLeader;

      if (this.isActive) {
        debugLog('InstanceInboundRouter', '[ILM-Router] Activated as leader');
      } else {
        debugLog('InstanceInboundRouter', '[ILM-Router] Deactivated (no longer leader)');
      }
    });

    // Listen for forwarded messages (when we're a follower)
    eventEmitter.on('channel:inbound-message', (data: { payload: unknown; senderInstanceId: string }) => {
      const messageType = this.getMessageType(data.payload);
      debugLog('InstanceInboundRouter', `[ILM-Router] Received forwarded message: type=${messageType}`);
      // Process the forwarded message
      this.processLocalMessage(data.payload);
    });

    // Listen for outbound requests to track which instance made each request
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

  /**
   * Start cleanup interval to remove stale request tracking entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [requestId, entry] of this.pendingRequestMap) {
        if (now - entry.timestamp > REQUEST_TRACKING_TIMEOUT_MS) {
          this.pendingRequestMap.delete(requestId);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Register a pending request for response routing
   */
  registerPendingRequest(requestId: string, instanceId: string): void {
    this.pendingRequestMap.set(requestId, {
      instanceId,
      timestamp: Date.now(),
    });
    debugLog('InstanceInboundRouter', 
      `[ILM-Router] Registered pending request ${requestId} → ${instanceId}`
    );
  }

  /**
   * Route an incoming WebSocket message to the appropriate instance(s)
   * Called by websocket-service when leader receives a message
   */
  routeMessage(message: Record<string, unknown>): void {
    if (!this.isActive) {
      // We're not the leader - this shouldn't happen
      console.warn('[ILM-Router] routeMessage called but not leader');
      return;
    }

    const messageType = this.getMessageType(message);
    const requestId = this.extractRequestId(message);
    debugLog('InstanceInboundRouter', 
      `[ILM-Router] routeMessage: type=${messageType}, requestId=${requestId}, pendingMapSize=${this.pendingRequestMap.size}`
    );

    // Check if this is a broadcast message
    if (this.shouldBroadcast(messageType)) {
      debugLog('InstanceInboundRouter', `[ILM-Router] Broadcasting ${messageType}`);
      this.broadcastToAll(message);
      return;
    }

    // FIRST: Try to route by request_id (for request/response correlation)
    if (requestId) {
      const pending = this.pendingRequestMap.get(requestId);
      if (pending) {
        debugLog('InstanceInboundRouter', 
          `[ILM-Router] Routing ${messageType} by request_id ${requestId} → ${pending.instanceId}`
        );
        this.pendingRequestMap.delete(requestId); // Clean up after routing

        // CRITICAL: For ConnectSuccess/RegisterSuccess, register the CID for the requesting instance
        // This ensures CID-based routing works for subsequent messages
        if (messageType === 'ConnectSuccess' || messageType === 'RegisterSuccess') {
          const cid = this.extractTargetCid(message);
          if (cid) {
            debugLog('InstanceInboundRouter', `[ILM-Router] Registering CID ${cid} for instance ${pending.instanceId}`);
            instanceManager.registerInstance(pending.instanceId, BigInt(cid));
          }
        }

        if (pending.instanceId === instanceManager.instanceId) {
          // It's for us (leader)
          this.processLocalMessage(message);
        } else {
          // Forward to the instance that made the request
          instanceChannel.forwardToInstance(pending.instanceId, message);

          // CRITICAL: For P2P connection state messages, ALSO process locally on the leader.
          // ILM runs on the leader and needs to see ALL connection state changes.
          if (InstanceInboundRouter.LEADER_MUST_PROCESS_LOCALLY.has(messageType)) {
            debugLog('InstanceInboundRouter', `[ILM-Router] Also processing ${messageType} locally for central state (via request_id path)`);
            this.processLocalMessage(message);
          }
        }
        return;
      }
    }

    // SECOND: Try to route by CID
    const targetCid = this.extractTargetCid(message);
    debugLog('InstanceInboundRouter', `[ILM-Router] Routing ${messageType} (CID: ${targetCid || 'none'})`);

    // Find target instance
    if (targetCid) {
      const targetInstance = instanceManager.findInstanceByCid(BigInt(targetCid));

      if (targetInstance) {
        // Forward to specific instance
        if (targetInstance === instanceManager.instanceId) {
          // It's for us (leader)
          this.processLocalMessage(message);
        } else {
          // Forward to follower
          instanceChannel.forwardToInstance(targetInstance, message);

          // CRITICAL: For P2P connection state messages, ALSO process locally on the leader.
          // ILM runs on the leader and calls getPeersForSession() for ANY CID, so the leader
          // needs to see ALL connection state changes (not just its own session).
          // Without this, the leader's connectedPeers Map won't have entries for follower sessions.
          if (InstanceInboundRouter.LEADER_MUST_PROCESS_LOCALLY.has(messageType)) {
            debugLog('InstanceInboundRouter', `[ILM-Router] Also processing ${messageType} locally for central state (ILM visibility)`);
            this.processLocalMessage(message);
          }
        }
      } else {
        // No instance owns this CID yet

        // SPECIAL CASE: For ConnectSuccess/RegisterSuccess for the leader's own connection,
        // register the CID for ourselves before processing
        if (messageType === 'ConnectSuccess' || messageType === 'RegisterSuccess') {
          debugLog('InstanceInboundRouter', `[ILM-Router] Registering CID ${targetCid} for self (leader's own connection)`);
          instanceManager.registerInstance(instanceManager.instanceId, BigInt(targetCid));
          this.processLocalMessage(message);
          return;
        }

        // For other messages, log a warning but still process locally
        const knownInstances = instanceManager.getAllInstances();
        console.warn(`[ILM-Router] No instance owns CID ${targetCid}, message may be lost`);
        console.warn(`[ILM-Router] Known instances: ${knownInstances.map(i => `${i.instanceId}→${i.cid?.toString()}`).join(', ')}`);

        // Still process locally in case it's relevant
        // (e.g., session status updates that leader should know about)
        this.processLocalMessage(message);
      }
    } else {
      // No CID in message - process locally (leader handles generic messages)
      this.processLocalMessage(message);
    }
  }

  // Notification message types that should be routed by CID, NOT by request_id
  // These messages have a request_id that belongs to the SENDER, but the message
  // should be delivered to the RECIPIENT (identified by the 'cid' field).
  private static readonly CID_ROUTED_NOTIFICATIONS = new Set<ResponseType>([
    'PeerRegisterNotification', // cid = recipient, request_id = sender's
    'PeerConnectNotification',  // cid = recipient, request_id = sender's
    'MessageNotification',      // cid = recipient, request_id = sender's (from SendMessage)
  ]);

  // Message types that the leader must ALSO process locally when forwarding to followers.
  // These messages affect P2P connection state which ILM needs to query.
  // ILM runs on the leader and calls getPeersForSession() for ANY CID, so the leader's
  // connectedPeers Map must have entries for ALL sessions (not just the leader's own).
  // TYPE-GAP: 'PeerDisconnect' exists at runtime but not in generated ResponseType
  private static readonly LEADER_MUST_PROCESS_LOCALLY = new Set<ResponseType | string>([
    'PeerConnectNotification',  // Affects connectedPeers[targetCid]
    'PeerConnectSuccess',       // Affects connectedPeers[initiatorCid]
    'PeerDisconnect',           // Removes from connectedPeers
    'DisconnectNotification',   // Removes from connectedPeers (when peer C2S drops)
  ]);

  /**
   * Extract request_id from a response message for routing
   *
   * IMPORTANT: Some notification messages (like PeerRegisterNotification) have a
   * request_id that belongs to the SENDER, not the RECIPIENT. For these messages,
   * we must NOT use request_id routing - instead, the router will fall through to
   * CID-based routing which uses the 'cid' field to find the correct recipient.
   */
  private extractRequestId(message: Record<string, unknown>): string | null {
    if (!message || typeof message !== 'object') {
      return null;
    }

    const messageType = this.getMessageType(message);

    // Skip request_id extraction for notification messages that should be routed by CID
    // These messages have request_id from the sender, but should go to the 'cid' recipient
    if (InstanceInboundRouter.CID_ROUTED_NOTIFICATIONS.has(messageType)) {
      debugLog('InstanceInboundRouter', `[ILM-Router] ${messageType} uses CID routing, skipping request_id extraction`);
      return null;
    }

    const payload = message[messageType] as Record<string, unknown> | undefined;

    if (payload && typeof payload === 'object') {
      // Check for request_id field
      if (payload.request_id) {
        return String(payload.request_id);
      }
    }

    return null;
  }

  /**
   * Broadcast a message to all instances
   */
  private broadcastToAll(message: Record<string, unknown>): void {
    // Send to followers
    instanceChannel.broadcast(message);

    // Process locally (leader is also an instance)
    this.processLocalMessage(message);
  }

  /**
   * Process a message locally (emit to event system)
   */
  private processLocalMessage(message: unknown): void {
    // Emit to the existing event system for components to handle
    eventEmitter.emit('websocket-message', message);
  }

  /**
   * Get the type of the message (first key)
   */
  private getMessageType(message: unknown): ResponseType {
    if (!message || typeof message !== 'object') {
      return 'unknown' as ResponseType;
    }

    const keys = Object.keys(message);
    return (keys[0] || 'unknown') as ResponseType;
  }

  /**
   * Extract the target CID from a message
   * Messages can have CID in various places depending on type
   */
  private extractTargetCid(message: Record<string, unknown>): string | null {
    if (!message || typeof message !== 'object') {
      return null;
    }

    // Check top level
    for (const field of CID_FIELDS) {
      if (message[field]) {
        return String(message[field]);
      }
    }

    // Check nested in message type (e.g., { MessageNotification: { cid: ... } })
    const messageType = this.getMessageType(message);
    const payload = message[messageType] as Record<string, unknown> | undefined;

    if (payload && typeof payload === 'object') {
      for (const field of CID_FIELDS) {
        if (payload[field]) {
          return String(payload[field]);
        }
      }

      // Check for Response wrapper
      const response = payload.Response as Record<string, unknown> | undefined;
      if (response) {
        for (const field of CID_FIELDS) {
          if (response[field]) {
            return String(response[field]);
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a message type should be broadcast to all instances
   */
  private shouldBroadcast(messageType: ResponseType): boolean {
    return BROADCAST_MESSAGE_TYPES.includes(messageType);
  }

  /**
   * Force route a message to a specific instance
   * Used for P2P message routing where we know the target
   */
  routeToInstance(targetInstanceId: string, message: unknown): void {
    if (targetInstanceId === instanceManager.instanceId) {
      this.processLocalMessage(message);
    } else {
      instanceChannel.forwardToInstance(targetInstanceId, message);
    }
  }

  /**
   * Check if this router is active (leader)
   */
  isRouterActive(): boolean {
    return this.isActive;
  }
}

// Export singleton instance
export const instanceInboundRouter = InstanceInboundRouter.getInstance();

// Also export class for testing
export { InstanceInboundRouter };
