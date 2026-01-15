/**
 * P2P Auto-Connect Service
 *
 * Automatically connects to registered peers with:
 * - Online-aware polling (only attempts connect if peer is online)
 * - Exponential backoff: 1s → 2s → 4s → ... → 5min max, then poll every 5min
 * - Independent connection tasks per peer
 *
 * === SINGLE SOURCE OF TRUTH ===
 * This service maintains the authoritative peer connection state for the frontend.
 * The `connectedPeers` Map is the single source of truth, updated via:
 * - INSTANT: Events (PeerConnectSuccess, PeerDisconnect)
 * - PERIODIC: GetSessions polling for consistency
 *
 * WASM ILM calls getPeersForSession() via JavaScript callback to get current state.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        CID LIFECYCLE - CRITICAL INFO                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║ CID (Client ID) is a persistent 64-bit identifier assigned per account.      ║
 * ║                                                                              ║
 * ║ | Operation              | CID Behavior                                     |║
 * ║ |------------------------|--------------------------------------------------|║
 * ║ | Register (new account) | NEW CID assigned                                 |║
 * ║ | Login (credentials)    | SAME CID preserved                               |║
 * ║ | ClaimSession (orphan)  | SAME CID preserved                               |║
 * ║ | C2S disconnect+reconnect| SAME CID preserved, rekey works                 |║
 * ║ | TCP drop with orphan   | SAME CID, session persists on server             |║
 * ║                                                                              ║
 * ║ IMPORTANT: Only Register creates a new CID. All reconnection scenarios       ║
 * ║ (login, claim, TCP reconnect) preserve the original CID.                     ║
 * ║                                                                              ║
 * ║ For P2P auto-connect:                                                        ║
 * ║ - connectedPeers Map is keyed by localCid (our CID, never changes)           ║
 * ║ - forceInitiatorMode is set after ClaimSession to re-establish connections   ║
 * ║ - resetConnectionState() clears local state but CID remains the same         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { websocketService } from './websocket-service';
import { p2pRegistrationService } from './p2p-registration-service';
import { connectionManager } from './connection-manager';
import { eventEmitter } from './event-emitter';
import { instanceManager } from './instance-manager';
import { getSelectedUser } from './tab-context';
import { P2P_CONSTANTS } from './constants';
import { safeJSONStringify } from './storage-utils';

interface ConnectionAttempt {
  attempts: number;
  timeout: NodeJS.Timeout | null;
}

/**
 * Information about a connected peer.
 * Stored in the nested Map structure for the single source of truth.
 */
export interface PeerConnectionInfo {
  peerCid: string;
  peerUsername: string;
  connectedAt: number;
  lastVerified: number;
}

export class P2PAutoConnectService {
  private static instance: P2PAutoConnectService;

  // Connection state tracking
  private connectionAttempts = new Map<string, ConnectionAttempt>();
  private onlinePeers = new Set<string>();

  /**
   * SINGLE SOURCE OF TRUTH for peer connections.
   * Structure: Map<localCid, Map<peerCid, PeerConnectionInfo>>
   *
   * Updated by:
   * - INSTANT: setPeerConnected() on PeerConnectSuccess event
   * - INSTANT: setPeerDisconnected() on PeerDisconnect event
   * - PERIODIC: refreshFromBackend() via GetSessions polling
   *
   * Read by:
   * - WASM ILM via getPeersForSession() callback
   * - All internal connection state checks
   */
  private connectedPeers = new Map<string, Map<string, PeerConnectionInfo>>();

  private pendingConnections = new Set<string>(); // Peers we've initiated connection to (waiting for PeerConnectSuccess)

  /**
   * Force initiator mode - set after ClaimSession to bypass deterministic CID check.
   * When a user reconnects via ClaimSession, they must ALWAYS initiate PeerConnect
   * regardless of CID comparison, because the peer doesn't know they've reconnected.
   */
  private forceInitiatorMode = false;

  // Periodic polling for connection attempts
  private pollingInterval: NodeJS.Timeout | null = null;

  // Periodic polling for GetSessions (backend state sync)
  private backendPollInterval: NodeJS.Timeout | null = null;

  // Backoff configuration
  private readonly BASE_DELAY = 1000; // 1 second
  private readonly MAX_DELAY = 30 * 1000; // 30 seconds (reduced from 5 minutes for faster reconnection)
  private readonly POLL_INTERVAL = 30 * 1000; // 30 seconds continuous polling (reduced from 5 minutes)

  // Online status caching (10s TTL to avoid redundant API calls)
  private lastOnlineStatusRefresh = 0;
  private readonly ONLINE_STATUS_CACHE_TTL = 10 * 1000; // 10 seconds

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
      this.startBackendPolling();
    });

    // Stop polling when P2P registration service stops (on logout)
    eventEmitter.on('p2p:registration-service-stopped', () => {
      this.stopPolling();
      this.stopBackendPolling();
      this.cancelAllRetries();
    });

    // Stop polling when WebSocket connection dies or fails
    // This prevents infinite retry loops when the backend is unavailable
    eventEmitter.on('websocket-disconnected', ({ reason }: { reason: string }) => {
      console.log(`[P2PAutoConnect] WebSocket disconnected: ${reason}, stopping all polling`);
      this.stopPolling();
      this.stopBackendPolling();
      this.cancelAllRetries();
    });

    // Also stop on general connection failure (initial connection fails)
    eventEmitter.on('connection-failure', ({ error }: { error: string }) => {
      console.log(`[P2PAutoConnect] Connection failure: ${error}, stopping all polling`);
      this.stopPolling();
      this.stopBackendPolling();
      this.cancelAllRetries();
    });

    // Start/stop polling based on leader status
    // Only leader tab should poll to prevent duplicate P2P connect requests from multiple tabs
    eventEmitter.on('instance:leader-changed', (data: { isLeader: boolean; leaderId: string }) => {
      console.log(`[P2PAutoConnect] Leader changed - isLeader: ${data.isLeader}`);
      if (data.isLeader) {
        // Became leader, start polling if P2P service is active
        this.startPolling();
        this.startBackendPolling();
      } else {
        // Lost leadership, stop polling
        this.stopPolling();
        this.stopBackendPolling();
        this.cancelAllRetries();
      }
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

    // When WE accept a peer registration, do NOT call PeerConnect.
    // The initiator (the peer who registered first) will call PeerConnect.
    // We (the acceptor) will receive PeerChannelCreated event from the SDK,
    // which is handled by peer_channel_created.rs to set up our receive stream.
    // Calling PeerConnect from both sides causes virtual connection overwrites
    // in the SDK, leading to "unable to proxy" errors and message loss.
    eventEmitter.on('p2p:registration-accepted', ({ peerCid }: { peerCid: string }) => {
      if (peerCid) {
        console.log(`P2PAutoConnect: Registration accepted for ${peerCid.slice(0, 8)}... - waiting for initiator to connect (not calling PeerConnect as acceptor)`);
        // DO NOT call connectToPeer here - the initiator will call PeerConnect,
        // and we will receive PeerChannelCreated which sets up our channel.
      }
    });

    // Listen for successful P2P connections - INSTANT update
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
        const peerUsername = message.PeerConnectSuccess.peer_username || '';
        if (peerCid && peerCid !== currentCid && currentCid) {
          // Don't add self to connected peers
          this.handleConnectionSuccess(currentCid, peerCid, peerUsername);
        }
      }

      // Handle incoming PeerConnect from another peer
      if (message.PeerConnectNotification) {
        console.log(`[P2P-DEBUG] PeerConnectNotification EVENT RECEIVED in websocket-message handler`);
        this.handleIncomingPeerConnect(message.PeerConnectNotification).catch((err) => {
          console.error('[P2P-DEBUG] handleIncomingPeerConnect failed:', err);
        });
      }

      // Handle peer disconnect - INSTANT update
      if (message.PeerDisconnect) {
        // CRITICAL: Filter by CID - in multi-tab scenarios all tabs receive broadcast
        const messageCid = message.PeerDisconnect.cid?.toString();
        const currentCid = this.getCurrentCid();

        if (messageCid && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, ignore it
          return;
        }

        const peerCid = message.PeerDisconnect.peer_cid?.toString();
        if (peerCid && currentCid) {
          this.handlePeerDisconnect(currentCid, peerCid);
        }
      }

      // Handle DisconnectNotification with peer_cid - this is sent when a peer's C2S session disconnects
      // The SDK emits PeerSignal::Disconnect to all connected peers, which becomes DisconnectNotification
      // This is different from PeerDisconnect (explicit P2P disconnect request)
      if (message.DisconnectNotification && message.DisconnectNotification.peer_cid) {
        const messageCid = message.DisconnectNotification.cid?.toString();
        const currentCid = this.getCurrentCid();

        if (messageCid && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, ignore it
          return;
        }

        const peerCid = message.DisconnectNotification.peer_cid?.toString();
        if (peerCid && currentCid) {
          console.log(`[P2PAutoConnect] DisconnectNotification: Peer ${peerCid.slice(0, 8)}... session disconnected`);
          this.handlePeerDisconnect(currentCid, peerCid);
        }
      }
    });
  }

  // ============================================================
  // SINGLE SOURCE OF TRUTH: Peer Connection State Management
  // ============================================================

  /**
   * Add a peer to the connected state. Called on PeerConnectSuccess event.
   * This is an INSTANT update to the single source of truth.
   */
  public setPeerConnected(localCid: string, peerCid: string, peerUsername: string = ''): void {
    if (!this.connectedPeers.has(localCid)) {
      this.connectedPeers.set(localCid, new Map());
    }

    const peerMap = this.connectedPeers.get(localCid)!;
    const now = Date.now();

    peerMap.set(peerCid, {
      peerCid,
      peerUsername,
      connectedAt: now,
      lastVerified: now,
    });

    // ILM-DIAG: Log full CIDs for comparison with ILM queries
    console.log(`[ILM-DIAG] setPeerConnected: STORED localCid=${localCid} peerCid=${peerCid} (total: ${peerMap.size})`);
  }

  /**
   * Remove a peer from the connected state. Called on PeerDisconnect event.
   * This is an INSTANT update to the single source of truth.
   */
  public setPeerDisconnected(localCid: string, peerCid: string): void {
    const peerMap = this.connectedPeers.get(localCid);
    if (peerMap) {
      peerMap.delete(peerCid);
      console.log(`[P2PAutoConnect] setPeerDisconnected: ${localCid.slice(0, 8)} -X- ${peerCid.slice(0, 8)} (remaining: ${peerMap.size})`);
    }
  }

  /**
   * Get peer CIDs for a session. Called by WASM ILM via JavaScript callback.
   * This is the primary interface for WASM to query connection state.
   *
   * @param localCid - The local session CID
   * @returns Array of connected peer CID strings
   */
  public getPeersForSession(localCid: string): string[] {
    const peerMap = this.connectedPeers.get(localCid);
    if (!peerMap) {
      // ILM-DIAG: Log when no entry exists for the queried CID
      // This helps identify CID mismatches
      const allCids = Array.from(this.connectedPeers.keys());
      if (allCids.length > 0) {
        console.warn(`[ILM-DIAG] getPeersForSession: NO ENTRY for CID ${localCid.slice(0, 8)}..., but connectedPeers has entries for: ${allCids.map(c => c.slice(0, 8)).join(', ')}`);
      }
      return [];
    }
    return Array.from(peerMap.keys());
  }

  /**
   * Check if a peer is connected for the current session.
   */
  public isPeerConnectedForSession(localCid: string, peerCid: string): boolean {
    const peerMap = this.connectedPeers.get(localCid);
    return peerMap?.has(peerCid) ?? false;
  }

  // Guard to prevent concurrent refresh operations
  private isRefreshing = false;

  /**
   * Start periodic GetSessions polling for backend state sync.
   * This provides PERIODIC consistency updates to the single source of truth.
   * Only runs on leader tab to prevent redundant backend queries.
   */
  public startBackendPolling(): void {
    // Only leader tab should poll to prevent redundant backend queries from multiple tabs
    if (!instanceManager.isLeader) {
      console.log('[P2PAutoConnect] Backend polling not started (not leader tab)');
      return;
    }

    if (this.backendPollInterval) {
      // Already running - silently return (don't spam logs)
      return;
    }

    console.log(`[P2PAutoConnect] Starting backend polling (interval: ${P2P_CONSTANTS.GET_SESSIONS_POLL_INTERVAL_MS}ms)`);

    this.backendPollInterval = setInterval(async () => {
      // Skip if already refreshing (prevent pile-up)
      if (this.isRefreshing) return;

      const currentCid = this.getCurrentCid();
      if (!currentCid || currentCid === '0') return;

      this.isRefreshing = true;
      try {
        await this.refreshFromBackend(currentCid);
      } finally {
        this.isRefreshing = false;
      }
    }, P2P_CONSTANTS.GET_SESSIONS_POLL_INTERVAL_MS);
  }

  /**
   * Stop periodic GetSessions polling.
   */
  public stopBackendPolling(): void {
    if (this.backendPollInterval) {
      clearInterval(this.backendPollInterval);
      this.backendPollInterval = null;
      console.log('[P2PAutoConnect] Stopped backend polling');
    }
  }

  /**
   * Refresh peer connection state from backend GetSessions response.
   * This is a PERIODIC consistency check for the single source of truth.
   * It syncs the entire peer map from the backend's authoritative state.
   */
  public async refreshFromBackend(localCid: string): Promise<void> {
    try {
      const sessions = await connectionManager.getActiveSessions();
      const mySession = sessions.find(s => s.cid?.toString() === localCid);

      if (!mySession?.peer_connections) {
        // No connections - clear the map for this session
        this.connectedPeers.set(localCid, new Map());
        return;
      }

      // Build new peer map from backend data
      const peerMap = new Map<string, PeerConnectionInfo>();
      const now = Date.now();

      for (const [peerCid, info] of Object.entries(mySession.peer_connections)) {
        const existingInfo = this.connectedPeers.get(localCid)?.get(peerCid);
        peerMap.set(peerCid, {
          peerCid,
          peerUsername: (info as any).peer_username || existingInfo?.peerUsername || '',
          connectedAt: existingInfo?.connectedAt || now,
          lastVerified: now,
        });
      }

      this.connectedPeers.set(localCid, peerMap);
    } catch (error) {
      // Only warn on unexpected errors, skip silently for expected "no session" errors
      const errMsg = String(error);
      if (!errMsg.includes('CID 0') && !errMsg.includes('No active')) {
        console.warn('[P2PAutoConnect] Backend poll failed:', error);
      }
    }
  }

  // ============================================================
  // Legacy API Compatibility (uses current CID from context)
  // ============================================================

  /**
   * Refresh online status from internal service (with caching)
   * @param force - If true, bypass cache and force refresh
   */
  public async refreshOnlineStatus(force = false): Promise<void> {
    // Use cached status if recently refreshed (within TTL) and not forced
    const now = Date.now();
    if (!force && now - this.lastOnlineStatusRefresh < this.ONLINE_STATUS_CACHE_TTL) {
      console.log(`P2PAutoConnect: Using cached online status (${Math.round((now - this.lastOnlineStatusRefresh) / 1000)}s old)`);
      return;
    }

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

      this.lastOnlineStatusRefresh = Date.now();
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
   * Check if a peer is currently connected (legacy API using current CID)
   */
  public isPeerConnected(peerCid: string): boolean {
    const currentCid = this.getCurrentCid();
    if (!currentCid) return false;
    return this.isPeerConnectedForSession(currentCid, peerCid);
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
   * Verify if peer is actually connected in backend (not just in local connectedPeers Map)
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
   * Connect to a single peer with exponential backoff + online check.
   *
   * DETERMINISTIC INITIATOR SELECTION:
   * To prevent race conditions from simultaneous PeerConnect calls, we use
   * CID comparison: the peer with the HIGHER CID is always the initiator.
   * - If our CID > peer CID: We are the initiator → send PeerConnect
   * - If our CID < peer CID: We are NOT the initiator → wait for PeerChannelCreated
   *
   * This ensures exactly one side initiates the connection, avoiding SDK
   * virtual connection overwrites that cause "unable to proxy" errors.
   *
   * Only runs on leader tab to prevent duplicate P2P connect requests.
   */
  public async connectToPeer(peerCid: string): Promise<void> {
    console.log(`[ILM-TRACE] connectToPeer: START peerCid=${peerCid?.slice(0, 8)}`);

    // Only leader tab should initiate P2P connections to prevent duplicate requests from multiple tabs
    if (!instanceManager.isLeader) {
      console.log(`[P2PAutoConnect] connectToPeer skipped for ${peerCid?.slice(0, 8)} (not leader tab)`);
      return;
    }

    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      console.warn('P2PAutoConnect: No current CID, cannot connect');
      console.log('[ILM-TRACE] connectToPeer: ABORT - no currentCid');
      return;
    }

    // Don't connect to self
    if (peerCid === currentCid) {
      console.log('[ILM-TRACE] connectToPeer: SKIP - self connection');
      return;
    }

    // DETERMINISTIC INITIATOR SELECTION: Higher CID is the initiator
    // Compare as BigInt since CIDs are 64-bit integers
    let currentCidBigInt: bigint;
    let peerCidBigInt: bigint;
    try {
      currentCidBigInt = BigInt(currentCid);
      peerCidBigInt = BigInt(peerCid);
    } catch (e) {
      console.error(`P2PAutoConnect: Invalid CID format - currentCid=${currentCid}, peerCid=${peerCid}`, e);
      return;
    }

    // FORCE INITIATOR MODE: After ClaimSession, the reconnecting user must ALWAYS
    // initiate PeerConnect because the peer doesn't know they've reconnected.
    // This bypasses the deterministic CID check for reconnection scenarios.
    if (this.forceInitiatorMode) {
      console.log(`P2PAutoConnect: FORCE INITIATOR MODE - Client ${currentCid.slice(0, 8)}... forcing PeerConnect to ${peerCid.slice(0, 8)}... (ClaimSession reconnection)`);
    } else if (currentCidBigInt < peerCidBigInt) {
      // We have the lower CID - we are NOT the initiator
      // The peer with the higher CID will call PeerConnect, and we'll receive PeerChannelCreated
      console.log(`P2PAutoConnect: Client ${currentCid.slice(0, 8)}... is NOT the initiator; peer ${peerCid.slice(0, 8)}... has higher CID. Will handle PeerConnect asynchronously when received via PeerChannelCreated.`);
      return;
    } else {
      // We have the higher CID - we ARE the initiator
      console.log(`P2PAutoConnect: Client ${currentCid.slice(0, 8)}... IS the initiator for ${peerCid.slice(0, 8)}... (higher CID): now sending PeerConnect request`);
    }

    // Mark as pending to prevent duplicate attempts
    if (this.pendingConnections.has(peerCid)) {
      console.log(`P2PAutoConnect: Connection to ${peerCid.slice(0, 8)}... already pending, skipping duplicate`);
      return;
    }
    this.pendingConnections.add(peerCid);

    // CRITICAL FIX: Verify local connectedPeers against backend state
    // This handles cases where frontend thinks we're connected but backend doesn't have the channel
    if (this.isPeerConnectedForSession(currentCid, peerCid)) {
      const actuallyConnected = await this.isActuallyConnectedInBackend(currentCid, peerCid);
      if (actuallyConnected) {
        console.log(`P2PAutoConnect: Already connected to ${peerCid.slice(0, 8)}... (verified with backend), skipping`);
        this.pendingConnections.delete(peerCid);
        return;
      } else {
        console.warn(`P2PAutoConnect: Local connectedPeers has ${peerCid.slice(0, 8)}... but backend shows not connected. Re-establishing connection.`);
        this.setPeerDisconnected(currentCid, peerCid);
      }
    }

    const attempt = this.connectionAttempts.get(peerCid) || { attempts: 0, timeout: null };

    // OPTIMIZATION: Use cached online status (non-blocking) - skip if definitely offline
    // If cache says offline, defer; if cache stale or online, try optimistically
    const isOnline = this.isPeerOnline(peerCid);
    const cacheAge = Date.now() - this.lastOnlineStatusRefresh;
    const cacheValid = cacheAge < this.ONLINE_STATUS_CACHE_TTL;

    if (cacheValid && !isOnline) {
      // Cache is fresh and says peer is offline - defer
      console.log(`P2PAutoConnect: Peer ${peerCid.slice(0, 8)}... offline (cached), scheduling next check in ${this.POLL_INTERVAL / 1000}s`);
      console.log('[ILM-TRACE] connectToPeer: DEFERRED - peer offline (cached)');
      this.pendingConnections.delete(peerCid);
      attempt.timeout = setTimeout(() => this.connectToPeer(peerCid), this.POLL_INTERVAL);
      this.connectionAttempts.set(peerCid, attempt);
      return;
    }

    // Try connection optimistically - if peer is offline, it will fail fast
    console.log(`[ILM-TRACE] connectToPeer: trying optimistically (cacheValid=${cacheValid}, isOnline=${isOnline})`);

    try {
      // OPTIMIZATION: Removed claimSession call - session context is already established at login
      // ClaimSession was causing an extra round-trip delay before every P2P connection attempt
      console.log(`P2PAutoConnect: Attempting connection to ${peerCid.slice(0, 8)}...`);
      console.log(`[ILM-TRACE] connectToPeer: calling openP2PConnection(${currentCid.slice(0, 8)}, ${peerCid.slice(0, 8)})`);
      await websocketService.openP2PConnection(currentCid, peerCid);
      console.log('[ILM-TRACE] connectToPeer: openP2PConnection SUCCESS');

      // Success - handled in event listener (handleConnectionSuccess will remove from pendingConnections)
    } catch (error) {
      console.log(`[ILM-TRACE] connectToPeer: CATCH error=${error}`);
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
    console.log(`[ILM-TRACE] connectToAllRegisteredPeers: currentCid=${currentCid?.slice(0, 8) || 'null'}`);

    // Skip silently if no valid user session (CID 0 is service connection)
    if (!currentCid || currentCid === '0') {
      console.log('[ILM-TRACE] connectToAllRegisteredPeers: SKIPPED - no valid CID');
      return;
    }

    // OPTIMIZATION: Kick off non-blocking online status refresh (uses caching internally)
    // Each connectToPeer() will use cached status or try optimistically
    this.refreshOnlineStatus().catch(() => {}); // Fire-and-forget
    console.log(`[ILM-TRACE] connectToAllRegisteredPeers: onlinePeers=${Array.from(this.onlinePeers).map(c => c.slice(0, 8)).join(',')}`);

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
    console.log(`[ILM-TRACE] connectToAllRegisteredPeers: launching connections to ${registeredPeers.length} peers`);
    for (const peer of registeredPeers) {
      const peerCid = peer.cid?.toString();
      console.log(`[ILM-TRACE] Peer: cid=${peerCid?.slice(0, 8)}, currentCid=${currentCid?.slice(0, 8)}, skip=${peerCid === currentCid}`);
      if (peerCid && peerCid !== currentCid) {
        // Don't await - let each run independently
        this.connectToPeer(peerCid).catch((err) => {
          console.error(`P2PAutoConnect: Failed to initiate connection to ${peerCid}:`, err);
        });
      }
    }

    // Clear force initiator mode after launching all connection attempts
    // The flag is only needed for the initial reconnection wave after ClaimSession
    if (this.forceInitiatorMode) {
      this.forceInitiatorMode = false;
      console.log('[ILM-TRACE] P2PAutoConnect: forceInitiatorMode=false (connection attempts launched)');
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
   * Handle successful connection - INSTANT update to single source of truth
   */
  private handleConnectionSuccess(localCid: string, peerCid: string, peerUsername: string = ''): void {
    this.setPeerConnected(localCid, peerCid, peerUsername);
    this.pendingConnections.delete(peerCid); // Connection complete, no longer pending
    this.cancelRetry(peerCid);
    console.log(`P2PAutoConnect: Connected to ${peerCid.slice(0, 8)}...`);
    eventEmitter.emit('p2p-connection-established', { peerCid });
  }

  /**
   * Handle incoming PeerConnect request (when other peer initiates)
   *
   * This function ONLY accepts incoming connections - it does NOT call PeerConnect back.
   * Calling PeerConnect back would cause an infinite loop:
   *   Alice → PeerConnect → Bob → PeerConnect back → Alice → PeerConnect back → ...
   *
   * The SDK's acceptPeerConnect (via responses::peer_connect) is sufficient to complete
   * the bidirectional handshake. The connectToPeer function handles outgoing connections.
   *
   * Notification field mapping (from backend peer_event.rs):
   * - notification.cid = TARGET's CID (who should accept - this is US)
   * - notification.peer_cid = INITIATOR's CID (who called PeerConnect)
   *
   * In multi-tab scenarios, notifications are broadcast to all tabs, so we must:
   * 1. Verify notification.cid matches our current CID (we are the TARGET)
   */
  public async handleIncomingPeerConnect(notification: any): Promise<void> {
    console.log(`[P2P-DEBUG] handleIncomingPeerConnect RECEIVED:`, safeJSONStringify(notification));

    // FIXED: notification.cid is TARGET (us), notification.peer_cid is INITIATOR (them)
    const targetCid = notification.cid?.toString();       // Who should accept (us)
    const initiatorCid = notification.peer_cid?.toString(); // Who initiated the connection
    const peerUsername = notification.peer_username || '';

    console.log(`[P2P-DEBUG] handleIncomingPeerConnect targetCid=${targetCid?.slice(0,8)}, initiatorCid=${initiatorCid?.slice(0,8)}`);

    if (!initiatorCid || !targetCid) {
      console.warn('P2PAutoConnect: Invalid PeerConnectNotification - missing cid or peer_cid');
      return;
    }

    // CRITICAL: Filter by CID - only process if WE are the TARGET (cid matches our CID)
    // The notification is broadcast to all WebSocket clients, so we must filter
    const currentCid = this.getCurrentCid();
    console.log(`[P2P-DEBUG] handleIncomingPeerConnect currentCid=${currentCid?.slice(0,8) || 'null'}`);

    if (!currentCid) {
      console.warn('P2PAutoConnect: No current CID, cannot process incoming connection');
      return;
    }

    // We should only process this if WE are the target (cid matches our CID)
    if (targetCid !== currentCid) {
      console.log(`P2PAutoConnect: Ignoring PeerConnectNotification - target is ${targetCid.slice(0, 8)}... (we are ${currentCid.slice(0, 8)}...)`);
      return;
    }

    // Check if already connected to the initiator
    // CRITICAL FIX: Verify with backend - local connectedPeers may be stale after TCP drop with orphan mode
    // When a peer TCP drops, PeerDisconnect is NOT sent (session is orphaned), so our connectedPeers
    // still has the peer. When they reconnect and send PeerConnect, we must check backend state.
    if (this.isPeerConnectedForSession(currentCid, initiatorCid)) {
      const actuallyConnected = await this.isActuallyConnectedInBackend(currentCid, initiatorCid);
      if (actuallyConnected) {
        console.log(`P2PAutoConnect: Already connected to ${initiatorCid.slice(0, 8)}... (verified with backend), skipping accept`);
        return;
      } else {
        console.warn(`P2PAutoConnect: Local connectedPeers has ${initiatorCid.slice(0, 8)}... but backend shows not connected. Stale from TCP drop - accepting new connection.`);
        this.setPeerDisconnected(currentCid, initiatorCid);
      }
    }

    // Check if we have a pending outgoing connection to the initiator (SIMULTANEOUS_CONNECT)
    // IMPORTANT: We MUST still call acceptPeerConnect even in this case!
    // Otherwise the initiator's channel is never completed and messages are lost.
    const isSimultaneousConnect = this.pendingConnections.has(initiatorCid);
    if (isSimultaneousConnect) {
      console.log(`P2PAutoConnect: SIMULTANEOUS_CONNECT detected for ${initiatorCid.slice(0, 8)}... - will accept their connection too`);
      this.pendingConnections.delete(initiatorCid);
      this.cancelRetry(initiatorCid);
      // Don't return - fall through to accept the connection
    }

    console.log(`[P2P-DEBUG] handleIncomingPeerConnect PASSED checks - accepting connection from ${initiatorCid.slice(0, 8)}...`);

    // ILM-DIAG: Log the exact CID being stored for later comparison with ILM queries
    console.log(`[ILM-DIAG] handleIncomingPeerConnect: STORING peer ${initiatorCid.slice(0, 8)} under localCid=${currentCid}`);

    // Mark initiator as connected - INSTANT update
    this.setPeerConnected(currentCid, initiatorCid, peerUsername);
    this.cancelRetry(initiatorCid);
    console.log(`P2PAutoConnect: Incoming connection from ${initiatorCid.slice(0, 8)}... (they initiated)`);

    try {
      // Accept the incoming connection - this completes the handshake
      // The SDK's responses::peer_connect handles the bidirectional channel
      console.log(`P2PAutoConnect: Sending PeerConnectAccept for ${initiatorCid.slice(0, 8)}...`);
      await websocketService.acceptPeerConnect(currentCid, initiatorCid, notification);
      console.log(`P2PAutoConnect: PeerConnectAccept sent for ${initiatorCid.slice(0, 8)}...`);
      eventEmitter.emit('p2p-connection-established', { peerCid: initiatorCid });
    } catch (error) {
      const errMsg = String(error);
      if (errMsg.includes('already connected') || errMsg.includes('Already connected')) {
        console.log(`P2PAutoConnect: Channel already exists for ${initiatorCid.slice(0, 8)}...`);
        eventEmitter.emit('p2p-connection-established', { peerCid: initiatorCid });
      } else {
        console.warn(`P2PAutoConnect: Failed to accept connection from ${initiatorCid.slice(0, 8)}...:`, error);
        // Remove from connected since accept failed
        this.setPeerDisconnected(currentCid, initiatorCid);
      }
    }
  }

  /**
   * Handle peer disconnect - INSTANT update to single source of truth
   */
  public handlePeerDisconnect(localCid: string, peerCid: string): void {
    this.setPeerDisconnected(localCid, peerCid);
    this.pendingConnections.delete(peerCid);
    console.log(`P2PAutoConnect: Peer ${peerCid.slice(0, 8)}... disconnected`);
    eventEmitter.emit('p2p-connection-lost', { peerCid });
  }

  /**
   * Clear a peer from connected state (without emitting events).
   * Used by P2PMessengerManager when verifying stale connection state against backend.
   */
  public clearPeerFromConnected(peerCid: string): void {
    const currentCid = this.getCurrentCid();
    if (currentCid) {
      this.setPeerDisconnected(currentCid, peerCid);
    }
    this.pendingConnections.delete(peerCid);
    console.log(`P2PAutoConnect: Cleared stale connection for ${peerCid.slice(0, 8)}...`);
  }

  /**
   * Reset connection state for reconnection scenarios (ClaimSession)
   * When a user reclaims an orphaned session, we need to clear stale connection state
   * because:
   * 1. TCP drop with orphan mode doesn't send PeerDisconnect to peers
   * 2. So other peers' connectedPeers Map may still have this CID
   * 3. When this user reconnects via PeerConnect, peers skip reverse PeerConnect
   * 4. This causes unidirectional channels (messages only flow one way)
   *
   * By clearing our own state on reconnection, we ensure:
   * - We initiate fresh PeerConnect calls to all registered peers
   * - We don't skip connections thinking they're already established
   */
  public resetConnectionState(): void {
    const currentCid = this.getCurrentCid();
    const peerCount = currentCid ? (this.connectedPeers.get(currentCid)?.size ?? 0) : 0;

    console.log(`[ILM-TRACE] P2PAutoConnect: Resetting connection state for reconnection`);
    console.log(`[ILM-TRACE] P2PAutoConnect: Clearing ${peerCount} connected, ${this.pendingConnections.size} pending`);

    if (currentCid) {
      this.connectedPeers.set(currentCid, new Map());
    }
    this.pendingConnections.clear();
    this.cancelAllRetries();

    // CRITICAL: Force initiator mode after ClaimSession
    // The reconnecting user must ALWAYS initiate PeerConnect because the peer
    // doesn't know they've reconnected and won't initiate from their side.
    this.forceInitiatorMode = true;
    console.log('[ILM-TRACE] P2PAutoConnect: forceInitiatorMode=true (reconnection)');

    console.log('P2PAutoConnect: Connection state reset for reconnection');
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
   * Only runs on leader tab to prevent duplicate P2P connect requests.
   */
  public poll(): void {
    // Only leader tab should poll to prevent duplicate P2P connect requests from multiple tabs
    if (!instanceManager.isLeader) {
      console.log('[P2PAutoConnect] Poll skipped (not leader tab)');
      return;
    }

    this.connectToAllRegisteredPeers().catch((err) => {
      console.error('P2PAutoConnect: Poll failed:', err);
    });
  }

  /**
   * Start periodic background polling for auto-reconnection.
   * Polls every POLL_INTERVAL (5 minutes) to reconnect to any
   * registered peers that have disconnected.
   * Only runs on leader tab to prevent duplicate P2P connect requests.
   */
  public startPolling(): void {
    // Only leader tab should poll to prevent duplicate P2P connect requests from multiple tabs
    if (!instanceManager.isLeader) {
      console.log('[P2PAutoConnect] Polling not started (not leader tab)');
      return;
    }

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
   * Get list of connected peer CIDs (legacy API using current CID)
   */
  public getConnectedPeers(): string[] {
    const currentCid = this.getCurrentCid();
    if (!currentCid) return [];
    return this.getPeersForSession(currentCid);
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
    if (this.isPeerConnectedForSession(currentCid, peerCid)) {
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
    const currentCid = this.getCurrentCid();
    if (!currentCid) return false;

    // Already connected
    if (this.isPeerConnectedForSession(currentCid, peerCid)) {
      return true;
    }

    // Start background connection attempt
    this.ensurePeerConnectedInBackground(peerCid);

    // Wait for connection event or timeout
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Check periodically
      const checkInterval = setInterval(() => {
        if (this.isPeerConnectedForSession(currentCid, peerCid)) {
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
