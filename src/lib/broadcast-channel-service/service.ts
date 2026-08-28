/**
 * Broadcast Channel Service - Service Class
 *
 * Singleton cross-tab communication service using BroadcastChannel API.
 * Coordinates leader election, request routing, and message forwarding.
 */

import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import type { P2PNotificationData } from '@/types/ws-message-types';
import { eventEmitter } from '@/lib/event-emitter';
import { PollingService } from '@/lib/utils/polling-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import type { BroadcastMessage, PendingRequest } from './types';
import { CHANNEL_NAME, CLEANUP_INTERVAL_MS, REQUEST_EXPIRY_MS } from './types';
import {
  handleWorkspaceResponse,
  handleRegisterRequest,
  handleStateSync,
  handleConnectionStatus,
  handleP2PRawMessage,
  handleP2PNotification,
} from './message-handlers';
import {
  broadcast as doBroadcast,
  broadcastWorkspaceResponse as doBroadcastWorkspaceResponse,
  broadcastStateSync as doBroadcastStateSync,
  broadcastConnectionStatus as doBroadcastConnectionStatus,
  broadcastP2PRawMessage as doBroadcastP2PRawMessage,
  broadcastP2PNotification as doBroadcastP2PNotification,
} from './broadcasting';

export class BroadcastChannelService extends PollingService {
  private static instance: BroadcastChannelService;
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private isLeader: boolean = false;
  private lastLeaderHeartbeat: number = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  private constructor() {
    super();
    this.tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.initialize();
    this.setupLeaderSync();
  }

  protected getPollingIntervalMs(): number {
    return CLEANUP_INTERVAL_MS;
  }

  protected async poll(): Promise<void> {
    const now = Date.now();
    for (const [requestId, entry] of this.pendingRequests) {
      if (now - entry.insertTime > REQUEST_EXPIRY_MS) {
        this.pendingRequests.delete(requestId);
        debugLog('BroadcastChannelService', `Cleaned up expired request ${requestId}`);
      }
    }
  }

  private setupLeaderSync(): void {
    eventEmitter.on('leader-changed', ({ isLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
      debugLog('BroadcastChannelService', `Syncing leader state from instance-channel - isLeader: ${isLeader}, leaderId: ${leaderId}`);
      this.isLeader = isLeader;
      this.lastLeaderHeartbeat = Date.now();
    });
  }

  public static getInstance(): BroadcastChannelService {
    if (!BroadcastChannelService.instance) {
      BroadcastChannelService.instance = new BroadcastChannelService();
    }
    return BroadcastChannelService.instance;
  }

  private initialize(): void {
    if (typeof BroadcastChannel === 'undefined') {
      debugLog('BroadcastChannelService', 'BroadcastChannel API not supported in this browser');
      return;
    }

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.setupMessageHandler();
      this.startPolling();
      debugLog('BroadcastChannelService', `Initialized with tabId ${this.tabId}`);
    } catch (error) {
      debugLog('BroadcastChannelService', 'Failed to initialize', error);
    }
  }

  private setupMessageHandler(): void {
    if (!this.channel) return;

    this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;
      if (message.tabId === this.tabId) return;

      debugLog('BroadcastChannelService', `Received message from ${message.tabId}:`, message.type);

      runAsyncSetup(async () => {
        switch (message.type) {
          case 'workspace-response':
            await handleWorkspaceResponse(message, this.isLeader, (rid, cid) => this.isResponseForThisCid(rid, cid));
            break;
          case 'state-sync':
            handleStateSync(message);
            break;
          case 'connection-status':
            handleConnectionStatus(message);
            break;
          case 'register-request':
            handleRegisterRequest(message, this.pendingRequests);
            break;
          case 'p2p-raw-message':
            handleP2PRawMessage(message, this.isLeader);
            break;
          case 'p2p-notification':
            await handleP2PNotification(message, this.isLeader);
            break;
        }
      });
    };

    this.channel.addEventListener('messageerror', (event: MessageEvent) => {
      debugLog('BroadcastChannelService', 'Channel error', event);
    });
  }

  // There is no election here, and nothing that looks like one.
  //
  // Leadership is decided by InstanceChannel on the `citadel-instance-channel`
  // channel, and this service learns the outcome through the `leader-changed`
  // sync below. What used to sit here was a complete SECOND apparatus —
  // becomeLeader(), broadcastLeaderClaim(), a handleLeaderElection arm, a
  // leaderCheckInterval — none of it reachable: becomeLeader had no caller
  // anywhere, and the claim messages its handler answered were sent by nobody.
  //
  // Dead code that looks load-bearing is worse than dead code that looks dead.
  // None of the sticky-leadership fixes exist in this copy, so reviving it —
  // which it invited, by being complete and plausibly named — would have
  // reinstated the HMR/StrictMode bug documented in channel-leader-election.ts:
  // a remount hands the WebSocket to the newer tab, the workspace redirects to
  // /connect, and every cross-tab message is dropped.

  // --- Public API ---

  public broadcastWorkspaceResponse(response: InternalServiceResponse): void {
    doBroadcastWorkspaceResponse(this.channel, this.tabId, this.isLeader, response);
  }

  public broadcastStateSync(data: unknown): void {
    doBroadcastStateSync(this.channel, this.tabId, this.isLeader, data);
  }

  public broadcastConnectionStatus(status: { isConnected: boolean; cid?: bigint }): void {
    doBroadcastConnectionStatus(this.channel, this.tabId, this.isLeader, status);
  }

  public broadcastP2PRawMessage(data: { peerCid: bigint; message: Uint8Array }): void {
    doBroadcastP2PRawMessage(this.channel, this.tabId, this.isLeader, data);
  }

  public broadcastP2PNotification(data: { notification: P2PNotificationData; messageBytes: Uint8Array }): void {
    doBroadcastP2PNotification(this.channel, this.tabId, this.isLeader, data);
  }

  public getIsLeader(): boolean {
    return this.isLeader;
  }

  public getTabId(): string {
    return this.tabId;
  }

  public registerRequest(requestId: string, cid: bigint): void {
    this.pendingRequests.set(requestId, { cid, insertTime: Date.now() });
    doBroadcast(this.channel, {
      type: 'register-request',
      data: { requestId, cid },
      timestamp: Date.now(),
      tabId: this.tabId
    });
  }

  public isResponseForThisCid(requestId: string, tabCid: bigint): boolean {
    const entry = this.pendingRequests.get(requestId);
    return entry?.cid === tabCid;
  }

  public clearRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }

  public destroy(): void {
    this.stopPolling();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    debugLog('BroadcastChannelService', `Destroyed for tab ${this.tabId}`);
  }
}
