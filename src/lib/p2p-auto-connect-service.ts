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

    // Listen for successful P2P connections
    eventEmitter.on('websocket-message', (message: any) => {
      if (message.PeerConnectSuccess) {
        const peerCid = message.PeerConnectSuccess.peer_cid?.toString();
        if (peerCid) {
          this.handleConnectionSuccess(peerCid);
        }
      }

      // Handle incoming PeerConnect from another peer
      if (message.PeerConnectNotification) {
        this.handleIncomingPeerConnect(message.PeerConnectNotification);
      }

      // Handle peer disconnect
      if (message.PeerDisconnect) {
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
   * Connect to a single peer with exponential backoff + online check
   */
  public async connectToPeer(peerCid: string): Promise<void> {
    // Already connected? Skip
    if (this.connectedPeers.has(peerCid)) {
      console.log(`P2PAutoConnect: Already connected to ${peerCid}, skipping`);
      return;
    }

    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      console.warn('P2PAutoConnect: No current CID, cannot connect');
      return;
    }

    // Don't connect to self
    if (peerCid === currentCid) {
      return;
    }

    const attempt = this.connectionAttempts.get(peerCid) || { attempts: 0, timeout: null };

    // Refresh online status before attempting
    await this.refreshOnlineStatus();

    // If peer is offline, skip this attempt and schedule next poll
    if (!this.isPeerOnline(peerCid)) {
      console.log(`P2PAutoConnect: Peer ${peerCid.slice(0, 8)}... offline, scheduling next check in ${this.POLL_INTERVAL / 1000}s`);
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

      // Success - handled in event listener
    } catch (error) {
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

    try {
      const registeredPeers = await p2pRegistrationService.listRegisteredPeers();
      console.log(`P2PAutoConnect: Found ${registeredPeers.length} registered peers`);

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
    } catch (error: any) {
      // Skip silently if there's no valid user session (expected when not logged in)
      if (error?.message?.includes('CID 0') || error?.message?.includes('No active')) {
        return;
      }
      console.error('P2PAutoConnect: Failed to list registered peers:', error);
    }
  }

  /**
   * Handle successful connection
   */
  private handleConnectionSuccess(peerCid: string): void {
    this.connectedPeers.add(peerCid);
    this.cancelRetry(peerCid);
    console.log(`P2PAutoConnect: Connected to ${peerCid.slice(0, 8)}...`);
    eventEmitter.emit('p2p-connection-established', { peerCid });
  }

  /**
   * Handle incoming PeerConnect request (when other peer initiates)
   * IMPORTANT: We must call PeerConnect BACK to establish bidirectional channel
   * The initiator's PeerConnect creates their read stream from us, but we need
   * to create our read stream from them by calling PeerConnect in reverse.
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

    this.connectedPeers.add(peerCid);
    this.cancelRetry(peerCid); // Stop trying if we were
    console.log(`P2PAutoConnect: Incoming connection from ${peerCid.slice(0, 8)}...`);
    eventEmitter.emit('p2p-connection-established', { peerCid });

    // CRITICAL: Call PeerConnect back to establish reverse channel
    // Without this, we can receive their messages but they can't receive ours
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
}

// Singleton export
export const p2pAutoConnectService = P2PAutoConnectService.getInstance();
