import { eventEmitter } from './event-emitter';
import { getSelectedUser } from './tab-context';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';

export interface BroadcastMessage {
  type: 'workspace-response' | 'leader-election' | 'state-sync' | 'connection-status' | 'register-request' | 'p2p-raw-message';
  data: any;
  timestamp: number;
  tabId: string;
  isLeader?: boolean;
}

interface PendingRequest {
  cid: string;
  insertTime: number;
}

interface LeaderElectionMessage {
  tabId: string;
  timestamp: number;
  priority: number;
}

/**
 * BroadcastChannelService handles cross-tab communication for workspace state synchronization
 * Uses the BroadcastChannel API to share WebSocket messages and coordinate leader election
 */
export class BroadcastChannelService {
  private static instance: BroadcastChannelService;
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private isLeader: boolean = false;
  private leaderCheckInterval: number | null = null;
  private lastLeaderHeartbeat: number = 0;
  private readonly CHANNEL_NAME = 'citadel-workspace-sync';
  private readonly HEARTBEAT_INTERVAL = 2000; // 2 seconds
  private readonly LEADER_TIMEOUT = 5000; // 5 seconds
  private readonly REQUEST_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  // Map of request_id → { cid, insertTime } for response routing
  private pendingRequests = new Map<string, PendingRequest>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.tabId = this.generateTabId();
    this.initialize();
  }

  public static getInstance(): BroadcastChannelService {
    if (!BroadcastChannelService.instance) {
      BroadcastChannelService.instance = new BroadcastChannelService();
    }
    return BroadcastChannelService.instance;
  }

  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initialize(): void {
    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('BroadcastChannel API not supported in this browser');
      return;
    }

    try {
      this.channel = new BroadcastChannel(this.CHANNEL_NAME);
      this.setupMessageHandler();
      this.startLeaderElection();
      this.startCleanupInterval();
      console.log(`BroadcastChannelService: Initialized with tabId ${this.tabId}`);
    } catch (error) {
      console.error('BroadcastChannelService: Failed to initialize', error);
    }
  }

  /**
   * Start periodic cleanup of expired pending requests (older than 30 minutes)
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [requestId, entry] of this.pendingRequests) {
        if (now - entry.insertTime > this.REQUEST_EXPIRY_MS) {
          this.pendingRequests.delete(requestId);
          console.log(`BroadcastChannelService: Cleaned up expired request ${requestId}`);
        }
      }
    }, 60000); // Check every minute
  }

  private setupMessageHandler(): void {
    if (!this.channel) return;

    this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;
      
      // Ignore our own messages
      if (message.tabId === this.tabId) return;

      console.log(`BroadcastChannelService: Received message from ${message.tabId}:`, message.type);

      switch (message.type) {
        case 'workspace-response':
          this.handleWorkspaceResponse(message);
          break;
        case 'leader-election':
          this.handleLeaderElection(message);
          break;
        case 'state-sync':
          this.handleStateSync(message);
          break;
        case 'connection-status':
          this.handleConnectionStatus(message);
          break;
        case 'register-request':
          this.handleRegisterRequest(message);
          break;
        case 'p2p-raw-message':
          this.handleP2PRawMessage(message);
          break;
      }
    };

    this.channel.onerror = (error) => {
      console.error('BroadcastChannelService: Channel error', error);
    };
  }

  private handleWorkspaceResponse(message: BroadcastMessage): void {
    // Forward workspace responses to the event emitter for non-leader tabs
    if (!this.isLeader && message.data) {
      // Extract request_id from various response types
      const requestId = message.data.request_id ||
                        message.data.ListAllPeersResponse?.request_id ||
                        message.data.ListRegisteredPeersResponse?.request_id ||
                        message.data.GetSessionsResponse?.request_id ||
                        message.data.LocalDBGetKVSuccess?.request_id ||
                        message.data.LocalDBSetKVSuccess?.request_id;

      // Get this tab's current CID
      const tabSelection = getSelectedUser();
      const tabCid = tabSelection?.selectedCid;

      // Forward if:
      // 1. No request_id (broadcast to all) OR
      // 2. Response CID matches this tab's CID
      if (!requestId || (tabCid && this.isResponseForThisCid(requestId, tabCid))) {
        console.log('BroadcastChannelService: Forwarding workspace response to event system');
        eventEmitter.emit('websocket-message', message.data);
        eventEmitter.emit('broadcast-workspace-response', message.data);
        // Don't clear immediately - other tabs with same CID may also need it
      }
    }
  }

  private handleRegisterRequest(message: BroadcastMessage): void {
    // All tabs track which CID owns which request (including leader)
    if (message.data && message.data.requestId && message.data.cid) {
      this.pendingRequests.set(message.data.requestId, {
        cid: message.data.cid,
        insertTime: Date.now()
      });
    }
  }

  private handleLeaderElection(message: BroadcastMessage): void {
    const electionData = message.data as LeaderElectionMessage;
    
    if (message.isLeader) {
      // Another tab is claiming leadership
      this.lastLeaderHeartbeat = Date.now();
      
      if (this.isLeader && electionData.tabId !== this.tabId) {
        // We're no longer the leader
        console.log(`BroadcastChannelService: Tab ${electionData.tabId} is now the leader`);
        this.isLeader = false;
        eventEmitter.emit('leader-changed', { isLeader: false, leaderId: electionData.tabId });
      }
    }
  }

  private handleStateSync(message: BroadcastMessage): void {
    // Forward state sync messages to interested components
    eventEmitter.emit('broadcast-state-sync', message.data);
  }

  private handleConnectionStatus(message: BroadcastMessage): void {
    // Forward connection status updates
    eventEmitter.emit('broadcast-connection-status', message.data);
  }

  private handleP2PRawMessage(message: BroadcastMessage): void {
    // Forward P2P raw messages to non-leader tabs for Yjs sync
    // Leader already handled the message when it was received via WebSocket
    if (!this.isLeader && message.data) {
      console.log('BroadcastChannelService: Forwarding P2P raw message to event system');
      eventEmitter.emit('p2p:raw-message', message.data);
    }
  }

  private startLeaderElection(): void {
    // Announce ourselves
    this.broadcastLeaderClaim();

    // Start heartbeat if we think we're the leader
    this.leaderCheckInterval = window.setInterval(() => {
      const now = Date.now();

      if (this.isLeader) {
        // Only send heartbeat if tab is visible (reduce unnecessary broadcasts)
        if (typeof document === 'undefined' || !document.hidden) {
          this.broadcastLeaderClaim();
        }
      } else {
        // Check if the current leader is still alive
        if (now - this.lastLeaderHeartbeat > this.LEADER_TIMEOUT) {
          console.log('BroadcastChannelService: Leader timeout, claiming leadership');
          this.becomeLeader();
        }
      }
    }, this.HEARTBEAT_INTERVAL);

    // Initially try to become leader after a short delay
    setTimeout(() => {
      if (!this.lastLeaderHeartbeat) {
        console.log('BroadcastChannelService: No leader detected, claiming leadership');
        this.becomeLeader();
      }
    }, 500);
  }

  private broadcastLeaderClaim(): void {
    const message: BroadcastMessage = {
      type: 'leader-election',
      data: {
        tabId: this.tabId,
        timestamp: Date.now(),
        priority: this.isLeader ? 100 : 0
      },
      timestamp: Date.now(),
      tabId: this.tabId,
      isLeader: this.isLeader
    };

    this.broadcast(message);
  }

  private becomeLeader(): void {
    this.isLeader = true;
    this.lastLeaderHeartbeat = Date.now();
    console.log(`BroadcastChannelService: Tab ${this.tabId} is now the leader`);
    
    // Notify components that we're now the leader
    eventEmitter.emit('leader-changed', { isLeader: true, leaderId: this.tabId });
    
    // Broadcast our leadership claim
    this.broadcastLeaderClaim();
  }

  /**
   * Broadcast a workspace response to all tabs
   * Only the leader should call this method
   */
  public broadcastWorkspaceResponse(response: InternalServiceResponse): void {
    if (!this.isLeader) {
      console.warn('BroadcastChannelService: Only the leader can broadcast workspace responses');
      return;
    }
    // Debug: log what type of response is being broadcast
    const responseType = Object.keys(response)[0];
    console.log(`BroadcastChannelService: Broadcasting ${responseType} as workspace-response`);

    const message: BroadcastMessage = {
      type: 'workspace-response',
      data: response,
      timestamp: Date.now(),
      tabId: this.tabId,
      isLeader: true
    };

    this.broadcast(message);
  }

  /**
   * Broadcast state synchronization data
   */
  public broadcastStateSync(data: any): void {
    const message: BroadcastMessage = {
      type: 'state-sync',
      data,
      timestamp: Date.now(),
      tabId: this.tabId,
      isLeader: this.isLeader
    };

    this.broadcast(message);
  }

  /**
   * Broadcast connection status updates
   */
  public broadcastConnectionStatus(status: { isConnected: boolean; cid?: string }): void {
    const message: BroadcastMessage = {
      type: 'connection-status',
      data: status,
      timestamp: Date.now(),
      tabId: this.tabId,
      isLeader: this.isLeader
    };

    this.broadcast(message);
  }

  /**
   * Broadcast P2P raw message to all tabs for Yjs sync
   * Leader should call this when receiving P2P messages via WebSocket
   */
  public broadcastP2PRawMessage(data: { peerCid: string; message: string }): void {
    // Only leader broadcasts P2P messages to followers
    if (!this.isLeader) return;

    const message: BroadcastMessage = {
      type: 'p2p-raw-message',
      data,
      timestamp: Date.now(),
      tabId: this.tabId,
      isLeader: true
    };

    this.broadcast(message);
  }

  private broadcast(message: BroadcastMessage): void {
    if (!this.channel) return;

    try {
      this.channel.postMessage(message);
    } catch (error) {
      console.error('BroadcastChannelService: Failed to broadcast message', error);
    }
  }

  /**
   * Check if this tab is the leader
   */
  public getIsLeader(): boolean {
    return this.isLeader;
  }

  /**
   * Get the current tab ID
   */
  public getTabId(): string {
    return this.tabId;
  }

  /**
   * Register a request as belonging to a CID for response routing.
   * This enables follower tabs to receive responses to their requests.
   * @param requestId - The unique request ID
   * @param cid - The CID that made the request
   */
  public registerRequest(requestId: string, cid: string): void {
    this.pendingRequests.set(requestId, { cid, insertTime: Date.now() });
    // Broadcast to all tabs so they know which CID made the request
    this.broadcast({
      type: 'register-request',
      data: { requestId, cid },
      timestamp: Date.now(),
      tabId: this.tabId
    });
  }

  /**
   * Check if a response belongs to a specific CID
   * @param requestId - The request ID from the response
   * @param tabCid - The CID of the current tab
   * @returns true if the response is for this CID
   */
  public isResponseForThisCid(requestId: string, tabCid: string): boolean {
    const entry = this.pendingRequests.get(requestId);
    return entry?.cid === tabCid;
  }

  /**
   * Clean up a request after it has been handled
   * @param requestId - The request ID to clear
   */
  public clearRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.leaderCheckInterval) {
      clearInterval(this.leaderCheckInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    console.log(`BroadcastChannelService: Destroyed for tab ${this.tabId}`);
  }
}

// Export singleton instance
export const broadcastChannelService = BroadcastChannelService.getInstance();