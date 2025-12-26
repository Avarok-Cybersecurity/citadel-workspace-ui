/**
 * P2P Auto-Connect Service
 *
 * Automatically connects to registered peers with:
 * - Online-aware polling (only attempts connect if peer is online)
 * - Exponential backoff: 1s → 2s → 4s → ... → 5min max, then poll every 5min
 * - Independent connection tasks per peer
 */

import { websocketService } from './websocket-service';
import { p2pRegistrationService } from './p2p-registration-service';
import { connectionManager } from './connection-manager';
import { eventEmitter } from './event-emitter';
import { getSelectedUser } from './tab-context';

interface ConnectionAttempt {
  attempts: number;
  timeout: NodeJS.Timeout | null;
}

export class P2PAutoConnectService {
  private static instance: P2PAutoConnectService;

  // Connection state tracking
  private connectionAttempts = new Map<string, ConnectionAttempt>();
  private onlinePeers = new Set<string>();
  private connectedPeers = new Set<string>();
  private pendingConnections = new Set<string>(); // Peers we've initiated connection to (waiting for PeerConnectSuccess)

  // Periodic polling
  private pollingInterval: NodeJS.Timeout | null = null;

  // Backoff configuration
  private readonly BASE_DELAY = 1000; // 1 second
  private readonly MAX_DELAY = 5 * 60 * 1000; // 5 minutes
  private readonly POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes continuous polling

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): P2PAutoConnectService {
    if (!P2PAutoConnectService.instance) {
      P2PAutoConnectService.instance = new P2PAutoConnectService();
    }
    return P2PAutoConnectService.instance;
  }

  private setupEventListeners(): void {
    // Start polling when P2P registration service starts (after user logs in)
    eventEmitter.on('p2p:registration-service-started', () => {
      this.startPolling();
    });

    // Stop polling when P2P registration service stops (on logout)
    eventEmitter.on('p2p:registration-service-stopped', () => {
      this.stopPolling();
      this.cancelAllRetries();
    });

    // CRITICAL: Immediately connect to newly registered peers (don't wait for 5-min poll)
    // Handle both incoming and outgoing registrations appropriately
    eventEmitter.on('p2p:peer-registered', ({ peer, isIncoming, isOutgoing }: { peer: any; isIncoming?: boolean; isOutgoing?: boolean }) => {
      const peerCid = peer?.cid?.toString();
      if (!peerCid) return;

      // For INCOMING registrations (they registered with us), check if we PREVIOUSLY
      // registered with them (outgoing). If so, mutual registration is complete.
      if (isIncoming) {
        // Use hasOutgoingRegistration to check if WE registered with them BEFORE
        // (not isPeerRegistered which includes incoming registrations too)
        const weRegisteredFirst = p2pRegistrationService.hasOutgoingRegistration(peerCid);
        if (weRegisteredFirst) {
          // We registered with them first, they just registered back
          // Mutual registration is complete - trigger PeerConnect!
          console.log(`P2PAutoConnect: Mutual registration complete with ${peerCid.slice(0, 8)}... (they registered back), initiating immediate connection`);
          this.connectToPeer(peerCid).catch((err) => {
            console.error(`P2PAutoConnect: Failed to connect after mutual registration ${peerCid.slice(0, 8)}...:`, err);
          });
        } else {
          // They registered with us first, we need to accept and register back
          console.log(`P2PAutoConnect: Incoming registration from ${peerCid.slice(0, 8)}..., waiting for user to accept (mutual registration required)`);
        }
        return;
      }

      // For OUTGOING registrations (we registered with them), try to connect immediately
      // This may fail if mutual registration isn't complete yet, but will retry
      console.log(`P2PAutoConnect: Outgoing registration to ${peerCid.slice(0, 8)}... confirmed, initiating immediate connection`);
      this.connectToPeer(peerCid).catch((err) => {
        console.error(`P2PAutoConnect: Failed to connect to newly registered peer ${peerCid.slice(0, 8)}...:`, err);
      });
    });

    // Also trigger connection when WE accept a peer registration
    eventEmitter.on('p2p:registration-accepted', ({ peerCid }: { peerCid: string }) => {
      if (peerCid) {
        console.log(`P2PAutoConnect: Registration accepted for ${peerCid.slice(0, 8)}..., initiating immediate connection`);
        this.connectToPeer(peerCid).catch((err) => {
          console.error(`P2PAutoConnect: Failed to connect to accepted peer ${peerCid.slice(0, 8)}...:`, err);
        });
      }
    });

    // Listen for successful P2P connections
    eventEmitter.on('websocket-message', (message: any) => {
      if (message.PeerConnectSuccess) {
        // CRITICAL: Filter by CID - in multi-tab scenarios all tabs receive broadcast
        // Only process if this message is for OUR session
        const messageCid = message.PeerConnectSuccess.cid?.toString();
        const currentCid = this.getCurrentCid();

        if (messageCid && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, ignore it
          return;
        }

        const peerCid = message.PeerConnectSuccess.peer_cid?.toString();
        if (peerCid && peerCid !== currentCid) {
          // Don't add self to connected peers
          this.handleConnectionSuccess(peerCid);
        }
      }

      // Handle incoming PeerConnect from another peer
      if (message.PeerConnectNotification) {
        this.handleIncomingPeerConnect(message.PeerConnectNotification);
      }

      // Handle peer disconnect
      if (message.PeerDisconnect) {
        // CRITICAL: Filter by CID - in multi-tab scenarios all tabs receive broadcast
        const messageCid = message.PeerDisconnect.cid?.toString();
        const currentCid = this.getCurrentCid();

        if (messageCid && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, ignore it
          return;
        }

        const peerCid = message.PeerDisconnect.peer_cid?.toString();
        if (peerCid) {
          this.handlePeerDisconnect(peerCid);
        }
      }
    });
  }

  /**
   * Refresh online status from internal service
   */
  public async refreshOnlineStatus(): Promise<void> {
    try {
      const peers = await p2pRegistrationService.listAllPeers();
      this.onlinePeers.clear();

      for (const peer of peers) {
        const cid = peer.cid?.toString();
        // Check online_status or is_online field
        const isOnline = peer.online_status ?? peer.is_online ?? false;
        if (cid && isOnline) {
          this.onlinePeers.add(cid);
        }
      }

      console.log(`P2PAutoConnect: Refreshed online status, ${this.onlinePeers.size} peers online`);
    } catch (error: any) {
      // Skip silently if there's no valid user session (expected when not logged in)
      if (error?.message?.includes('CID 0') || error?.message?.includes('No active')) {
        return;
      }
      console.warn('P2PAutoConnect: Failed to refresh online status:', error);
    }
  }

  /**
   * Check if a peer is currently online
   */
  public isPeerOnline(peerCid: string): boolean {
    return this.onlinePeers.has(peerCid);
  }

  /**
   * Check if a peer is currently connected
   */
  public isPeerConnected(peerCid: string): boolean {
    return this.connectedPeers.has(peerCid);
  }

  /**
   * Get current CID from connection manager
   * Priority: 1) Tab context selectedCid (set during session switch), 2) StoredSession.cid, 3) Global connection CID
   */
  private getCurrentCid(): string | null {
    const tabSelection = getSelectedUser();
    const tabSession = connectionManager.getTabSelectedSession();
    const connectionInfo = connectionManager.getConnectionInfo();
    return tabSelection?.selectedCid || tabSession?.cid?.toString() || connectionInfo?.cid?.toString() || null;
  }

  /**
   * Verify if peer is actually connected in backend (not just in local connectedPeers Set)
   * This handles cases where connectedPeers is stale due to failed PeerConnect attempts
   */
  private async isActuallyConnectedInBackend(currentCid: string, peerCid: string): Promise<boolean> {
    try {
      const sessions = await connectionManager.getActiveSessions();
      const mySession = sessions.find(s => s.cid?.toString() === currentCid);
      if (mySession?.peer_connections) {
        // Check if peerCid exists in backend peer_connections
        return Object.keys(mySession.peer_connections).includes(peerCid);
      }
    } catch (error) {
      console.warn('P2PAutoConnect: Failed to verify backend connection state:', error);
    }
    return false;
  }

  /**
   * Connect to a single peer with exponential backoff + online check
   */
  public async connectToPeer(peerCid: string): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      console.warn('P2PAutoConnect: No current CID, cannot connect');
      return;
    }

    // Don't connect to self
    if (peerCid === currentCid) {
      return;
    }

    // CRITICAL: Mark as pending IMMEDIATELY, before any async operations
    // This prevents handleIncomingPeerConnect from calling PeerConnect back during SIMULTANEOUS_CONNECT
    // The race condition: if we receive PeerConnectNotification before adding to pendingConnections,
    // handleIncomingPeerConnect will think we haven't started connecting and call PeerConnect back.
    if (this.pendingConnections.has(peerCid)) {
      console.log(`P2PAutoConnect: Connection to ${peerCid.slice(0, 8)}... already pending, skipping duplicate`);
      return;
    }
    this.pendingConnections.add(peerCid);

    // CRITICAL FIX: Verify local connectedPeers against backend state
    // This handles cases where frontend thinks we're connected but backend doesn't have the channel
    if (this.connectedPeers.has(peerCid)) {
      const actuallyConnected = await this.isActuallyConnectedInBackend(currentCid, peerCid);
      if (actuallyConnected) {
        console.log(`P2PAutoConnect: Already connected to ${peerCid.slice(0, 8)}... (verified with backend), skipping`);
        this.pendingConnections.delete(peerCid);
        return;
      } else {
        console.warn(`P2PAutoConnect: Local connectedPeers has ${peerCid.slice(0, 8)}... but backend shows not connected. Re-establishing connection.`);
        this.connectedPeers.delete(peerCid);
      }
    }

    const attempt = this.connectionAttempts.get(peerCid) || { attempts: 0, timeout: null };

    // Refresh online status before attempting
    await this.refreshOnlineStatus();

    // If peer is offline, skip this attempt and schedule next poll
    if (!this.isPeerOnline(peerCid)) {
      console.log(`P2PAutoConnect: Peer ${peerCid.slice(0, 8)}... offline, scheduling next check in ${this.POLL_INTERVAL / 1000}s`);
      this.pendingConnections.delete(peerCid); // Remove from pending since we're not connecting now
      attempt.timeout = setTimeout(() => this.connectToPeer(peerCid), this.POLL_INTERVAL);
      this.connectionAttempts.set(peerCid, attempt);
      return;
    }

    try {
      // Claim session first to ensure backend processes request in correct context
      console.log(`P2PAutoConnect: Claiming session ${currentCid.slice(0, 8)}... before PeerConnect`);
      await websocketService.claimSession(currentCid);

      console.log(`P2PAutoConnect: Attempting connection to ${peerCid.slice(0, 8)}...`);
      await websocketService.openP2PConnection(currentCid, peerCid);

      // Success - handled in event listener (handleConnectionSuccess will remove from pendingConnections)
    } catch (error) {
      // Remove from pending on failure
      this.pendingConnections.delete(peerCid);

      // Calculate delay: exponential up to MAX_DELAY, then constant POLL_INTERVAL
      const delay = Math.min(this.BASE_DELAY * Math.pow(2, attempt.attempts), this.MAX_DELAY);
      attempt.attempts++;

      // After hitting max delay, continue polling indefinitely at POLL_INTERVAL
      const nextDelay = delay >= this.MAX_DELAY ? this.POLL_INTERVAL : delay;

      attempt.timeout = setTimeout(() => this.connectToPeer(peerCid), nextDelay);
      this.connectionAttempts.set(peerCid, attempt);

      console.warn(
        `P2PAutoConnect: Connect failed for ${peerCid.slice(0, 8)}..., ` +
          `retry in ${nextDelay / 1000}s (attempt ${attempt.attempts})`
      );
    }
  }

  /**
   * Connect to all registered peers (on startup or after accept)
   */
  public async connectToAllRegisteredPeers(): Promise<void> {
    const currentCid = this.getCurrentCid();
    // Skip silently if no valid user session (CID 0 is service connection)
    if (!currentCid || currentCid === '0') {
      return;
    }

    // Refresh online status first
    await this.refreshOnlineStatus();

    let registeredPeers: any[] = [];

    try {
      registeredPeers = await p2pRegistrationService.listRegisteredPeers();
      console.log(`P2PAutoConnect: Found ${registeredPeers.length} registered peers via ListRegisteredPeers`);
    } catch (error: any) {
      // Skip silently if there's no valid user session (expected when not logged in)
      if (error?.message?.includes('CID 0') || error?.message?.includes('No active')) {
        return;
      }
      // If ListRegisteredPeers times out, fall back to GetSessions
      if (error?.message?.includes('timed out') || error?.message?.includes('timeout')) {
        console.log('P2PAutoConnect: ListRegisteredPeers timed out, falling back to GetSessions...');
        registeredPeers = await this.getRegisteredPeersViaGetSessions(currentCid);
        console.log(`P2PAutoConnect: Found ${registeredPeers.length} registered peers via GetSessions fallback`);
      } else {
        console.error('P2PAutoConnect: Failed to list registered peers:', error);
        return;
      }
    }

    // Launch connections in parallel (each handles its own retries)
    for (const peer of registeredPeers) {
      const peerCid = peer.cid?.toString();
      if (peerCid && peerCid !== currentCid) {
        // Don't await - let each run independently
        this.connectToPeer(peerCid).catch((err) => {
          console.error(`P2PAutoConnect: Failed to initiate connection to ${peerCid}:`, err);
        });
      }
    }
  }

  /**
   * Fallback: Get registered peers from GetSessions response
   * This is used when ListRegisteredPeers times out
   */
  private async getRegisteredPeersViaGetSessions(currentCid: string): Promise<any[]> {
    try {
      const sessions = await connectionManager.getActiveSessions();
      const mySession = sessions.find(s => s.cid?.toString() === currentCid);

      if (!mySession?.peer_connections || Object.keys(mySession.peer_connections).length === 0) {
        // No peer connections yet, use local peer registry
        console.log('P2PAutoConnect: No peer_connections in session, using local peer registry...');

        const { registeredPeers } = p2pRegistrationService.getPeers();
        return registeredPeers.map(p => ({
          cid: p.cid,
          username: p.username,
        }));
      }

      // Convert peer_connections to peer array
      const peers: any[] = [];
      for (const [peerCid, peerInfo] of Object.entries(mySession.peer_connections)) {
        peers.push({
          cid: peerCid,
          username: (peerInfo as any).peer_username || '',
        });
      }

      return peers;
    } catch (error) {
      console.error('P2PAutoConnect: GetSessions fallback failed:', error);
      return [];
    }
  }

  /**
   * Handle successful connection
   */
  private handleConnectionSuccess(peerCid: string): void {
    this.connectedPeers.add(peerCid);
    this.pendingConnections.delete(peerCid); // Connection complete, no longer pending
    this.cancelRetry(peerCid);
    console.log(`P2PAutoConnect: Connected to ${peerCid.slice(0, 8)}...`);
    eventEmitter.emit('p2p-connection-established', { peerCid });
  }

  /**
   * Handle incoming PeerConnect request (when other peer initiates)
   *
   * SIMULTANEOUS_CONNECT handling:
   * When both peers call PeerConnect at the same time, the SDK handles it via
   * SIMULTANEOUS_CONNECT. Both connections succeed without needing a "reverse"
   * channel. The PostConnect event (PeerConnectNotification) is sent DURING
   * the connection process, not after.
   *
   * If we have a pending or completed connection to this peer, we should NOT
   * call PeerConnect back - our own connection already establishes the
   * bidirectional channel.
   *
   * We only need to call PeerConnect back if:
   * 1. The OTHER peer initiated and we haven't started connecting yet
   * 2. This creates our side of the bidirectional channel
   *
   * In multi-tab scenarios, notifications are broadcast to all tabs, so we must:
   * 1. Verify the notification.cid matches our current CID (we are the intended recipient)
   * 2. Call ClaimSession before PeerConnect to ensure correct backend session context
   */
  public async handleIncomingPeerConnect(notification: any): Promise<void> {
    const notificationCid = notification.cid?.toString();
    const peerCid = notification.peer_cid?.toString();

    if (!peerCid || !notificationCid) {
      console.warn('P2PAutoConnect: Invalid PeerConnectNotification - missing cid or peer_cid');
      return;
    }

    // CRITICAL: Filter by CID - only process if this notification is for OUR session
    // In multi-tab scenarios, all tabs receive broadcast notifications
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      console.warn('P2PAutoConnect: No current CID, cannot process incoming connection');
      return;
    }

    if (notificationCid !== currentCid) {
      // This notification is for a different user's session (different tab)
      console.log(`P2PAutoConnect: Ignoring PeerConnectNotification for ${notificationCid.slice(0, 8)}... (we are ${currentCid.slice(0, 8)}...)`);
      return;
    }

    // CRITICAL: Check if we're already connected or have a pending connection
    // This handles SIMULTANEOUS_CONNECT: if both peers called PeerConnect,
    // our own connection will establish the bidirectional channel.
    // Calling PeerConnect BACK would create a duplicate that can cause the
    // original channel to close.
    if (this.connectedPeers.has(peerCid)) {
      console.log(`P2PAutoConnect: Already connected to ${peerCid.slice(0, 8)}... (via PeerConnectSuccess), skipping reverse PeerConnect`);
      return;
    }

    if (this.pendingConnections.has(peerCid)) {
      console.log(`P2PAutoConnect: Connection to ${peerCid.slice(0, 8)}... already in progress (SIMULTANEOUS_CONNECT), skipping reverse PeerConnect`);
      // Mark as connected since we know both sides are connecting
      this.connectedPeers.add(peerCid);
      this.cancelRetry(peerCid);
      eventEmitter.emit('p2p-connection-established', { peerCid });
      return;
    }

    // No existing connection - the other peer initiated unilaterally
    // We need to call PeerConnect back to establish our side of the channel
    this.connectedPeers.add(peerCid);
    this.cancelRetry(peerCid);
    console.log(`P2PAutoConnect: Incoming connection from ${peerCid.slice(0, 8)}... (they initiated)`);
    eventEmitter.emit('p2p-connection-established', { peerCid });

    if (currentCid !== peerCid) {
      try {
        // Claim session first to ensure backend processes request in correct context
        console.log(`P2PAutoConnect: Claiming session ${currentCid.slice(0, 8)}... before reverse PeerConnect`);
        await websocketService.claimSession(currentCid);

        console.log(`P2PAutoConnect: Calling PeerConnect back to ${peerCid.slice(0, 8)}... to establish bidirectional channel`);
        await websocketService.openP2PConnection(currentCid, peerCid);
        console.log(`P2PAutoConnect: Reverse channel established to ${peerCid.slice(0, 8)}...`);
      } catch (error) {
        // Already connected is fine - the channel may already exist
        const errMsg = String(error);
        if (errMsg.includes('already connected') || errMsg.includes('Already connected')) {
          console.log(`P2PAutoConnect: Reverse channel already exists for ${peerCid.slice(0, 8)}...`);
        } else {
          console.warn(`P2PAutoConnect: Failed to establish reverse channel to ${peerCid.slice(0, 8)}...:`, error);
        }
      }
    }
  }

  /**
   * Handle peer disconnect - remove from connected set
   */
  public handlePeerDisconnect(peerCid: string): void {
    this.connectedPeers.delete(peerCid);
    this.pendingConnections.delete(peerCid);
    console.log(`P2PAutoConnect: Peer ${peerCid.slice(0, 8)}... disconnected`);
    eventEmitter.emit('p2p-connection-lost', { peerCid });
  }

  /**
   * Cancel pending retry for a peer
   */
  public cancelRetry(peerCid: string): void {
    const attempt = this.connectionAttempts.get(peerCid);
    if (attempt?.timeout) {
      clearTimeout(attempt.timeout);
      this.connectionAttempts.delete(peerCid);
    }
  }

  /**
   * Cancel all pending retries
   */
  public cancelAllRetries(): void {
    for (const [peerCid, attempt] of this.connectionAttempts) {
      if (attempt.timeout) {
        clearTimeout(attempt.timeout);
      }
    }
    this.connectionAttempts.clear();
  }

  /**
   * Trigger an immediate poll to connect to all registered peers.
   * Call this when a relevant event occurs (e.g., new peer registered).
   * This ensures connection logic is centralized - all connections go through
   * the same code path whether triggered by:
   * - Periodic background polling
   * - On-demand events (new registration, app startup, etc.)
   */
  public poll(): void {
    this.connectToAllRegisteredPeers().catch((err) => {
      console.error('P2PAutoConnect: Poll failed:', err);
    });
  }

  /**
   * Start periodic background polling for auto-reconnection.
   * Polls every POLL_INTERVAL (5 minutes) to reconnect to any
   * registered peers that have disconnected.
   */
  public startPolling(): void {
    if (this.pollingInterval) {
      return; // Already polling
    }

    console.log(`P2PAutoConnect: Starting background polling (interval: ${this.POLL_INTERVAL / 1000}s)`);

    // Run immediately on start
    this.poll();

    // Then run periodically
    this.pollingInterval = setInterval(() => {
      this.poll();
    }, this.POLL_INTERVAL);
  }

  /**
   * Stop periodic background polling.
   * Call on logout or when auto-connect is no longer needed.
   */
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('P2PAutoConnect: Stopped background polling');
    }
  }

  /**
   * Get list of connected peer CIDs
   */
  public getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers);
  }

  /**
   * Get list of online peer CIDs
   */
  public getOnlinePeers(): string[] {
    return Array.from(this.onlinePeers);
  }

  /**
   * Ensure peer connection is established in background (non-blocking).
   *
   * This method:
   * 1. Checks if peer is already connected -> returns immediately
   * 2. If peer is online but not connected -> starts PeerConnect in background
   * 3. If peer is offline -> schedules background task to wait and connect when online
   *
   * Returns immediately without blocking. Use `isPeerConnected()` to check status
   * or listen for 'p2p-connection-established' event.
   */
  public ensurePeerConnectedInBackground(peerCid: string): void {
    const currentCid = this.getCurrentCid();
    if (!currentCid || currentCid === peerCid) {
      return;
    }

    // Already connected - nothing to do
    if (this.connectedPeers.has(peerCid)) {
      console.log(`P2PAutoConnect: Peer ${peerCid.slice(0, 8)}... already connected`);
      return;
    }

    // Already attempting connection - don't start another
    if (this.connectionAttempts.has(peerCid)) {
      console.log(`P2PAutoConnect: Connection attempt already in progress for ${peerCid.slice(0, 8)}...`);
      return;
    }

    // Start connection in background (don't await)
    console.log(`P2PAutoConnect: Starting background connection to ${peerCid.slice(0, 8)}...`);
    this.connectToPeer(peerCid).catch((err) => {
      console.error(`P2PAutoConnect: Background connection failed for ${peerCid.slice(0, 8)}...:`, err);
    });
  }

  /**
   * Wait for peer to become connected, with timeout.
   * Returns a Promise that resolves when connected or rejects on timeout.
   *
   * This is useful when you need to wait for a connection before proceeding,
   * but should be used sparingly as it blocks the caller.
   *
   * For non-blocking approach, use `ensurePeerConnectedInBackground()` instead.
   */
  public async waitForPeerConnected(peerCid: string, timeoutMs = 30000): Promise<boolean> {
    // Already connected
    if (this.connectedPeers.has(peerCid)) {
      return true;
    }

    // Start background connection attempt
    this.ensurePeerConnectedInBackground(peerCid);

    // Wait for connection event or timeout
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Check periodically
      const checkInterval = setInterval(() => {
        if (this.connectedPeers.has(peerCid)) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          console.warn(`P2PAutoConnect: Timeout waiting for ${peerCid.slice(0, 8)}... to connect`);
          resolve(false);
        }
      }, 500);

      // Also listen for event
      const handler = ({ peerCid: connectedPeerCid }: { peerCid: string }) => {
        if (connectedPeerCid === peerCid) {
          clearInterval(checkInterval);
          eventEmitter.off('p2p-connection-established', handler);
          resolve(true);
        }
      };
      eventEmitter.on('p2p-connection-established', handler);

      // Clean up event listener on timeout
      setTimeout(() => {
        eventEmitter.off('p2p-connection-established', handler);
      }, timeoutMs + 1000);
    });
  }
}

// Singleton export
export const p2pAutoConnectService = P2PAutoConnectService.getInstance();
