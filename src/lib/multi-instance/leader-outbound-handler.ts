/**
 * Leader Outbound Handler
 *
 * Processes all outbound messages when this instance is the leader.
 * This is the single point of exit for all WebSocket communication.
 *
 * Flow:
 * 1. Receive outbound request from InstanceChannel (from any instance, including self)
 * 2. Validate sender has a valid instance ID
 * 3. Determine if message requires ILM (reliability layer) or can bypass
 * 4. Send to WebSocket
 * 5. Send ACK back to sender
 *
 * The leader processes ALL outbound messages, even its own.
 * This keeps the code path consistent across all instances.
 */

import { eventEmitter } from '../event-emitter';
import { instanceManager } from './instance-manager';
import { instanceChannel } from './instance-channel';
import type { ProxyResponseData } from './outbound-queue';
import { debugLog } from '@/lib/debug-config';

interface OutboundRequest {
  requestId: string;
  senderInstanceId: string;
  payload: Record<string, unknown>;
}

// Types of messages that should use ILM (reliability layer)
const ILM_REQUIRED_TYPES = [
  'Message', // P2P messages need ILM
  // Add other message types that need guaranteed delivery
];

// Types that can bypass ILM
const BYPASS_ILM_TYPES = [
  'GetSessions',
  'LocalDBSetKV',
  'LocalDBGetKV',
  'LocalDBGetAllKV',
  'GetWorkspace',
  'ListWorkspaces',
  'ListMembers',
  'GetMemberInfo',
  'Connect',
  'Register',
  'Disconnect',
  'ConnectionManagement',
  'PeerRegister',
  'PeerConnect',
  'PeerDisconnect',
  'ListAllPeers',
  'ListRegisteredPeers',
  // Most queries and management operations don't need ILM
];

class LeaderOutboundHandler {
  private static instance: LeaderOutboundHandler;

  private isActive: boolean = false;
  private websocketSendFn: ((message: Record<string, unknown>) => Promise<void>) | null = null;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): LeaderOutboundHandler {
    if (!LeaderOutboundHandler.instance) {
      LeaderOutboundHandler.instance = new LeaderOutboundHandler();
    }
    return LeaderOutboundHandler.instance;
  }

  private setupEventListeners(): void {
    // Listen for outbound requests from InstanceChannel
    eventEmitter.on('channel:outbound-request', async (request: OutboundRequest) => {
      await this.handleOutboundRequest(request);
    });

    // Listen for leader status changes
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      this.isActive = data.isLeader;

      if (this.isActive) {
        debugLog('LeaderOutboundHandler', '[LeaderOutboundHandler] Activated as leader');
      } else {
        debugLog('LeaderOutboundHandler', '[LeaderOutboundHandler] Deactivated (no longer leader)');
      }
    });
  }

  /**
   * Set the function to use for sending to WebSocket
   * This is injected by websocket-service during initialization
   */
  setWebSocketSendFunction(fn: (message: Record<string, unknown>) => Promise<void>): void {
    this.websocketSendFn = fn;
    debugLog('LeaderOutboundHandler', '[LeaderOutboundHandler] WebSocket send function registered');
  }

  /**
   * Handle an outbound request from any instance
   */
  async handleOutboundRequest(request: OutboundRequest): Promise<void> {
    if (!this.isActive) {
      console.warn('[LeaderOutboundHandler] Received request but not active (not leader)');
      this.sendAck(request.senderInstanceId, request.requestId, 'error', 'Not leader');
      return;
    }

    if (!this.websocketSendFn) {
      console.error('[LeaderOutboundHandler] WebSocket send function not set');
      this.sendAck(request.senderInstanceId, request.requestId, 'error', 'WebSocket not ready');
      return;
    }

    try {
      // Validate sender
      if (!this.isValidSender(request.senderInstanceId)) {
        console.warn(`[LeaderOutboundHandler] Invalid sender: ${request.senderInstanceId}`);
        this.sendAck(request.senderInstanceId, request.requestId, 'error', 'Invalid sender');
        return;
      }

      // Check for workspace request proxy (special handling for follower workspace requests)
      if (request.payload?.__workspaceRequestProxy) {
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Handling workspace request proxy from ${request.senderInstanceId}`);

        // Import websocket service to call sendWorkspaceRequest on WASM client
        // Note: Lazy import to avoid circular dependency
        const { websocketService } = await import('../websocket-service');
        const client = websocketService.getClient();

        if (!client) {
          console.error('[LeaderOutboundHandler] No WASM client available for workspace request');
          this.sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
          return;
        }

        // Convert CID back to BigInt and send
        const cid = BigInt(request.payload.cid);
        await client.sendWorkspaceRequest(cid, request.payload.request);

        this.sendAck(request.senderInstanceId, request.requestId, 'processed');
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Workspace request proxy processed for ${request.requestId}`);
        return;
      }

      // Check for openMessengerFor proxy
      if (request.payload?.__openMessengerProxy) {
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Handling openMessenger proxy from ${request.senderInstanceId}`);

        const { websocketService } = await import('../websocket-service');
        const client = websocketService.getClient();

        if (!client) {
          console.error('[LeaderOutboundHandler] No WASM client available for openMessenger');
          this.sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
          return;
        }

        await client.openMessengerFor(request.payload.cid);

        this.sendAck(request.senderInstanceId, request.requestId, 'processed');
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] openMessenger proxy processed for ${request.requestId}`);
        return;
      }

      // Check for ensureMessengerOpen proxy
      if (request.payload?.__ensureMessengerProxy) {
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Handling ensureMessenger proxy from ${request.senderInstanceId}`);

        const { websocketService } = await import('../websocket-service');
        const client = websocketService.getClient();

        if (!client) {
          console.error('[LeaderOutboundHandler] No WASM client available for ensureMessenger');
          this.sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
          return;
        }

        const wasOpened = await client.ensureMessengerOpen(request.payload.cid);

        // Send ACK with result data
        this.sendAck(request.senderInstanceId, request.requestId, 'processed', undefined, { wasOpened });
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] ensureMessenger proxy processed for ${request.requestId}`);
        return;
      }

      // Check for sendP2PMessageReliable proxy
      if (request.payload?.__sendP2PMessageProxy) {
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Handling sendP2PMessage proxy from ${request.senderInstanceId}`);

        const { websocketService } = await import('../websocket-service');
        const client = websocketService.getClient();

        if (!client) {
          console.error('[LeaderOutboundHandler] No WASM client available for sendP2PMessage');
          this.sendAck(request.senderInstanceId, request.requestId, 'error', 'No WASM client');
          return;
        }

        // Convert Array back to Uint8Array
        const messageBytes = new Uint8Array(request.payload.message);
        await client.sendP2PMessageReliable(
          request.payload.localCid,
          request.payload.peerCid,
          messageBytes,
          request.payload.securityLevel
        );

        this.sendAck(request.senderInstanceId, request.requestId, 'processed');
        debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] sendP2PMessage proxy processed for ${request.requestId}`);
        return;
      }

      // Determine routing (ILM vs bypass)
      const requiresIlm = this.requiresILM(request.payload);

      debugLog('LeaderOutboundHandler', 
        `[LeaderOutboundHandler] Processing ${request.requestId} from ${request.senderInstanceId} (ILM: ${requiresIlm})`
      );

      // Send to WebSocket
      await this.websocketSendFn(request.payload);

      // Send ACK
      this.sendAck(request.senderInstanceId, request.requestId, 'processed');

      debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Sent and ACKed ${request.requestId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[LeaderOutboundHandler] Failed to process ${request.requestId}:`, error);
      this.sendAck(request.senderInstanceId, request.requestId, 'error', errorMessage);
    }
  }

  /**
   * Send directly (when called from leader itself, bypassing the channel)
   * This is used for internal leader operations
   */
  async sendDirect(payload: Record<string, unknown>): Promise<void> {
    if (!this.websocketSendFn) {
      throw new Error('WebSocket send function not set');
    }

    await this.websocketSendFn(payload);
  }

  /**
   * Check if sender is valid
   * Currently just checks if instanceId is non-empty
   * Could be extended to check against known instances
   */
  private isValidSender(senderInstanceId: string): boolean {
    if (!senderInstanceId || senderInstanceId.trim() === '') {
      return false;
    }

    // Could add more validation:
    // - Check against known instances
    // - Validate sender CID matches their claimed session
    return true;
  }

  /**
   * Determine if a message requires ILM (Internal Layered Messaging)
   */
  private requiresILM(payload: Record<string, unknown>): boolean {
    // Get the message type (first key in the payload)
    const messageType = Object.keys(payload)[0];

    if (!messageType) {
      return false;
    }

    // Check against explicit lists
    if (ILM_REQUIRED_TYPES.includes(messageType)) {
      return true;
    }

    if (BYPASS_ILM_TYPES.includes(messageType)) {
      return false;
    }

    // Default: use ILM for unknown types (safer)
    debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Unknown message type "${messageType}", using ILM`);
    return true;
  }

  /**
   * Send ACK back to sender via InstanceChannel
   */
  private sendAck(
    targetInstanceId: string,
    requestId: string,
    status: 'processed' | 'error',
    error?: string,
    data?: ProxyResponseData
  ): void {
    instanceChannel.sendAck(targetInstanceId, requestId, {
      status,
      error,
      data,
    });
  }

  /**
   * Check if this handler is currently active (leader)
   */
  isHandlerActive(): boolean {
    return this.isActive;
  }
}

// Export singleton instance
export const leaderOutboundHandler = LeaderOutboundHandler.getInstance();

// Also export class for testing
export { LeaderOutboundHandler };
