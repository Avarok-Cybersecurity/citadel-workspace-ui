import { eventEmitter } from './event-emitter';
import { getSelectedUser } from './tab-context';
import { instanceManager } from './multi-instance';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { PollingService } from './utils/polling-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export interface BroadcastMessage {
  type: 'workspace-response' | 'leader-election' | 'state-sync' | 'connection-status' | 'register-request' | 'p2p-raw-message' | 'p2p-notification';
  data: any;
  timestamp: number;
  tabId: string;
  isLeader?: boolean;
  /** Target CID for P2P notifications - used to filter broadcasts by session */
  targetCid?: bigint;
}

interface PendingRequest {
  cid: bigint;
  insertTime: number;
}

interface LeaderElectionMessage {
  tabId: string;
  timestamp: number;
  priority: number;
}

const CHANNEL_NAME = 'citadel-workspace-sync';
const REQUEST_EXPIRY_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60000;

/**
 * BroadcastChannelService handles cross-tab communication for workspace state synchronization
 * Uses the BroadcastChannel API to share WebSocket messages and coordinate leader election
 */
export class BroadcastChannelService extends PollingService {
  private static instance: BroadcastChannelService;
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private isLeader: boolean = false;
  private leaderCheckInterval: number | null = null;
  private lastLeaderHeartbeat: number = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  private constructor() {
    super();
    this.tabId = this.generateTabId();
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
        debugLog('BroadcastChannelService', `BroadcastChannelService: Cleaned up expired request ${requestId}`);
      }
    }
  }

  /**
   * Sync leader state from instance-channel (which is the source of truth for leader election)
   */
  private setupLeaderSync(): void {
    // Listen to leader-changed events from instance-channel
    eventEmitter.on('leader-changed', ({ isLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
      debugLog('BroadcastChannelService', `BroadcastChannelService: Syncing leader state from instance-channel - isLeader: ${isLeader}, leaderId: ${leaderId}`);
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

  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initialize(): void {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('BroadcastChannel API not supported in this browser');
      return;
    }

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.setupMessageHandler();
      this.startLeaderElection();
      this.startPolling();
      debugLog('BroadcastChannelService', `BroadcastChannelService: Initialized with tabId ${this.tabId}`);
    } catch (error) {
      console.error('BroadcastChannelService: Failed to initialize', error);
    }
  }

  private setupMessageHandler(): void {
    if (!this.channel) return;

    this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;
      
      // Ignore our own messages
      if (message.tabId === this.tabId) return;

      debugLog('BroadcastChannelService', `BroadcastChannelService: Received message from ${message.tabId}:`, message.type);

      runAsyncSetup(async () => {
        switch (message.type) {
          case 'workspace-response':
            await this.handleWorkspaceResponse(message);
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
          case 'p2p-notification':
            await this.handleP2PNotification(message);
            break;
        }
      });
    };

    this.channel.addEventListener('messageerror', (event: MessageEvent) => {
      console.error('BroadcastChannelService: Channel error', event);
    });
  }

  private async handleWorkspaceResponse(message: BroadcastMessage): Promise<void> {
    // Forward workspace responses to the event emitter for non-leader tabs
    if (!this.isLeader && message.data) {
      // Get this tab's current CID
      const tabSelection = await getSelectedUser();
      const tabCid = tabSelection?.selectedCid;

      // CRITICAL: Filter by target CID if present (for P2P notifications)
      // This prevents race conditions where multiple tabs process the same notification
      if (message.targetCid && tabCid && message.targetCid !== tabCid) {
        debugLog('BroadcastChannelService', `BroadcastChannelService: Skipping notification for CID ${message.targetCid.toString().slice(0, 8)}... (we are ${tabCid.toString().slice(0, 8)}...)`);
        return;
      }

      // Extract request_id from various response types
      const requestId = message.data.request_id ||
                        message.data.ListAllPeersResponse?.request_id ||
                        message.data.ListRegisteredPeersResponse?.request_id ||
                        message.data.GetSessionsResponse?.request_id ||
                        message.data.LocalDBGetKVSuccess?.request_id ||
                        message.data.LocalDBSetKVSuccess?.request_id;

      // Forward if:
      // 1. No request_id (broadcast to all) OR
      // 2. Response CID matches this tab's CID
      if (!requestId || (tabCid && this.isResponseForThisCid(requestId, tabCid))) {
        debugLog('BroadcastChannelService', 'BroadcastChannelService: Forwarding workspace response to event system');
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
        debugLog('BroadcastChannelService', `BroadcastChannelService: Tab ${electionData.tabId} is now the leader`);
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
      debugLog('BroadcastChannelService', 'BroadcastChannelService: Forwarding P2P raw message to event system');
      eventEmitter.emit('p2p:raw-message', message.data);
    }
  }

  private async handleP2PNotification(message: BroadcastMessage): Promise<void> {
    // Forward P2P MessageNotifications to the correct follower tab for chat processing
    // The leader broadcasts these when it receives a message meant for a different session
    debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification received:', {
      isLeader: this.isLeader,
      hasData: !!message.data,
      fromTabId: message.tabId
    });

    if (!this.isLeader && message.data) {
      const { notification, messageBytes } = message.data;
      if (!notification) {
        debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification: No notification in data');
        return;
      }

      // Check if this notification is for THIS tab's session
      const tabSelection = await getSelectedUser();
      // CRITICAL FIX: Fallback to instanceManager.cid if tab selection is stale after ClaimSession
      // After reconnection, IndexedDB may not be updated yet, but instanceManager tracks the active CID
      const tabCid = tabSelection?.selectedCid ?? instanceManager.cid;
      const notificationCid = notification.cid?.toString();
      const peerCid = notification.peer_cid?.toString();

      // CRITICAL FIX: Convert tabCid (bigint) to string for comparison
      // Without this, the comparison "string === bigint" always returns false
      // because JavaScript strict equality doesn't coerce types
      const tabCidStr = tabCid?.toString();

      debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification checking session match:', {
        notificationCid,
        peerCid,
        tabCidStr,
        hasMessageBytes: !!messageBytes,
        messageLength: notification.message?.length || 0,
        isMatch: tabCidStr && notificationCid === tabCidStr
      });

      if (tabCidStr && notificationCid === tabCidStr) {
        debugLog('BroadcastChannelService', '[BroadcastChannel] Forwarding P2P notification for our session', {
          notificationCid,
          tabCidStr,
          peerCid
        });
        // Emit as websocket-message so handleWebSocketMessage processes it
        eventEmitter.emit('websocket-message', { MessageNotification: notification });
      } else {
        debugLog('BroadcastChannelService', '[BroadcastChannel] P2P notification NOT for our session, ignoring', {
          notificationCid,
          tabCidStr,
          reason: !tabCidStr ? 'no tabCid selected' : 'CID mismatch'
        });
      }
    } else if (this.isLeader) {
      debugLog('BroadcastChannelService', '[BroadcastChannel] handleP2PNotification: Ignoring (we are leader)');
    }
  }

  private startLeaderElection(): void {
    // DISABLED: BroadcastChannelService no longer does its own leader election.
    // InstanceChannel is the sole source of truth for leadership.
    // This service follows InstanceChannel's decisions via setupLeaderSync().
    //
    // This eliminates the dual leader election race condition where both services
    // would independently claim leadership with different timing, causing flip-flopping.
    debugLog('BroadcastChannelService', 'BroadcastChannelService: Leader election delegated to InstanceChannel');
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
    debugLog('BroadcastChannelService', `BroadcastChannelService: Tab ${this.tabId} is now the leader`);
    
    // Notify components that we're now the leader
    eventEmitter.emit('leader-changed', { isLeader: true, leaderId: this.tabId });
    
    // Broadcast our leadership claim
    this.broadcastLeaderClaim();
  }

  /**
   * Broadcast a workspace response to all tabs
   * Only the leader should call this method
   *
   * For P2P notifications (PeerConnectNotification, PeerRegisterNotification),
   * extracts the target CID to enable filtering at the receiver side.
   * This prevents race conditions where multiple tabs process the same notification.
   */
  public broadcastWorkspaceResponse(response: InternalServiceResponse): void {
    if (!this.isLeader) {
      console.warn('BroadcastChannelService: Only the leader can broadcast workspace responses');
      return;
    }
    // Debug: log what type of response is being broadcast
    const responseType = Object.keys(response)[0];
    debugLog('BroadcastChannelService', `BroadcastChannelService: Broadcasting ${responseType} as workspace-response`);

    // Extract target CID for P2P notifications to enable filtering
    // The 'cid' field in these notifications is the TARGET (who should receive it)
    // CRITICAL: Must include MessageNotification to prevent duplicate delivery!
    // Without this, MessageNotification is delivered TWICE to follower tabs:
    // 1. Via InstanceChannel routing (correct path)
    // 2. Via this legacy broadcast (without CID filtering → ALL tabs receive it)
    const responseRecord = response as Record<string, Record<string, unknown>>;
    const targetCid: bigint | undefined =
      (responseRecord.PeerConnectNotification?.cid as bigint | undefined) ||
      (responseRecord.PeerRegisterNotification?.cid as bigint | undefined) ||
      (responseRecord.MessageNotification?.cid as bigint | undefined);

    if (targetCid !== undefined) {
      debugLog('BroadcastChannelService', `BroadcastChannelService: P2P notification has targetCid=${targetCid.toString().slice(0, 8)}...`);
    }

    const message: BroadcastMessage = {
      type: 'workspace-response',
      data: response,
      targetCid,  // Include target CID for filtering at receiver
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
  public broadcastConnectionStatus(status: { isConnected: boolean; cid?: bigint }): void {
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
   * BroadcastChannel uses structured clone which supports Uint8Array directly
   */
  public broadcastP2PRawMessage(data: { peerCid: bigint; message: Uint8Array }): void {
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

  /**
   * Broadcast a P2P MessageNotification to follower tabs for chat processing.
   * Called when leader receives a message meant for a different session.
   * BroadcastChannel uses structured clone which supports Uint8Array directly.
   */
  public broadcastP2PNotification(data: { notification: any; messageBytes: Uint8Array }): void {
    // Only leader broadcasts P2P notifications to followers
    if (!this.isLeader) {
      debugLog('BroadcastChannelService', '[BroadcastChannel] broadcastP2PNotification: Not leader, skipping');
      return;
    }

    const notificationCid = data.notification?.cid?.toString();
    const peerCid = data.notification?.peer_cid?.toString();

    debugLog('BroadcastChannelService', '[BroadcastChannel] Broadcasting P2P notification to followers:', {
      notificationCid: notificationCid?.slice(0, 12),
      peerCid: peerCid?.slice(0, 12),
      messageLength: data.notification?.message?.length || 0,
      hasMessageBytes: !!data.messageBytes,
      tabId: this.tabId
    });

    const message: BroadcastMessage = {
      type: 'p2p-notification',
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
  public registerRequest(requestId: string, cid: bigint): void {
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
  public isResponseForThisCid(requestId: string, tabCid: bigint): boolean {
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

    this.stopPolling();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    debugLog('BroadcastChannelService', `BroadcastChannelService: Destroyed for tab ${this.tabId}`);
  }
}

// Export singleton instance
export const broadcastChannelService = BroadcastChannelService.getInstance();