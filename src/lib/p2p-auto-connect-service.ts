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
import { connectionManager } from './connection';
import { eventEmitter } from './event-emitter';
import { instanceManager } from './multi-instance';
import { broadcastChannelService } from './broadcast-channel-service';
import { getSelectedUser } from './tab-context';
import { P2P_CONSTANTS } from './constants';
import { safeJSONStringify } from './storage-utils';
import { ensureBigInt, ensureBigIntPair } from './utils';

interface ConnectionAttempt {
  attempts: number;
  timeout: NodeJS.Timeout | null;
}

/**
 * Information about a connected peer.
 * Stored in the nested Map structure for the single source of truth.
 */
export interface PeerConnectionInfo {
  peerCid: bigint;
  peerUsername: string;
  connectedAt: number;
  lastVerified: number;
}

export class P2PAutoConnectService {
  private static instance: P2PAutoConnectService;

  // Connection state tracking
  private connectionAttempts = new Map<bigint, ConnectionAttempt>();
  private onlinePeers = new Set<bigint>();

  /**
   * Channels that have proven bidirectional message flow.
   * A channel is "ready" when we receive the first P2P message from the peer,
   * proving the channel is established and messages can flow in both directions.
   * This is more reliable than just checking "connected" status.
   * Reset on session reconnection (ClaimSession/Login).
   */
  private readyChannels = new Set<bigint>();

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
  private connectedPeers = new Map<bigint, Map<bigint, PeerConnectionInfo>>();

  private pendingConnections = new Set<bigint>(); // Peers we've initiated connection to (waiting for PeerConnectSuccess)

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

    // Listen for connectedPeers updates from leader (for follower tabs)
    // This allows follower tabs to have synchronized connectedPeers state
    // so WASM ILM queries work correctly on all tabs
    eventEmitter.on('broadcast-state-sync', (data: any) => {
      if (data?.type === 'connected-peers-update' && !instanceManager.isLeader) {
        const { localCid, peerCid, peerUsername, localUsername } = data;
        if (localCid !== undefined && peerCid !== undefined) {
          const localCidBigInt = BigInt(localCid);
          const peerCidBigInt = BigInt(peerCid);
          console.log(`[ILM-TRACE] Follower received connectedPeers update: ${localCidBigInt.toString().slice(0, 8)}... ↔ ${peerCidBigInt.toString().slice(0, 8)}...`);
          // Store locally without re-broadcasting (we're a follower)
          this.setPeerConnectedLocal(localCidBigInt, peerCidBigInt, peerUsername || '', localUsername || '');

          // Emit connection-established event to trigger sidebar refresh on follower tabs
          // This ensures the UI updates to show the new peer connection
          eventEmitter.emit('p2p-connection-established', {
            peerCid: peerCidBigInt,
            peerUsername: peerUsername || ''
          });
        }
      }
    });

    // CRITICAL: Immediately connect to newly registered peers (don't wait for 5-min poll)
    // Handle both incoming and outgoing registrations appropriately
    eventEmitter.on('p2p:peer-registered', ({ peer, isIncoming, isOutgoing }: { peer: any; isIncoming?: boolean; isOutgoing?: boolean }) => {
      const peerCid: bigint | undefined = peer?.cid;
      if (peerCid === undefined) return;

      // For INCOMING registrations (they registered with us), check if we PREVIOUSLY
      // registered with them (outgoing). If so, mutual registration is complete.
      if (isIncoming) {
        // Use hasOutgoingRegistration to check if WE registered with them BEFORE
        // (not isPeerRegistered which includes incoming registrations too)
        const weRegisteredFirst = p2pRegistrationService.hasOutgoingRegistration(peerCid);
        if (weRegisteredFirst) {
          // We registered with them first, they just registered back
          // Mutual registration is complete - trigger PeerConnect!
          // Mark peer as online in cache - they just registered so they must be online
          this.onlinePeers.add(peerCid);
          console.log(`P2PAutoConnect: Mutual registration complete with ${peerCid.toString().slice(0, 8)}... (they registered back), initiating immediate connection`);
          this.connectToPeer(peerCid).catch((err) => {
            console.error(`P2PAutoConnect: Failed to connect after mutual registration ${peerCid.toString().slice(0, 8)}...:`, err);
          });
        } else {
          // They registered with us first, we need to accept and register back
          console.log(`P2PAutoConnect: Incoming registration from ${peerCid.toString().slice(0, 8)}..., waiting for user to accept (mutual registration required)`);
        }
        return;
      }

      // For OUTGOING registrations (we registered with them), try to connect immediately
      // This may fail if mutual registration isn't complete yet, but will retry
      // Mark peer as online in cache - they just responded to our registration so they must be online
      this.onlinePeers.add(peerCid);
      console.log(`P2PAutoConnect: Outgoing registration to ${peerCid.toString().slice(0, 8)}... confirmed, initiating immediate connection`);
      this.connectToPeer(peerCid).catch((err) => {
        console.error(`P2PAutoConnect: Failed to connect to newly registered peer ${peerCid.toString().slice(0, 8)}...:`, err);
      });
    });

    // When WE accept a peer registration, do NOT call PeerConnect.
    // The initiator (the peer who registered first) will call PeerConnect.
    // We (the acceptor) will receive PeerChannelCreated event from the SDK,
    // which is handled by peer_channel_created.rs to set up our receive stream.
    // Calling PeerConnect from both sides causes virtual connection overwrites
    // in the SDK, leading to "unable to proxy" errors and message loss.
    eventEmitter.on('p2p:registration-accepted', ({ peerCid }: { peerCid: bigint }) => {
      if (peerCid !== undefined) {
        console.log(`P2PAutoConnect: Registration accepted for ${peerCid.toString().slice(0, 8)}... - waiting for initiator to connect (not calling PeerConnect as acceptor)`);
        // DO NOT call connectToPeer here - the initiator will call PeerConnect,
        // and we will receive PeerChannelCreated which sets up our channel.
      }
    });

    // Listen for successful P2P connections - INSTANT update
    eventEmitter.on('websocket-message', async (message: any) => {
      if (message.PeerConnectSuccess) {
        // CRITICAL: On the leader tab, update connectedPeers for ALL sessions.
        // ILM runs on the leader and calls getPeersForSession() for any CID.
        //
        // PeerConnectSuccess fields:
        // - cid = INITIATOR's CID (who called PeerConnect)
        // - peer_cid = TARGET's CID (who was connected to)
        const messageCid: bigint | undefined = message.PeerConnectSuccess.cid;
        const peerCid: bigint | undefined = message.PeerConnectSuccess.peer_cid;
        const peerUsername = message.PeerConnectSuccess.peer_username || '';

        if (instanceManager.isLeader && messageCid !== undefined && peerCid !== undefined) {
          // Update leader's central connectedPeers Map for the initiator session
          console.log(`[ILM-TRACE] Leader updating connectedPeers for initiator CID ${messageCid.toString().slice(0, 8)}... → peer ${peerCid.toString().slice(0, 8)}...`);
          this.setPeerConnected(messageCid, peerCid, peerUsername);
        }

        // Filter by CID for the rest of the logic (emit events only for our session)
        const currentCid = await this.getCurrentCid();
        if (messageCid !== undefined && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, skip remaining logic
          return;
        }

        if (peerCid !== undefined && peerCid !== currentCid && currentCid) {
          // Don't add self to connected peers - note: handleConnectionSuccess also calls setPeerConnected,
          // but that's OK since it's idempotent (same data gets set again)
          this.handleConnectionSuccess(currentCid, peerCid, peerUsername);
        }
      }

      // Handle incoming PeerConnect from another peer
      if (message.PeerConnectNotification) {
        // CRITICAL: On the leader tab, update connectedPeers for ALL sessions.
        // ILM runs on the leader and calls getPeersForSession() for any CID.
        // Without this, the leader's connectedPeers Map only has entries for the
        // leader's own session, causing getPeersForSession(followerCid) to fail.
        //
        // PeerConnectNotification fields:
        // - cid = TARGET's CID (who should accept)
        // - peer_cid = INITIATOR's CID (who called PeerConnect)
        if (instanceManager.isLeader) {
          const targetCid: bigint | undefined = message.PeerConnectNotification.cid;
          const initiatorCid: bigint | undefined = message.PeerConnectNotification.peer_cid;
          const peerUsername = message.PeerConnectNotification.peer_username || '';

          if (targetCid !== undefined && initiatorCid !== undefined) {
            // Update leader's central connectedPeers Map for the TARGET session
            // This ensures ILM can see connections for follower sessions
            console.log(`[ILM-TRACE] Leader updating connectedPeers for target CID ${targetCid.toString().slice(0, 8)}... → peer ${initiatorCid.toString().slice(0, 8)}...`);
            this.setPeerConnected(targetCid, initiatorCid, peerUsername);
          }
        }

        // Now handle the actual acceptance logic (if we are the target)
        this.handleIncomingPeerConnect(message.PeerConnectNotification).catch((err) => {
          console.error('[P2P-AutoConnect] handleIncomingPeerConnect failed:', err);
        });
      }

      // Handle peer disconnect - INSTANT update
      if (message.PeerDisconnect) {
        const messageCid: bigint | undefined = message.PeerDisconnect.cid;
        const peerCid: bigint | undefined = message.PeerDisconnect.peer_cid;

        // On the leader tab, update connectedPeers for ALL sessions (central Map for ILM)
        if (instanceManager.isLeader && messageCid !== undefined && peerCid !== undefined) {
          console.log(`[ILM-TRACE] Leader updating connectedPeers: removing peer ${peerCid.toString().slice(0, 8)}... from CID ${messageCid.toString().slice(0, 8)}...`);
          this.setPeerDisconnected(messageCid, peerCid);
        }

        // Filter by CID for the rest of the logic (emit events only for our session)
        const currentCid = await this.getCurrentCid();
        if (messageCid !== undefined && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, skip remaining logic
          return;
        }

        if (peerCid !== undefined && currentCid) {
          this.handlePeerDisconnect(currentCid, peerCid);
        }
      }

      // Handle DisconnectNotification with peer_cid - this is sent when a peer's C2S session disconnects
      // The SDK emits PeerSignal::Disconnect to all connected peers, which becomes DisconnectNotification
      // This is different from PeerDisconnect (explicit P2P disconnect request)
      if (message.DisconnectNotification && message.DisconnectNotification.peer_cid) {
        const messageCid: bigint | undefined = message.DisconnectNotification.cid;
        const peerCid: bigint | undefined = message.DisconnectNotification.peer_cid;

        // On the leader tab, update connectedPeers for ALL sessions (central Map for ILM)
        if (instanceManager.isLeader && messageCid !== undefined && peerCid !== undefined) {
          console.log(`[ILM-TRACE] Leader DisconnectNotification: removing peer ${peerCid.toString().slice(0, 8)}... from CID ${messageCid.toString().slice(0, 8)}...`);
          this.setPeerDisconnected(messageCid, peerCid);
        }

        // Filter by CID for the rest of the logic (emit events only for our session)
        const currentCid = await this.getCurrentCid();
        if (messageCid !== undefined && currentCid && messageCid !== currentCid) {
          // This message is for a different tab's session, skip remaining logic
          return;
        }

        if (peerCid !== undefined && currentCid) {
          console.log(`[P2PAutoConnect] DisconnectNotification: Peer ${peerCid.toString().slice(0, 8)}... session disconnected`);
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
   *
   * IMPORTANT: Stores the relationship BIDIRECTIONALLY so both parties can
   * query their connected peers:
   * - connectedPeers[localCid] → peerCid
   * - connectedPeers[peerCid] → localCid
   *
   * On the leader tab, this also broadcasts the update to follower tabs
   * so their local connectedPeers Maps stay synchronized.
   */
  public setPeerConnected(localCid: bigint, peerCid: bigint, peerUsername: string = '', localUsername: string = ''): void {
    // Store locally
    this.setPeerConnectedLocal(localCid, peerCid, peerUsername, localUsername);

    // If we're the leader, broadcast to followers so they can update their local state
    // This enables WASM ILM queries to work correctly on follower tabs
    if (instanceManager.isLeader) {
      console.log(`[ILM-TRACE] Leader broadcasting connectedPeers update to followers`);
      broadcastChannelService.broadcastStateSync({
        type: 'connected-peers-update',
        localCid: localCid.toString(),
        peerCid: peerCid.toString(),
        peerUsername,
        localUsername,
      });
    }
  }

  /**
   * Internal method to store peer connection locally without broadcasting.
   * Used by both setPeerConnected (leader) and the broadcast listener (followers).
   *
   * CRITICAL: Ensures CIDs are converted to BigInt before using as Map keys.
   * WebSocket messages may send CIDs as strings (JSON doesn't support BigInt),
   * and TypeScript type annotations don't perform runtime conversion.
   * Map.get() uses strict equality, so string keys != BigInt keys.
   */
  private setPeerConnectedLocal(localCid: bigint, peerCid: bigint, peerUsername: string = '', localUsername: string = ''): void {
    const now = Date.now();

    // CRITICAL: Ensure CIDs are actually BigInt (WebSocket messages may send strings/numbers)
    // Without this, Map keys could be mixed types causing lookup failures
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    // ILM-DIAG: Log type information for debugging
    console.log(`[ILM-DIAG] setPeerConnectedLocal: INPUT localCid type=${typeof localCid}, peerCid type=${typeof peerCid}`);

    // Store forward direction: localCid → peerCid
    if (!this.connectedPeers.has(localCidBigInt)) {
      this.connectedPeers.set(localCidBigInt, new Map());
    }
    const localPeerMap = this.connectedPeers.get(localCidBigInt)!;
    localPeerMap.set(peerCidBigInt, {
      peerCid: peerCidBigInt,
      peerUsername,
      connectedAt: now,
      lastVerified: now,
    });

    // Store reverse direction: peerCid → localCid (BIDIRECTIONAL)
    if (!this.connectedPeers.has(peerCidBigInt)) {
      this.connectedPeers.set(peerCidBigInt, new Map());
    }
    const peerPeerMap = this.connectedPeers.get(peerCidBigInt)!;
    peerPeerMap.set(localCidBigInt, {
      peerCid: localCidBigInt,
      peerUsername: localUsername,
      connectedAt: now,
      lastVerified: now,
    });

    // ILM-DIAG: Log full CIDs and Map keys for comparison with ILM queries
    const allKeys = Array.from(this.connectedPeers.keys());
    console.log(`[ILM-DIAG] setPeerConnectedLocal: STORED BIDIRECTIONAL localCid=${localCidBigInt.toString()} ↔ peerCid=${peerCidBigInt.toString()} (local peers: ${localPeerMap.size}, peer peers: ${peerPeerMap.size})`);
    console.log(`[ILM-DIAG] setPeerConnectedLocal: ALL MAP KEYS (${allKeys.length}): ${allKeys.map(k => `${k.toString().slice(0, 8)}...(type=${typeof k})`).join(', ')}`);
  }

  /**
   * Remove a peer from the connected state. Called on PeerDisconnect event.
   * This is an INSTANT update to the single source of truth.
   *
   * IMPORTANT: Removes the relationship BIDIRECTIONALLY.
   * CRITICAL: Ensures CIDs are converted to BigInt for Map operations.
   */
  public setPeerDisconnected(localCid: bigint, peerCid: bigint): void {
    // CRITICAL: Ensure CIDs are BigInt for Map operations
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    // Remove forward direction: localCid → peerCid
    const localPeerMap = this.connectedPeers.get(localCidBigInt);
    if (localPeerMap) {
      localPeerMap.delete(peerCidBigInt);
    }

    // Remove reverse direction: peerCid → localCid
    const peerPeerMap = this.connectedPeers.get(peerCidBigInt);
    if (peerPeerMap) {
      peerPeerMap.delete(localCidBigInt);
    }

    console.log(`[P2PAutoConnect] setPeerDisconnected: ${localCidBigInt.toString().slice(0, 8)} -X- ${peerCidBigInt.toString().slice(0, 8)} (BIDIRECTIONAL)`);
  }

  /**
   * Get peer CIDs for a session. Called by WASM ILM via JavaScript callback.
   * This is the primary interface for WASM to query connection state.
   *
   * CRITICAL: Ensures localCid is converted to BigInt for Map lookup.
   * WASM passes proper BigInt, but this is defensive against mixed types.
   *
   * @param localCid - The local session CID
   * @returns Array of connected peer CIDs as bigints
   */
  public getPeersForSession(localCid: bigint): bigint[] {
    // CRITICAL: Ensure localCid is BigInt for Map lookup (defensive)
    const localCidBigInt = ensureBigInt(localCid);

    const peerMap = this.connectedPeers.get(localCidBigInt);
    if (!peerMap) {
      // ILM-DIAG: Log when no entry exists for the queried CID
      // Include type information to help debug key mismatches
      const allCids = Array.from(this.connectedPeers.keys());
      if (allCids.length > 0) {
        console.warn(`[ILM-DIAG] getPeersForSession: NO ENTRY for CID ${localCidBigInt.toString().slice(0, 8)}... (type=${typeof localCid}→${typeof localCidBigInt}), but connectedPeers has entries for: ${allCids.map(c => `${c.toString().slice(0, 8)}(type=${typeof c})`).join(', ')}`);
      }
      return [];
    }
    return Array.from(peerMap.keys());
  }

  /**
   * Check if a peer is connected for the current session.
   * CRITICAL: Ensures CIDs are converted to BigInt for Map lookup.
   */
  public isPeerConnectedForSession(localCid: bigint, peerCid: bigint): boolean {
    // CRITICAL: Ensure CIDs are BigInt for Map lookup
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    const peerMap = this.connectedPeers.get(localCidBigInt);
    return peerMap?.has(peerCidBigInt) ?? false;
  }

  /**
   * Get connection info for a specific peer.
   * Returns null if the peer is not connected.
   * Used to check connection age for distinguishing fresh vs stale connections.
   */
  public getPeerConnectionInfo(localCid: bigint, peerCid: bigint): PeerConnectionInfo | null {
    const [localCidBigInt, peerCidBigInt] = ensureBigIntPair(localCid, peerCid);

    const peerMap = this.connectedPeers.get(localCidBigInt);
    return peerMap?.get(peerCidBigInt) ?? null;
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

      const currentCid = await this.getCurrentCid();
      if (!currentCid || currentCid === 0n) return;

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
   *
   * IMPORTANT: This method MERGES backend data with event-based connections.
   * It does NOT clear connections that were established via PeerConnectSuccess events.
   * The backend's peer_connections may be stale or not reflect real-time P2P state.
   *
   * Connections are only removed via explicit PeerDisconnect events (see setPeerDisconnected).
   * CRITICAL: Ensures all CIDs are BigInt for consistent Map operations.
   */
  public async refreshFromBackend(localCid: bigint): Promise<void> {
    try {
      // CRITICAL: Ensure localCid is BigInt
      const localCidBigInt = ensureBigInt(localCid);

      const sessions = await connectionManager.getActiveSessions();
      const mySession = sessions.find(s => s.cid === localCidBigInt);

      // Get existing peer map (preserve event-based connections)
      const existingPeerMap = this.connectedPeers.get(localCidBigInt) || new Map<bigint, PeerConnectionInfo>();

      if (!mySession?.peer_connections) {
        // No backend connections, but PRESERVE event-based connections
        // Only set if we don't have an existing map
        if (!this.connectedPeers.has(localCidBigInt)) {
          this.connectedPeers.set(localCidBigInt, new Map());
        }
        // Don't clear existing connections - they came from real-time events
        return;
      }

      // MERGE backend data into existing connections (additive, not replacement)
      const now = Date.now();

      for (const [peerCidStr, info] of Object.entries(mySession.peer_connections)) {
        const peerCidBigInt = BigInt(peerCidStr);
        const existingInfo = existingPeerMap.get(peerCidBigInt);

        // Add or update peer from backend data
        existingPeerMap.set(peerCidBigInt, {
          peerCid: peerCidBigInt,
          peerUsername: (info as any).peer_username || existingInfo?.peerUsername || '',
          connectedAt: existingInfo?.connectedAt || now,
          lastVerified: now,
        });
      }

      this.connectedPeers.set(localCidBigInt, existingPeerMap);
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
        const cid = peer.cid;
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
  public isPeerOnline(peerCid: bigint): boolean {
    return this.onlinePeers.has(peerCid);
  }

  /**
   * Check if a peer's P2P channel is READY for messaging.
   * Channel is ready when we've received at least one P2P message from the peer,
   * proving bidirectional message flow works.
   *
   * This is MORE RELIABLE than isPeerConnected() because:
   * - Connected only means the Map entry exists (protocol handshake done)
   * - Ready means we've proven messages actually flow through the channel
   *
   * @param peerCid - The peer CID to check
   * @returns true if we've received a message from this peer (channel proven ready)
   */
  public isChannelReady(peerCid: bigint): boolean {
    return this.readyChannels.has(peerCid);
  }

  /**
   * Mark a peer's P2P channel as READY for messaging.
   * Called when we receive the first P2P message from a peer, proving the
   * channel is bidirectionally established.
   *
   * Emits 'p2p:channel-ready' event for tests and other consumers that need
   * to wait for actual message flow capability.
   *
   * @param peerCid - The peer CID to mark as ready
   */
  public markChannelReady(peerCid: bigint): void {
    if (!this.readyChannels.has(peerCid)) {
      this.readyChannels.add(peerCid);
      console.log(`[P2P] Channel ready for peer ${peerCid.toString().slice(0, 8)}... (message received)`);
      eventEmitter.emit('p2p:channel-ready', { peerCid });
    }
  }

  /**
   * Check if a peer is currently connected (legacy API using current CID)
   */
  public async isPeerConnected(peerCid: bigint): Promise<boolean> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid) return false;
    return this.isPeerConnectedForSession(currentCid, peerCid);
  }

  /**
   * Get current CID with proper priority for multi-tab support:
   * 1) InstanceManager CID (FIRST - synchronous, set by handleSuccessfulConnection)
   * 2) Tab context selectedCid (IndexedDB - may hang on follower tabs)
   * 3) StoredSession.cid (IndexedDB - may hang on follower tabs)
   * 4) Global connection CID (legacy fallback)
   *
   * CRITICAL: InstanceManager.cid is checked FIRST because:
   * - It's set synchronously in handleSuccessfulConnection (no async delays)
   * - IndexedDB reads can hang indefinitely on follower tabs due to contention
   * - For multi-tab scenarios, instanceManager is the reliable source of truth
   */
  private async getCurrentCid(): Promise<bigint | null> {
    // 1) InstanceManager CID FIRST (bypasses IndexedDB, synchronous)
    const instanceCid = instanceManager.cid;
    if (instanceCid) {
      return instanceCid;
    }

    // 2) Tab context from IndexedDB (with timeout to prevent hangs)
    try {
      const tabSelectionPromise = getSelectedUser();
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      const tabSelection = await Promise.race([tabSelectionPromise, timeout]);
      if (tabSelection?.selectedCid) {
        return tabSelection.selectedCid;
      }
    } catch {
      // Ignore timeout/errors
    }

    // 3) Tab session from stored sessions (with timeout)
    try {
      const tabSessionPromise = connectionManager.getTabSelectedSession();
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      const tabSession = await Promise.race([tabSessionPromise, timeout]);
      if (tabSession?.cid) {
        return tabSession.cid;
      }
    } catch {
      // Ignore timeout/errors
    }

    // 4) Legacy global connection CID
    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.cid || null;
  }

  /**
   * Verify if peer is actually connected in backend (not just in local connectedPeers Map)
   * This handles cases where connectedPeers is stale due to failed PeerConnect attempts
   */
  private async isActuallyConnectedInBackend(currentCid: bigint, peerCid: bigint): Promise<boolean> {
    try {
      const sessions = await connectionManager.getActiveSessions();
      const mySession = sessions.find(s => s.cid === currentCid);
      if (mySession?.peer_connections) {
        // Check if peerCid exists in backend peer_connections
        const peerCidStr = peerCid.toString();
        return Object.keys(mySession.peer_connections).includes(peerCidStr);
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
  public async connectToPeer(peerCid: bigint, forceInitiator: boolean = false): Promise<void> {
    console.log(`[ILM-TRACE] connectToPeer: START peerCid=${peerCid?.toString().slice(0, 8)}, forceInitiator=${forceInitiator}`);

    // DETERMINISTIC FIX: forceInitiator passed as parameter to avoid race condition.
    // The flag is captured synchronously at call site before async execution begins.
    // Previous bug: this.forceInitiatorMode was read here but reset before we executed.
    const shouldForceInitiator = forceInitiator;

    // Only leader tab should initiate P2P connections to prevent duplicate requests from multiple tabs
    if (!instanceManager.isLeader) {
      console.log(`[P2PAutoConnect] connectToPeer skipped for ${peerCid?.toString().slice(0, 8)} (not leader tab)`);
      return;
    }

    const currentCid = await this.getCurrentCid();
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
    // CIDs are already bigint, direct comparison works

    // FORCE INITIATOR MODE: After ClaimSession, the reconnecting user must ALWAYS
    // initiate PeerConnect because the peer doesn't know they've reconnected.
    // This bypasses the deterministic CID check for reconnection scenarios.
    // NOTE: Using captured shouldForceInitiator (captured before any await)
    if (shouldForceInitiator) {
      console.log(`P2PAutoConnect: FORCE INITIATOR MODE - Client ${currentCid.toString().slice(0, 8)}... forcing PeerConnect to ${peerCid.toString().slice(0, 8)}... (ClaimSession reconnection)`);
    } else if (currentCid < peerCid) {
      // We have the lower CID - we are NOT the initiator
      // The peer with the higher CID will call PeerConnect, and we'll receive PeerChannelCreated
      console.log(`P2PAutoConnect: Client ${currentCid.toString().slice(0, 8)}... is NOT the initiator; peer ${peerCid.toString().slice(0, 8)}... has higher CID. Will handle PeerConnect asynchronously when received via PeerChannelCreated.`);
      return;
    } else {
      // We have the higher CID - we ARE the initiator
      console.log(`P2PAutoConnect: Client ${currentCid.toString().slice(0, 8)}... IS the initiator for ${peerCid.toString().slice(0, 8)}... (higher CID): now sending PeerConnect request`);
    }

    // Mark as pending to prevent duplicate attempts
    if (this.pendingConnections.has(peerCid)) {
      console.log(`P2PAutoConnect: Connection to ${peerCid.toString().slice(0, 8)}... already pending, skipping duplicate`);
      return;
    }
    this.pendingConnections.add(peerCid);

    // CRITICAL FIX: Verify local connectedPeers against backend state
    // This handles cases where frontend thinks we're connected but backend doesn't have the channel
    //
    // RACE CONDITION FIX: After PeerConnectSuccess, the connection is stored locally but
    // GetSessionsResponse.peer_connections may not reflect it yet. If connectToAllRegisteredPeers
    // triggers during this window, isActuallyConnectedInBackend returns false and we destroy
    // a valid, fresh connection. Check connection age before backend verification.
    if (this.isPeerConnectedForSession(currentCid, peerCid)) {
      const peerInfo = this.getPeerConnectionInfo(currentCid, peerCid);
      const connectionAge = peerInfo ? Date.now() - peerInfo.connectedAt : Infinity;
      const FRESH_CONNECTION_THRESHOLD_MS = 5000; // 5 seconds

      if (connectionAge < FRESH_CONNECTION_THRESHOLD_MS) {
        // Fresh connection - likely just established via PeerConnectSuccess.
        // Don't verify with backend; the connection is valid but backend may not reflect it yet.
        console.log(`P2PAutoConnect: Connection to ${peerCid.toString().slice(0, 8)}... is fresh (${connectionAge}ms old), skipping backend verification`);
        this.pendingConnections.delete(peerCid);
        return;
      }

      const actuallyConnected = await this.isActuallyConnectedInBackend(currentCid, peerCid);
      if (actuallyConnected) {
        console.log(`P2PAutoConnect: Already connected to ${peerCid.toString().slice(0, 8)}... (verified with backend), skipping`);
        this.pendingConnections.delete(peerCid);
        return;
      } else {
        console.warn(`P2PAutoConnect: Local connectedPeers has ${peerCid.toString().slice(0, 8)}... but backend shows not connected. Re-establishing connection.`);
        this.setPeerDisconnected(currentCid, peerCid);
      }
    }

    const attempt = this.connectionAttempts.get(peerCid) || { attempts: 0, timeout: null };

    // OPTIMIZATION: Use cached online status (non-blocking) - skip if definitely offline
    // If cache says offline, defer; if cache stale or online, try optimistically
    // EXCEPTION: FORCE INITIATOR MODE bypasses this check - after ClaimSession reconnection,
    // the peer might be online but our cache is stale. We must try the connection.
    const isOnline = this.isPeerOnline(peerCid);
    const cacheAge = Date.now() - this.lastOnlineStatusRefresh;
    const cacheValid = cacheAge < this.ONLINE_STATUS_CACHE_TTL;

    if (cacheValid && !isOnline && !shouldForceInitiator) {
      // Cache is fresh and says peer is offline - defer
      console.log(`P2PAutoConnect: Peer ${peerCid.toString().slice(0, 8)}... offline (cached), scheduling next check in ${this.POLL_INTERVAL / 1000}s`);
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
      console.log(`P2PAutoConnect: Attempting connection to ${peerCid.toString().slice(0, 8)}...`);
      console.log(`[ILM-TRACE] connectToPeer: calling openP2PConnection(${currentCid.toString().slice(0, 8)}, ${peerCid.toString().slice(0, 8)})`);
      await websocketService.openP2PConnection(currentCid, peerCid);
      console.log('[ILM-TRACE] connectToPeer: openP2PConnection SUCCESS');

      // Success - handled in event listener (handleConnectionSuccess will remove from pendingConnections)
    } catch (error) {
      console.log(`[ILM-TRACE] connectToPeer: CATCH error=${error}`);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if "Already connected" - this is actually success, not failure
      // The backend returns this when we try to connect to an already-connected peer
      if (errorMessage.includes('Already connected') || errorMessage.includes('already connected')) {
        console.log(`P2PAutoConnect: Peer ${peerCid.toString().slice(0, 8)}... already connected (treating as success)`);
        this.pendingConnections.delete(peerCid);
        this.cancelRetry(peerCid);
        // Mark as connected in local state
        const currentCid = await this.getCurrentCid();
        if (currentCid) {
          this.setPeerConnected(currentCid, peerCid);
        }
        return;
      }

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
        `P2PAutoConnect: Connect failed for ${peerCid.toString().slice(0, 8)}..., ` +
          `retry in ${nextDelay / 1000}s (attempt ${attempt.attempts})`
      );
    }
  }

  /**
   * Connect to all registered peers (on startup or after accept)
   */
  public async connectToAllRegisteredPeers(): Promise<void> {
    const currentCid = await this.getCurrentCid();
    console.log(`[ILM-TRACE] connectToAllRegisteredPeers: currentCid=${currentCid?.toString().slice(0, 8) || 'null'}`);

    // Skip silently if no valid user session (CID 0n is service connection)
    if (!currentCid || currentCid === 0n) {
      console.log('[ILM-TRACE] connectToAllRegisteredPeers: SKIPPED - no valid CID');
      return;
    }

    // OPTIMIZATION: Kick off non-blocking online status refresh (uses caching internally)
    // Each connectToPeer() will use cached status or try optimistically
    this.refreshOnlineStatus().catch(() => {}); // Fire-and-forget
    console.log(`[ILM-TRACE] connectToAllRegisteredPeers: onlinePeers=${Array.from(this.onlinePeers).map(c => c.toString().slice(0, 8)).join(',')}`);

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

    // CRITICAL: Capture forceInitiatorMode SYNCHRONOUSLY before launching async calls.
    // This fixes the race condition where the flag was reset before connectToPeer() bodies executed.
    const shouldForceInitiator = this.forceInitiatorMode;

    // Launch connections in parallel (each handles its own retries)
    console.log(`[ILM-TRACE] connectToAllRegisteredPeers: launching connections to ${registeredPeers.length} peers, forceInitiator=${shouldForceInitiator}`);
    for (const peer of registeredPeers) {
      const peerCid = peer.cid;
      console.log(`[ILM-TRACE] Peer: cid=${peerCid?.toString().slice(0, 8)}, currentCid=${currentCid?.toString().slice(0, 8)}, skip=${peerCid === currentCid}`);
      if (peerCid && peerCid !== currentCid) {
        // Don't await - let each run independently
        // Pass forceInitiator explicitly to avoid race condition with flag reset
        this.connectToPeer(peerCid, shouldForceInitiator).catch((err) => {
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
  private async getRegisteredPeersViaGetSessions(currentCid: bigint): Promise<any[]> {
    try {
      const sessions = await connectionManager.getActiveSessions();
      const mySession = sessions.find(s => s.cid === currentCid);

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
      for (const [peerCidStr, peerInfo] of Object.entries(mySession.peer_connections)) {
        peers.push({
          cid: BigInt(peerCidStr),
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
  private handleConnectionSuccess(localCid: bigint, peerCid: bigint, peerUsername: string = ''): void {
    this.setPeerConnected(localCid, peerCid, peerUsername);
    this.pendingConnections.delete(peerCid); // Connection complete, no longer pending
    this.cancelRetry(peerCid);
    console.log(`P2PAutoConnect: Connected to ${peerCid.toString().slice(0, 8)}...`);
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
    // FIXED: notification.cid is TARGET (us), notification.peer_cid is INITIATOR (them)
    // CIDs come as bigint from WASM
    const targetCid: bigint | undefined = notification.cid;
    const initiatorCid: bigint | undefined = notification.peer_cid;
    const peerUsername = notification.peer_username || '';

    if (initiatorCid === undefined || targetCid === undefined) {
      console.warn('P2PAutoConnect: Invalid PeerConnectNotification - missing cid or peer_cid');
      return;
    }

    // CRITICAL: Filter by CID - only process if WE are the TARGET (cid matches our CID)
    // The notification is broadcast to all WebSocket clients, so we must filter
    const currentCid = await this.getCurrentCid();

    if (!currentCid) {
      console.warn('P2PAutoConnect: No current CID, cannot process incoming connection');
      return;
    }

    // We should only process this if WE are the target (cid matches our CID)
    if (targetCid !== currentCid) {
      console.log(`P2PAutoConnect: Ignoring PeerConnectNotification - target is ${targetCid.toString().slice(0, 8)}... (we are ${currentCid.toString().slice(0, 8)}...)`);
      return;
    }

    // Check if already connected to the initiator
    // CRITICAL FIX: Verify with backend - local connectedPeers may be stale after TCP drop with orphan mode
    // When a peer TCP drops, PeerDisconnect is NOT sent (session is orphaned), so our connectedPeers
    // still has the peer. When they reconnect and send PeerConnect, we must check backend state.
    //
    // RACE CONDITION FIX: The event listener for PeerConnectNotification calls setPeerConnected()
    // BEFORE this handler runs (to update the leader's central Map for ILM visibility).
    // If we check isPeerConnectedForSession here, it returns true for the fresh connection we just stored.
    // The backend check then fails (backend hasn't processed the connection yet), and we remove
    // the entry, causing a race where ILM sees 0 peers during the brief window before re-storing.
    //
    // Solution: Check the connection age. If stored within last 5 seconds, it's a fresh connection
    // being established right now (likely from the event listener above), not stale from TCP drop.
    if (this.isPeerConnectedForSession(currentCid, initiatorCid)) {
      // Check connection age to distinguish fresh vs stale
      const peerInfo = this.getPeerConnectionInfo(currentCid, initiatorCid);
      const connectionAge = peerInfo ? Date.now() - peerInfo.connectedAt : Infinity;
      const FRESH_CONNECTION_THRESHOLD_MS = 5000; // 5 seconds

      if (connectionAge < FRESH_CONNECTION_THRESHOLD_MS) {
        // Fresh connection - likely just stored by the event listener above.
        // Don't do backend check or remove; the connection is being established right now.
        console.log(`P2PAutoConnect: Connection to ${initiatorCid.toString().slice(0, 8)}... is fresh (${connectionAge}ms old), skipping backend verification`);
      } else {
        // Older connection - could be stale from TCP drop. Verify with backend.
        const actuallyConnected = await this.isActuallyConnectedInBackend(currentCid, initiatorCid);
        if (actuallyConnected) {
          console.log(`P2PAutoConnect: Already connected to ${initiatorCid.toString().slice(0, 8)}... (verified with backend), skipping accept`);
          return;
        } else {
          console.warn(`P2PAutoConnect: Local connectedPeers has ${initiatorCid.toString().slice(0, 8)}... but backend shows not connected. Stale from TCP drop - accepting new connection.`);
          this.setPeerDisconnected(currentCid, initiatorCid);
        }
      }
    }

    // Check if we have a pending outgoing connection to the initiator (SIMULTANEOUS_CONNECT)
    // IMPORTANT: We MUST still call acceptPeerConnect even in this case!
    // Otherwise the initiator's channel is never completed and messages are lost.
    const isSimultaneousConnect = this.pendingConnections.has(initiatorCid);
    if (isSimultaneousConnect) {
      console.log(`P2PAutoConnect: SIMULTANEOUS_CONNECT detected for ${initiatorCid.toString().slice(0, 8)}... - will accept their connection too`);
      this.pendingConnections.delete(initiatorCid);
      this.cancelRetry(initiatorCid);
      // Don't return - fall through to accept the connection
    }

    // Mark initiator as connected - INSTANT update
    this.setPeerConnected(currentCid, initiatorCid, peerUsername);
    this.cancelRetry(initiatorCid);
    console.log(`P2PAutoConnect: Incoming connection from ${initiatorCid.toString().slice(0, 8)}... (they initiated)`);

    try {
      // Accept the incoming connection - this completes the handshake
      // The SDK's responses::peer_connect handles the bidirectional channel
      console.log(`P2PAutoConnect: Sending PeerConnectAccept for ${initiatorCid.toString().slice(0, 8)}...`);
      await websocketService.acceptPeerConnect(currentCid, initiatorCid, notification);
      console.log(`P2PAutoConnect: PeerConnectAccept sent for ${initiatorCid.toString().slice(0, 8)}...`);
      eventEmitter.emit('p2p-connection-established', { peerCid: initiatorCid });
    } catch (error) {
      const errMsg = String(error);
      if (errMsg.includes('already connected') || errMsg.includes('Already connected')) {
        console.log(`P2PAutoConnect: Channel already exists for ${initiatorCid.toString().slice(0, 8)}...`);
        eventEmitter.emit('p2p-connection-established', { peerCid: initiatorCid });
      } else {
        console.warn(`P2PAutoConnect: Failed to accept connection from ${initiatorCid.toString().slice(0, 8)}...:`, error);
        // Remove from connected since accept failed
        this.setPeerDisconnected(currentCid, initiatorCid);
      }
    }
  }

  /**
   * Handle peer disconnect - INSTANT update to single source of truth
   */
  public handlePeerDisconnect(localCid: bigint, peerCid: bigint): void {
    this.setPeerDisconnected(localCid, peerCid);
    this.pendingConnections.delete(peerCid);
    console.log(`P2PAutoConnect: Peer ${peerCid.toString().slice(0, 8)}... disconnected`);
    eventEmitter.emit('p2p-connection-lost', { peerCid });
  }

  /**
   * Clear a peer from connected state (without emitting events).
   * Used by P2PMessengerManager when verifying stale connection state against backend.
   */
  public async clearPeerFromConnected(peerCid: bigint): Promise<void> {
    const currentCid = await this.getCurrentCid();
    if (currentCid) {
      this.setPeerDisconnected(currentCid, peerCid);
    }
    this.pendingConnections.delete(peerCid);
    console.log(`P2PAutoConnect: Cleared stale connection for ${peerCid.toString().slice(0, 8)}...`);
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
  public async resetConnectionState(): Promise<void> {
    const currentCid = await this.getCurrentCid();
    const peerCount = currentCid ? (this.connectedPeers.get(currentCid)?.size ?? 0) : 0;

    console.log(`[ILM-TRACE] P2PAutoConnect: Resetting connection state for reconnection`);
    console.log(`[ILM-TRACE] P2PAutoConnect: Clearing ${peerCount} connected, ${this.pendingConnections.size} pending`);

    if (currentCid) {
      this.connectedPeers.set(currentCid, new Map());
    }
    this.pendingConnections.clear();
    this.cancelAllRetries();

    // CRITICAL: Invalidate peer online status cache
    // After ClaimSession, the cached online status is stale - peers that were
    // marked offline before the TCP drop may now be online. By clearing the
    // cache, we force a fresh query on the next connection attempt.
    this.onlinePeers.clear();
    this.lastOnlineStatusRefresh = 0;
    console.log('[ILM-TRACE] P2PAutoConnect: Cleared peer online status cache for reconnection');

    // CRITICAL: Clear channel ready state on reconnection
    // After ClaimSession/Login, channels need to be re-proven as "ready"
    // (receiving a message proves bidirectional flow works)
    this.readyChannels.clear();
    console.log('[ILM-TRACE] P2PAutoConnect: Cleared channel ready state for reconnection');

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
  public cancelRetry(peerCid: bigint): void {
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
  public async getConnectedPeers(): Promise<bigint[]> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid) return [];
    return this.getPeersForSession(currentCid);
  }

  /**
   * Get list of online peer CIDs
   */
  public getOnlinePeers(): bigint[] {
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
  public async ensurePeerConnectedInBackground(peerCid: bigint): Promise<void> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid || currentCid === peerCid) {
      return;
    }

    // Already connected - nothing to do
    if (this.isPeerConnectedForSession(currentCid, peerCid)) {
      console.log(`P2PAutoConnect: Peer ${peerCid.toString().slice(0, 8)}... already connected`);
      return;
    }

    // Already attempting connection - don't start another
    if (this.connectionAttempts.has(peerCid)) {
      console.log(`P2PAutoConnect: Connection attempt already in progress for ${peerCid.toString().slice(0, 8)}...`);
      return;
    }

    // Start connection in background (don't await)
    console.log(`P2PAutoConnect: Starting background connection to ${peerCid.toString().slice(0, 8)}...`);
    this.connectToPeer(peerCid).catch((err) => {
      console.error(`P2PAutoConnect: Background connection failed for ${peerCid.toString().slice(0, 8)}...:`, err);
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
  public async waitForPeerConnected(peerCid: bigint, timeoutMs = 30000): Promise<boolean> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid) return false;

    // Already connected
    if (this.isPeerConnectedForSession(currentCid, peerCid)) {
      return true;
    }

    // Start background connection attempt
    await this.ensurePeerConnectedInBackground(peerCid);

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
          console.warn(`P2PAutoConnect: Timeout waiting for ${peerCid.toString().slice(0, 8)}... to connect`);
          resolve(false);
        }
      }, 500);

      // Also listen for event
      const handler = ({ peerCid: connectedPeerCid }: { peerCid: bigint }) => {
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
