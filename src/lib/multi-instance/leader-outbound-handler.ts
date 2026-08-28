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
import { waitForSocket } from './wait-for-socket';
import { instanceChannel } from './instance-channel';
import type { ProxyResponseData } from './outbound-queue-types';
import {
  handleWorkspaceRequestProxy,
  handleOpenMessengerProxy,
  handleEnsureMessengerProxy,
  handleSendP2PMessageProxy,
} from './leader-proxy-handlers';
import { debugLog } from '@/lib/debug-config';

interface OutboundRequest {
  requestId: string;
  senderInstanceId: string;
  payload: Record<string, unknown>;
}

// Types of messages that should use ILM (reliability layer)
const ILM_REQUIRED_TYPES = [
  'Message', // P2P messages need ILM
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
    eventEmitter.on('channel:outbound-request', async (request: OutboundRequest) => {
      await this.handleOutboundRequest(request);
    });

    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      this.isActive = data.isLeader;

      if (this.isActive) {
        debugLog('LeaderOutboundHandler', '[LeaderOutboundHandler] Activated as leader');
      } else {
        debugLog('LeaderOutboundHandler', '[LeaderOutboundHandler] Deactivated (no longer leader)');
      }
    });
  }

  setWebSocketSendFunction(fn: (message: Record<string, unknown>) => Promise<void>): void {
    this.websocketSendFn = fn;
    debugLog('LeaderOutboundHandler', '[LeaderOutboundHandler] WebSocket send function registered');
  }

  /**
   * Request ids currently being executed on behalf of a follower.
   *
   * The proxy handlers ack only AFTER awaiting the operation, so a retry that
   * arrives mid-flight used to start the work a second time — invisible for
   * chat, which the receiver deduplicates by message id, and a duplicated write
   * for anything proxied to the workspace server. Dropped silently rather than
   * error-acked: the original is still running and acks for both.
   */
  private readonly inFlight = new Set<string>();

  async handleOutboundRequest(request: OutboundRequest): Promise<void> {
    if (this.inFlight.has(request.requestId)) {
      debugLog(
        'LeaderOutboundHandler',
        `Ignoring duplicate delivery of ${request.requestId}; the original is still running`,
      );
      return;
    }

    if (!this.isActive) {
      debugLog('LeaderOutboundHandler', 'Received request but not active (not leader)');
      this.sendAck(request.senderInstanceId, request.requestId, 'error', 'Not leader');
      return;
    }

    if (!this.websocketSendFn) {
      // Waited for briefly rather than failed outright: a just-promoted leader
      // is active before its socket exists, and error-acking there loses a real
      // user operation to a leadership flap. See wait-for-socket.ts.
      const ready = await waitForSocket(() => this.websocketSendFn);
      if (!ready) {
        debugLog('LeaderOutboundHandler', 'WebSocket send function not set');
        this.sendAck(request.senderInstanceId, request.requestId, 'error', 'WebSocket not ready');
        return;
      }
    }

    this.inFlight.add(request.requestId);
    try {
      if (!this.isValidSender(request.senderInstanceId)) {
        debugLog('LeaderOutboundHandler', `Invalid sender: ${request.senderInstanceId}`);
        this.sendAck(request.senderInstanceId, request.requestId, 'error', 'Invalid sender');
        return;
      }

      // Delegate proxy requests to specialized handlers
      if (request.payload?.__workspaceRequestProxy) {
        await handleWorkspaceRequestProxy(request, this.sendAck.bind(this));
        return;
      }
      if (request.payload?.__openMessengerProxy) {
        await handleOpenMessengerProxy(request, this.sendAck.bind(this));
        return;
      }
      if (request.payload?.__ensureMessengerProxy) {
        await handleEnsureMessengerProxy(request, this.sendAck.bind(this));
        return;
      }
      if (request.payload?.__sendP2PMessageProxy) {
        await handleSendP2PMessageProxy(request, this.sendAck.bind(this));
        return;
      }

      const requiresIlm = this.requiresILM(request.payload);
      debugLog('LeaderOutboundHandler',
        `[LeaderOutboundHandler] Processing ${request.requestId} from ${request.senderInstanceId} (ILM: ${requiresIlm})`
      );

      // Re-read after the awaits above: a demotion can clear it, and the
      // narrowing from the readiness check no longer holds here.
      const send = this.websocketSendFn;
      if (!send) {
        this.sendAck(request.senderInstanceId, request.requestId, 'error', 'WebSocket not ready');
        return;
      }

      await send(request.payload);
      this.sendAck(request.senderInstanceId, request.requestId, 'processed');
      debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Sent and ACKed ${request.requestId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLog('LeaderOutboundHandler', `Failed to process ${request.requestId}:`, error);
      this.sendAck(request.senderInstanceId, request.requestId, 'error', errorMessage);
    } finally {
      this.inFlight.delete(request.requestId);
    }
  }

  async sendDirect(payload: Record<string, unknown>): Promise<void> {
    if (!this.websocketSendFn) {
      throw new Error('WebSocket send function not set');
    }

    await this.websocketSendFn(payload);
  }

  private isValidSender(senderInstanceId: string): boolean {
    if (!senderInstanceId || senderInstanceId.trim() === '') {
      return false;
    }
    return true;
  }

  private requiresILM(payload: Record<string, unknown>): boolean {
    const messageType = Object.keys(payload)[0];

    if (!messageType) {
      return false;
    }

    if (ILM_REQUIRED_TYPES.includes(messageType)) {
      return true;
    }

    if (BYPASS_ILM_TYPES.includes(messageType)) {
      return false;
    }

    debugLog('LeaderOutboundHandler', `[LeaderOutboundHandler] Unknown message type "${messageType}", using ILM`);
    return true;
  }

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

  isHandlerActive(): boolean {
    return this.isActive;
  }
}

// Export singleton instance
export const leaderOutboundHandler = LeaderOutboundHandler.getInstance();

// Also export class for testing
export { LeaderOutboundHandler };
