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

import { eventEmitter } from './event-emitter';
import { instanceManager } from './instance-manager';
import { instanceChannel } from './instance-channel';

// Message types that should be broadcast to all instances
const BROADCAST_MESSAGE_TYPES = [
  'ServerResponse', // Generic server responses
  'DisconnectNotification', // Session disconnected
  'DeregisterSuccess', // Account deleted
  // Add other types that all instances should see
];

// Fields that commonly contain the target CID
const CID_FIELDS = ['cid', 'peer_cid', 'session_cid'];

class InstanceInboundRouter {
  private static instance: InstanceInboundRouter;

  private isActive: boolean = false;

  private constructor() {
    this.setupEventListeners();
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
        console.log('[InstanceInboundRouter] Activated as leader');
      } else {
        console.log('[InstanceInboundRouter] Deactivated (no longer leader)');
      }
    });

    // Listen for forwarded messages (when we're a follower)
    eventEmitter.on('channel:inbound-message', (data: { payload: any; senderInstanceId: string }) => {
      // Process the forwarded message
      this.processLocalMessage(data.payload);
    });
  }

  /**
   * Route an incoming WebSocket message to the appropriate instance(s)
   * Called by websocket-service when leader receives a message
   */
  routeMessage(message: any): void {
    if (!this.isActive) {
      // We're not the leader - this shouldn't happen
      console.warn('[InstanceInboundRouter] routeMessage called but not leader');
      return;
    }

    const messageType = this.getMessageType(message);
    const targetCid = this.extractTargetCid(message);

    console.log(`[InstanceInboundRouter] Routing ${messageType} (CID: ${targetCid || 'none'})`);

    // Check if this is a broadcast message
    if (this.shouldBroadcast(messageType)) {
      this.broadcastToAll(message);
      return;
    }

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
        }
      } else {
        // No instance owns this CID - might be orphaned
        console.warn(`[InstanceInboundRouter] No instance owns CID ${targetCid}, message may be lost`);

        // Still process locally in case it's relevant
        // (e.g., session status updates that leader should know about)
        this.processLocalMessage(message);
      }
    } else {
      // No CID in message - process locally (leader handles generic messages)
      this.processLocalMessage(message);
    }
  }

  /**
   * Broadcast a message to all instances
   */
  private broadcastToAll(message: any): void {
    // Send to followers
    instanceChannel.broadcast(message);

    // Process locally (leader is also an instance)
    this.processLocalMessage(message);
  }

  /**
   * Process a message locally (emit to event system)
   */
  private processLocalMessage(message: any): void {
    // Emit to the existing event system for components to handle
    eventEmitter.emit('websocket-message', message);
  }

  /**
   * Get the type of the message (first key)
   */
  private getMessageType(message: any): string {
    if (!message || typeof message !== 'object') {
      return 'unknown';
    }

    const keys = Object.keys(message);
    return keys[0] || 'unknown';
  }

  /**
   * Extract the target CID from a message
   * Messages can have CID in various places depending on type
   */
  private extractTargetCid(message: any): string | null {
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
    const payload = message[messageType];

    if (payload && typeof payload === 'object') {
      for (const field of CID_FIELDS) {
        if (payload[field]) {
          return String(payload[field]);
        }
      }

      // Check for Response wrapper
      if (payload.Response) {
        for (const field of CID_FIELDS) {
          if (payload.Response[field]) {
            return String(payload.Response[field]);
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a message type should be broadcast to all instances
   */
  private shouldBroadcast(messageType: string): boolean {
    return BROADCAST_MESSAGE_TYPES.includes(messageType);
  }

  /**
   * Force route a message to a specific instance
   * Used for P2P message routing where we know the target
   */
  routeToInstance(targetInstanceId: string, message: any): void {
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
