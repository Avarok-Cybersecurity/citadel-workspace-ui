import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { connectionManager } from './connection';
import { getSelectedUser } from './tab-context';
import { peerRegistrationStore } from './peer-registration-store';
import { broadcastChannelService } from './broadcast-channel-service';
import { instanceManager } from './multi-instance';
import { stringToBytes, bytesToString } from './utils/encoding-utils';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import type {
  InternalServiceRequest,
  InternalServiceResponse
} from 'citadel-workspace-client-ts';
// Import and re-export security types from central location (DRY)
import {
  type SessionSecuritySettings,
  type HeaderObfuscatorSettings,
  getDefaultSecuritySettings
} from './security-utils';
import { debugLog } from '@/lib/debug-config';

// Re-export for backward compatibility
export type { SessionSecuritySettings, HeaderObfuscatorSettings };

export interface Peer {
  cid: bigint;
  username: string;
  fullName: string;
  isOnline: boolean;
  isRegistered: boolean;
}

export interface PeerRegistrationOptions {
  autoRegisterAll?: boolean;
  sessionSecuritySettings?: SessionSecuritySettings;
  connectAfterRegister?: boolean;
}

/**
 * P2P Registration Service
 *
 * Handles automatic peer discovery and registration for P2P communication.
 * This service periodically checks for available peers and registers them
 * to enable P2P messaging.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        CID LIFECYCLE - CRITICAL INFO                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║ CID (Client ID) is PERMANENT per account. Once assigned during C2S          ║
 * ║ registration, it NEVER changes. Login/ClaimSession preserve the same CID.   ║
 * ║                                                                              ║
 * ║ | Operation              | CID Behavior                                     |║
 * ║ |------------------------|--------------------------------------------------|║
 * ║ | Register (new account) | NEW CID assigned                                 |║
 * ║ | Login (credentials)    | SAME CID preserved                               |║
 * ║ | ClaimSession (orphan)  | SAME CID preserved                               |║
 * ║                                                                              ║
 * ║ KEY IMPLICATIONS FOR P2P:                                                    ║
 * ║ - P2P registrations are stored by CID pairs - they persist across sessions  ║
 * ║ - After disconnect/reconnect, server still has the peer registration        ║
 * ║ - "Peer already registered" is NOT an error - it's expected after reconnect ║
 * ║ - Local state may be stale after reconnect, but server state is correct     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
export class P2PRegistrationService {
  private static instance: P2PRegistrationService;
  private isRunning = false;
  private registeredPeers = new Map<bigint, Peer>();
  private allPeers = new Map<bigint, Peer>();
  private pollingInterval: NodeJS.Timeout | null = null;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
  // Track outgoing registrations separately (peers WE registered with, not who registered with us)
  private outgoingRegistrations = new Set<bigint>();
  // Track incoming registrations (peers who registered WITH us)
  private incomingRegistrations = new Set<bigint>();
  // Guard to prevent concurrent checkAndRegisterPeers calls (prevents UI freezing from stacked operations)
  private isCheckingPeers = false;

  // Default polling interval (30 seconds)
  private readonly POLLING_INTERVAL = 30000;

  // Timeout for peer listing operations - must be longer than backend SDK timeout (5s)
  // to avoid frontend timing out while backend is still processing
  private readonly PEER_LIST_TIMEOUT = 6000;

  // LocalDB key for auto-accept setting
  private static readonly AUTO_ACCEPT_KEY = 'p2p_auto_accept_registrations';
  
  // Default session security settings for P2P (from shared utils)
  private readonly DEFAULT_SESSION_SECURITY = getDefaultSecuritySettings();

  private constructor() {
    this.setupEventListeners();
  }

  /**
   * Get current CID with proper priority for multi-tab support:
   * 1) InstanceManager CID (FIRST - synchronous, set by handleSuccessfulConnection)
   * 2) Tab context selectedCid (IndexedDB - may hang on follower tabs)
   * 3) Tab session CID (IndexedDB - may hang on follower tabs)
   * 4) Global connection CID (legacy fallback)
   *
   * CRITICAL: InstanceManager.cid is checked FIRST because:
   * - It's set synchronously in handleSuccessfulConnection (no async delays)
   * - IndexedDB reads can hang indefinitely on follower tabs due to contention
   * - For multi-tab scenarios, instanceManager is the reliable source of truth
   */
  private async getCurrentCid(): Promise<bigint | null> {
    // 1) InstanceManager CID FIRST (bypasses IndexedDB, synchronous)
    // This is the most reliable source for follower tabs
    const instanceCid = instanceManager.cid;
    debugLog('P2pRegistrationService', `[P2P] getCurrentCid: instanceManager.cid=${instanceCid?.toString() ?? 'null'}`);
    if (instanceCid) {
      debugLog('P2pRegistrationService', `[P2P] getCurrentCid: Using instanceManager.cid (primary): ${instanceCid}`);
      return instanceCid;
    }

    // 2) Tab context from IndexedDB (only if instanceManager doesn't have CID yet)
    // This helps during initial load before connection is established
    try {
      const tabSelectionPromise = getSelectedUser();
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      const tabSelection = await Promise.race([tabSelectionPromise, timeout]);
      debugLog('P2pRegistrationService', `[P2P] getCurrentCid: tabSelection=${JSON.stringify(tabSelection ? { selectedCid: tabSelection.selectedCid?.toString() } : null)}`);
      if (tabSelection?.selectedCid) {
        debugLog('P2pRegistrationService', `[P2P] getCurrentCid: Using tabSelection.selectedCid: ${tabSelection.selectedCid}`);
        return tabSelection.selectedCid;
      }
    } catch (e) {
      console.warn('[P2P] getCurrentCid: getSelectedUser failed:', e);
    }

    // 3) Tab session from stored sessions (with timeout to prevent hangs)
    try {
      const tabSessionPromise = connectionManager.getTabSelectedSession();
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
      const tabSession = await Promise.race([tabSessionPromise, timeout]);
      debugLog('P2pRegistrationService', `[P2P] getCurrentCid: tabSession=${tabSession ? { cid: tabSession.cid?.toString() } : null}`);
      if (tabSession?.cid) {
        debugLog('P2pRegistrationService', `[P2P] getCurrentCid: Using tabSession.cid: ${tabSession.cid}`);
        return tabSession.cid;
      }
    } catch (e) {
      console.warn('[P2P] getCurrentCid: getTabSelectedSession failed:', e);
    }

    // 4) Legacy global connection CID
    const connectionInfo = connectionManager.getConnectionInfo();
    debugLog('P2pRegistrationService', `[P2P] getCurrentCid: connectionInfo=${connectionInfo ? { cid: connectionInfo.cid?.toString() } : null}`);
    return connectionInfo?.cid || null;
  }

  public static getInstance(): P2PRegistrationService {
    if (!P2PRegistrationService.instance) {
      P2PRegistrationService.instance = new P2PRegistrationService();
    }
    return P2PRegistrationService.instance;
  }

  private setupEventListeners(): void {
    // Listen for WebSocket messages
    eventEmitter.on('websocket-message', (message: any) => {
      this.handleWebSocketMessage(message);
    });

    // Listen for connection status changes
    eventEmitter.on('connection:status-changed', async ({ isConnected }: { isConnected: boolean }) => {
      if (isConnected && this.isRunning) {
        // Resume auto-registration when connection is restored
        await this.checkAndRegisterPeers();
      }
    });

    // Listen for registeredPeers updates from leader (for follower tabs)
    // This allows follower tabs to have synchronized registeredPeers state
    // so the sidebar shows peers registered by the leader
    eventEmitter.on('broadcast-state-sync', (data: any) => {
      if (data?.type === 'registered-peer-update' && !instanceManager.isLeader) {
        const { peerCid, peerUsername, isOutgoing, isIncoming } = data;
        if (peerCid !== undefined) {
          const peerCidBigInt = BigInt(peerCid);
          debugLog('P2pRegistrationService', `[P2P-SYNC] Follower received registeredPeers update: ${peerCidBigInt.toString().slice(0, 8)}... (${peerUsername})`);
          // Store locally without re-broadcasting (we're a follower)
          this.setPeerRegisteredLocal(peerCidBigInt, peerUsername || '', isOutgoing, isIncoming);
          // Emit event to trigger sidebar refresh on follower tabs
          const peer: Peer = {
            cid: peerCidBigInt,
            username: peerUsername || `User ${peerCidBigInt.toString().slice(0, 8)}`,
            fullName: peerUsername || `User ${peerCidBigInt.toString().slice(0, 8)}`,
            isOnline: true,
            isRegistered: true
          };
          eventEmitter.emit('p2p:peer-registered', { peer, isOutgoing, isIncoming, fromBroadcast: true });
        }
      }
    });
  }

  /**
   * Set a peer as registered locally without broadcasting (used by followers).
   */
  private setPeerRegisteredLocal(peerCid: bigint, peerUsername: string, isOutgoing?: boolean, isIncoming?: boolean): void {
    const peer: Peer = this.allPeers.get(peerCid) || {
      cid: peerCid,
      username: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      fullName: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      isOnline: true,
      isRegistered: true
    };
    peer.isRegistered = true;
    if (peerUsername && peerUsername !== 'Unknown' && !peerUsername.startsWith('User ')) {
      peer.username = peerUsername;
      peer.fullName = peerUsername;
    }
    this.registeredPeers.set(peerCid, peer);
    if (!this.allPeers.has(peerCid)) {
      this.allPeers.set(peerCid, peer);
    }
    if (isOutgoing) {
      this.outgoingRegistrations.add(peerCid);
    }
    if (isIncoming) {
      this.incomingRegistrations.add(peerCid);
    }
  }

  private handleWebSocketMessage(message: any): void {
    if (message.ListAllPeersResponse) {
      const requestId = message.ListAllPeersResponse.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message.ListAllPeersResponse);
        this.pendingRequests.delete(requestId);
      }
    } else if (message.ListAllPeersFailure) {
      const requestId = message.ListAllPeersFailure.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error(message.ListAllPeersFailure.message || 'Failed to list peers'));
        this.pendingRequests.delete(requestId);
      }
    } else if (message.ListRegisteredPeersResponse) {
      const requestId = message.ListRegisteredPeersResponse.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message.ListRegisteredPeersResponse);
        this.pendingRequests.delete(requestId);
      }
    } else if (message.ListRegisteredPeersFailure) {
      const requestId = message.ListRegisteredPeersFailure.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error(message.ListRegisteredPeersFailure.message || 'Failed to list registered peers'));
        this.pendingRequests.delete(requestId);
      }
    } else if (message.PeerRegisterSuccess) {
      const requestId = message.PeerRegisterSuccess.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message.PeerRegisterSuccess);
        this.pendingRequests.delete(requestId);
      }

      // Update peer registration status
      const peerCid: bigint | undefined = message.PeerRegisterSuccess.peer_cid;
      const peerUsername: string | undefined = message.PeerRegisterSuccess.peer_username;
      if (peerCid !== undefined) {
        // Track this as an OUTGOING registration (WE registered with them)
        this.outgoingRegistrations.add(peerCid);

        // CRITICAL FIX: Create peer if not in allPeers, similar to "already registered" handler
        // This ensures registeredPeers is populated even if allPeers hasn't been updated yet
        const peer = this.allPeers.get(peerCid) || {
          cid: peerCid,
          username: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
          fullName: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
          isOnline: true,
          isRegistered: true
        };
        peer.isRegistered = true;
        // Update username if we got it from the response (backend provides peer_username)
        if (peerUsername && (peer.username === 'Unknown' || peer.username.startsWith('User '))) {
          peer.username = peerUsername;
          peer.fullName = peerUsername;
        }
        this.registeredPeers.set(peerCid, peer);
        // Also add to allPeers if not present
        if (!this.allPeers.has(peerCid)) {
          this.allPeers.set(peerCid, peer);
        }
        eventEmitter.emit('p2p:peer-registered', { peer, isOutgoing: true });

        // Broadcast to followers so their sidebar shows the registered peer
        if (instanceManager.isLeader) {
          debugLog('P2pRegistrationService', `[P2P-SYNC] Leader broadcasting registeredPeers update to followers: ${peerCid.toString().slice(0, 8)}...`);
          broadcastChannelService.broadcastStateSync({
            type: 'registered-peer-update',
            peerCid: peerCid.toString(),
            peerUsername: peer.username,
            isOutgoing: true,
          });
        }
      }
    } else if (message.PeerRegisterFailure) {
      const requestId = message.PeerRegisterFailure.request_id;
      const errorMsg = message.PeerRegisterFailure.message || 'Failed to register peer';
      const peerCid: bigint | undefined = message.PeerRegisterFailure.peer_cid;
      const pending = this.pendingRequests.get(requestId);

      // CRITICAL FIX: "Peer already registered" is NOT an error - it means the registration
      // already exists on the server. Treat it as success and update local state.
      // This happens when:
      // 1. User reconnects after disconnect - peer relationship persists on server
      // 2. Multiple tabs try to register the same peer
      // 3. Registration completed in background before explicit request
      if (errorMsg.includes('already registered')) {
        debugLog('P2pRegistrationService', `[P2P] Peer ${peerCid?.toString()} already registered on server - treating as success`);

        // Update local state to reflect the existing registration
        if (peerCid !== undefined) {
          this.outgoingRegistrations.add(peerCid);
          const peer = this.allPeers.get(peerCid) || {
            cid: peerCid,
            username: `User ${peerCid.toString().slice(0, 8)}`,
            fullName: `User ${peerCid.toString().slice(0, 8)}`,
            isOnline: true,
            isRegistered: true
          };
          peer.isRegistered = true;
          this.registeredPeers.set(peerCid, peer);
          eventEmitter.emit('p2p:peer-registered', { peer, isOutgoing: true, wasAlreadyRegistered: true });

          // Broadcast to followers so their sidebar shows the registered peer
          if (instanceManager.isLeader) {
            debugLog('P2pRegistrationService', `[P2P-SYNC] Leader broadcasting registeredPeers (already registered) to followers: ${peerCid.toString().slice(0, 8)}...`);
            broadcastChannelService.broadcastStateSync({
              type: 'registered-peer-update',
              peerCid: peerCid.toString(),
              peerUsername: peer.username,
              isOutgoing: true,
            });
          }
        }

        // Resolve the pending request as success (not reject!)
        if (pending) {
          pending.resolve({ peer_cid: peerCid, already_registered: true });
          this.pendingRequests.delete(requestId);
        }
      } else {
        // Real error - reject the promise
        if (pending) {
          pending.reject(new Error(errorMsg));
          this.pendingRequests.delete(requestId);
        }
      }
    } else if (message.PeerRegisterNotification) {
      // Handle notification when another peer registers with us
      // NOTE: In PeerRegisterNotification (from peer_event.rs):
      //   - `cid` is OUR CID (the recipient receiving the notification)
      //   - `peer_cid` is the CID of the peer who registered WITH us (the sender)
      const notificationCid: bigint | undefined = message.PeerRegisterNotification.cid;
      const peerCid: bigint | undefined = message.PeerRegisterNotification.peer_cid;
      const peerUsername = message.PeerRegisterNotification.peer_username;

      debugLog('P2pRegistrationService', '[P2P] Peer registered with us:', {
        cid: notificationCid?.toString(),
        peer_cid: peerCid?.toString(),
        peer_username: peerUsername,
        request_id: message.PeerRegisterNotification.request_id
      });

      if (peerCid !== undefined && notificationCid !== undefined) {
        // 1. Add peer to local registeredPeers map so we can send messages back
        const peer = this.allPeers.get(peerCid) || {
          cid: peerCid,
          username: peerUsername || 'Unknown',
          fullName: peerUsername || 'Unknown User',
          isOnline: true,
          isRegistered: false
        };
        peer.isRegistered = true;
        this.registeredPeers.set(peerCid, peer);

        // 2. Emit event so UI updates (enables input field)
        eventEmitter.emit('p2p:peer-registered', { peer, isIncoming: true });

        // 2.5. Broadcast to followers so their sidebar shows the registered peer
        if (instanceManager.isLeader) {
          debugLog('P2pRegistrationService', `[P2P-SYNC] Leader broadcasting registeredPeers (notification) to followers: ${peerCid.toString().slice(0, 8)}...`);
          broadcastChannelService.broadcastStateSync({
            type: 'registered-peer-update',
            peerCid: peerCid.toString(),
            peerUsername: peer.username,
            isIncoming: true,
          });
        }

        // 3. Check auto-accept setting to determine how to handle the registration
        // CRITICAL: Use notificationCid (recipient's CID from notification) instead of getCurrentCid()
        // This ensures correct behavior in multi-tab scenarios
        this.handleIncomingRegistrationWithCid(notificationCid, peerCid, peerUsername).catch(error => {
          console.error('[P2P] Failed to handle incoming registration:', error);
        });
      }

      // Also emit the original notification event for other listeners
      eventEmitter.emit('p2p:peer-registered-with-us', {
        peerCid,
        peerUsername
      });
    }
  }

  /**
   * Handle incoming registration - uses notification's cid (recipient) instead of getCurrentCid()
   * This ensures correct behavior in multi-tab scenarios where getCurrentCid() might return wrong tab's CID
   */
  private async handleIncomingRegistrationWithCid(notificationCid: bigint, peerCid: bigint, peerUsername?: string): Promise<void> {
    // CRITICAL: Pass notificationCid to getAutoAcceptSetting instead of letting it fetch via getCurrentCid()
    // getCurrentCid() uses getSelectedUser() which can hang if IndexedDB is in a bad state
    const autoAccept = await this.getAutoAcceptSetting(notificationCid);

    if (autoAccept) {
      // Auto-accept: Register back automatically
      debugLog('P2pRegistrationService', `[P2P] Auto-accepting registration from ${peerUsername || peerCid.toString()}`);
      await this.acceptRegistrationRequest(peerCid, peerUsername);
    } else {
      // Manual: Add to pending requests for user approval
      // Use the notification's cid (recipient's CID) instead of getCurrentCid()
      // This is critical for multi-tab scenarios where getCurrentCid() might return wrong tab's CID
      debugLog('P2pRegistrationService', `[P2P] Adding registration from ${peerUsername || peerCid.toString()} to pending requests (recipient: ${notificationCid.toString()})`);
      debugLog('P2pRegistrationService', '[P2P] DEBUG: peerRegistrationStore exists:', !!peerRegistrationStore);
      debugLog('P2pRegistrationService', '[P2P] DEBUG: handleIncomingRequest type:', typeof peerRegistrationStore?.handleIncomingRequest);
      try {
        await peerRegistrationStore.handleIncomingRequest({
          cid: notificationCid,
          peer_cid: peerCid,
          peer_username: peerUsername
        });
        debugLog('P2pRegistrationService', '[P2P] DEBUG: handleIncomingRequest completed successfully');
      } catch (error) {
        console.error('[P2P] DEBUG: handleIncomingRequest threw error:', error);
        throw error;
      }
    }
  }

  /**
   * Start the auto-registration service
   */
  public async start(options: PeerRegistrationOptions = {}): Promise<void> {
    if (this.isRunning) {
      debugLog('P2pRegistrationService', 'P2P Registration Service already running');
      return;
    }

    const connectionInfo = connectionManager.getConnectionInfo();
    if (!connectionInfo?.cid) {
      throw new Error('No active connection. Please connect first.');
    }

    this.isRunning = true;
    debugLog('P2pRegistrationService', 'Starting P2P Registration Service');

    // Do initial check
    await this.checkAndRegisterPeers(options);

    // Start polling
    this.pollingInterval = setInterval(() => {
      runAsyncSetup(async () => {
        await this.checkAndRegisterPeers(options);
      });
    }, this.POLLING_INTERVAL);

    eventEmitter.emit('p2p:registration-service-started');
  }

  /**
   * Stop the auto-registration service
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    debugLog('P2pRegistrationService', 'Stopped P2P Registration Service');
    eventEmitter.emit('p2p:registration-service-stopped');
  }

  /**
   * Check for peers and register them if needed
   * Uses isCheckingPeers guard to prevent concurrent calls from stacking up (prevents UI freeze)
   */
  private async checkAndRegisterPeers(options: PeerRegistrationOptions = {}): Promise<void> {
    // Guard: prevent concurrent calls from stacking up (prevents UI freeze)
    if (this.isCheckingPeers) {
      debugLog('P2pRegistrationService', '[P2P] Skipping peer check - previous check still in progress');
      return;
    }
    this.isCheckingPeers = true;

    try {
      // Get all available peers
      const allPeers = await this.listAllPeers();

      // Get currently registered peers (with retry logic for reliability)
      const registeredPeers = await this.listRegisteredPeersWithRetry();

      // Update our peer maps
      this.updatePeerMaps(allPeers, registeredPeers);

      // Auto-register peers if enabled
      if (options.autoRegisterAll) {
        await this.registerUnregisteredPeers(options);
      }

      // Emit updated peer list
      eventEmitter.emit('p2p:peers-updated', {
        allPeers: Array.from(this.allPeers.values()),
        registeredPeers: Array.from(this.registeredPeers.values())
      });
    } catch (error: any) {
      // Skip silently if there's no valid user session (expected when not logged in)
      if (error?.message?.includes('CID 0') || error?.message?.includes('No active')) {
        // This is expected when user is not logged in - don't spam the console
        return;
      }
      console.error('Error checking and registering peers:', error);
    } finally {
      this.isCheckingPeers = false;
    }
  }

  /**
   * List all available peers in the network
   */
  public async listAllPeers(): Promise<any[]> {
    // Use getCurrentCid() for proper multi-tab support
    const currentCid = await this.getCurrentCid();
    // CID 0 is the service connection, not a user session - skip P2P requests
    if (!currentCid || currentCid === 0n) {
      throw new Error('No active user session (CID 0 is service connection)');
    }

    const requestId = crypto.randomUUID();
    // Register request for cross-tab response routing
    broadcastChannelService.registerRequest(requestId, currentCid);

    const request: InternalServiceRequest = {
      ListAllPeers: {
        request_id: requestId,
        cid: currentCid // Use the tab-aware CID
      }
    };

    const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Fail fast timeout to prevent UI freeze (was 10s, now 3s)
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          broadcastChannelService.clearRequest(requestId);
          reject(new Error('ListAllPeers request timed out'));
        }
      }, this.PEER_LIST_TIMEOUT);
    });

    await websocketService.sendMessage(request);
    const response = await responsePromise;

    // Convert Record<string, PeerInformation> to array
    const peerInfo = response.peer_information || {};
    return Object.values(peerInfo);
  }

  /**
   * List currently registered peers with retry logic
   * Reduced retries and backoff to prevent UI freeze (was 3 retries with 1-3s backoff = up to 12s)
   */
  public async listRegisteredPeersWithRetry(maxRetries = 2): Promise<any[]> {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.listRegisteredPeers();
      } catch (error: any) {
        lastError = error;
        if (!error?.message?.includes('timed out')) {
          throw error; // Non-timeout errors propagate immediately
        }
        console.warn(`[P2P] ListRegisteredPeers attempt ${i + 1}/${maxRetries} timed out, retrying...`);
        await new Promise(r => setTimeout(r, 500)); // Fixed 500ms backoff (was 1-3s)
      }
    }
    throw lastError || new Error('ListRegisteredPeers failed after retries');
  }

  /**
   * List currently registered peers (single attempt)
   */
  public async listRegisteredPeers(): Promise<any[]> {
    debugLog('P2pRegistrationService', '[P2P] listRegisteredPeers: called');
    // Use getCurrentCid() for proper multi-tab support
    const currentCid = await this.getCurrentCid();
    debugLog('P2pRegistrationService', `[P2P] listRegisteredPeers: currentCid=${currentCid?.toString() ?? 'null'}`);
    // CID 0 is the service connection, not a user session - skip P2P requests
    if (!currentCid || currentCid === 0n) {
      console.warn('[P2P] listRegisteredPeers: No active user session, CID is null or 0');
      throw new Error('No active user session (CID 0 is service connection)');
    }

    const requestId = crypto.randomUUID();
    // Register request for cross-tab response routing
    broadcastChannelService.registerRequest(requestId, currentCid);

    const request: InternalServiceRequest = {
      ListRegisteredPeers: {
        request_id: requestId,
        cid: currentCid // Use the tab-aware CID
      }
    };

    const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Fail fast timeout to prevent UI freeze (was 10s, now 3s)
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          broadcastChannelService.clearRequest(requestId);
          reject(new Error('ListRegisteredPeers request timed out'));
        }
      }, this.PEER_LIST_TIMEOUT);
    });

    await websocketService.sendMessage(request);
    const response = await responsePromise;

    // DEBUG: Log the raw response to understand the structure (use P2P prefix to match test filter)
    debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] Raw response:', JSON.stringify(response, (k, v) => typeof v === 'bigint' ? v.toString() : v));
    debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] response.peers type:', typeof response.peers);
    debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] response.peers instanceof Map:', response.peers instanceof Map);
    debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] response.peers keys:', response.peers ? Object.keys(response.peers) : 'N/A');

    // Convert peers to array - handle both Map and Object formats
    // Rust HashMap<u64, T> may deserialize as Map with BigInt keys or as Object with string keys
    let peersArray: Array<[string, any]> = [];

    if (response.peers instanceof Map) {
      // Map with BigInt keys - iterate using Map's forEach
      debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] Processing as Map with', response.peers.size, 'entries');
      response.peers.forEach((peerInfo: any, peerCid: any) => {
        peersArray.push([peerCid.toString(), peerInfo]);
      });
    } else if (response.peers && typeof response.peers === 'object') {
      // Regular object with string keys
      debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] Processing as Object with', Object.keys(response.peers).length, 'keys');
      peersArray = Object.entries(response.peers);
    } else {
      debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] response.peers is null/undefined/not-object');
    }

    debugLog('P2pRegistrationService', '[P2P-ListRegisteredPeers] Converted peers array length:', peersArray.length);

    return peersArray.map(([peerCid, peerInfo]: [string, any]) => ({
      ...peerInfo,
      cid: BigInt(peerCid),  // Convert string key to BigInt (canonical CID type per CLAUDE.md)
      // Normalize username - backend may send as username or peer_username
      username: peerInfo.username || peerInfo.peer_username || peerInfo.name || null
    }));
  }

  /**
   * Register a specific peer
   */
  public async registerPeer(
    peerCid: bigint,
    options: PeerRegistrationOptions = {}
  ): Promise<void> {
    // Use getCurrentCid() for proper multi-tab support
    const currentCid = await this.getCurrentCid();
    // CID 0 is the service connection, not a user session - skip P2P requests
    if (!currentCid || currentCid === 0n) {
      throw new Error('No active user session (CID 0 is service connection)');
    }

    // Prevent self-registration
    if (peerCid === currentCid) {
      throw new Error('Cannot register with self');
    }

    const requestId = crypto.randomUUID();
    // Register request for cross-tab response routing
    broadcastChannelService.registerRequest(requestId, currentCid);

    const request: InternalServiceRequest = {
      PeerRegister: {
        request_id: requestId,
        cid: currentCid, // Use the tab-aware CID
        peer_cid: peerCid,
        session_security_settings: options.sessionSecuritySettings || this.DEFAULT_SESSION_SECURITY,
        connect_after_register: options.connectAfterRegister ?? false,
        peer_session_password: null
      }
    };

    const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          broadcastChannelService.clearRequest(requestId);
          reject(new Error('PeerRegister request timed out'));
        }
      }, 10000);
    });

    await websocketService.sendMessage(request);
    await responsePromise;
    
    debugLog('P2pRegistrationService', `Successfully registered peer ${peerCid}`);
  }

  /**
   * Update internal peer maps based on list responses
   * IMPORTANT: Preserves usernames from PeerRegisterNotification since backend
   * ListRegisteredPeers response often doesn't include usernames
   */
  private updatePeerMaps(allPeers: any[], registeredPeers: any[]): void {
    // Preserve existing usernames before clearing (from PeerRegisterNotification)
    const preservedUsernames = new Map<bigint, string>();
    for (const [cid, peer] of this.allPeers) {
      if (peer.username && peer.username !== 'Unknown' && !peer.username.startsWith('User ')) {
        preservedUsernames.set(cid, peer.username);
      }
    }
    for (const [cid, peer] of this.registeredPeers) {
      if (peer.username && peer.username !== 'Unknown' && !peer.username.startsWith('User ')) {
        preservedUsernames.set(cid, peer.username);
      }
    }

    // Clear and update all peers map
    this.allPeers.clear();
    for (const peer of allPeers) {
      const cid: bigint | undefined = peer.cid;
      if (cid !== undefined) {
        // Prefer preserved username, then backend response, then fallback
        const username = preservedUsernames.get(cid) || peer.username || 'Unknown';
        this.allPeers.set(cid, {
          cid,
          username,
          fullName: peer.name || username || 'Unknown User',
          isOnline: peer.online_status !== undefined ? peer.online_status : true,
          isRegistered: false
        });
      }
    }

    // Clear and update registered peers map
    this.registeredPeers.clear();
    const registeredCids = new Set<bigint>();

    for (const peer of registeredPeers) {
      const cid: bigint | undefined = peer.cid;
      if (cid !== undefined) {
        registeredCids.add(cid);
        // Prefer preserved username, then backend response, then fallback
        const username = preservedUsernames.get(cid) || peer.username || 'Unknown';
        const peerInfo = this.allPeers.get(cid) || {
          cid,
          username,
          fullName: peer.name || username || 'Unknown User',
          isOnline: peer.online_status !== undefined ? peer.online_status : true,
          isRegistered: true
        };
        peerInfo.isRegistered = true;
        // Also ensure username is preserved for registered peers
        if (preservedUsernames.has(cid)) {
          peerInfo.username = preservedUsernames.get(cid)!;
        }
        this.registeredPeers.set(cid, peerInfo);
      }
    }

    // Update registration status in allPeers
    for (const [cid, peer] of this.allPeers) {
      peer.isRegistered = registeredCids.has(cid);
    }
  }

  /**
   * Register all unregistered peers
   */
  private async registerUnregisteredPeers(options: PeerRegistrationOptions = {}): Promise<void> {
    const unregisteredPeers = Array.from(this.allPeers.values()).filter(peer => !peer.isRegistered);
    
    if (unregisteredPeers.length === 0) {
      return;
    }

    debugLog('P2pRegistrationService', `Found ${unregisteredPeers.length} unregistered peers, registering...`);

    // Register peers in parallel with some concurrency limit
    const CONCURRENT_REGISTRATIONS = 5;
    
    for (let i = 0; i < unregisteredPeers.length; i += CONCURRENT_REGISTRATIONS) {
      const batch = unregisteredPeers.slice(i, i + CONCURRENT_REGISTRATIONS);
      const registrationPromises = batch.map(peer => 
        this.registerPeer(peer.cid, options).catch(error => {
          console.error(`Failed to register peer ${peer.cid}:`, error);
        })
      );
      
      await Promise.all(registrationPromises);
    }
  }

  /**
   * Get current peer lists
   */
  public getPeers(): { allPeers: Peer[]; registeredPeers: Peer[] } {
    return {
      allPeers: Array.from(this.allPeers.values()),
      registeredPeers: Array.from(this.registeredPeers.values())
    };
  }

  /**
   * Check if a specific peer is registered
   */
  public isPeerRegistered(peerCid: bigint): boolean {
    return this.registeredPeers.has(peerCid);
  }

  /**
   * Check if we have an OUTGOING registration to a peer (WE registered with them)
   * This is different from isPeerRegistered which includes incoming registrations too.
   */
  public hasOutgoingRegistration(peerCid: bigint): boolean {
    return this.outgoingRegistrations.has(peerCid);
  }

  /**
   * Get peer information
   */
  public getPeerInfo(peerCid: bigint): Peer | undefined {
    return this.allPeers.get(peerCid);
  }

  /**
   * Sync peer connections from GetSessions data.
   *
   * IMPORTANT: This method validates cached peer_connections against the server's
   * ListRegisteredPeers before adding them. This ensures we don't try to connect
   * to stale peers that no longer exist on the server (e.g., after server restart).
   *
   * The server's ListRegisteredPeers is the source of truth for peer registrations.
   * Cached data in session.peer_connections may be stale and should be validated.
   *
   * @param peerConnections - Record of peer_cid -> PeerSessionInformation
   */
  public async syncPeerConnectionsFromSession(peerConnections: Record<string, { cid: bigint; peer_cid: bigint; peer_username: string }> | undefined): Promise<void> {
    if (!peerConnections) {
      debugLog('P2pRegistrationService', '[P2P Registration] No peer connections to sync');
      return;
    }

    const peerCids = Object.keys(peerConnections);
    debugLog('P2pRegistrationService', '[P2P Registration] Syncing peer connections from session:', peerCids);

    // CRITICAL: Validate against server's registered peers (source of truth)
    // This prevents trying to connect to stale peers that no longer exist
    let serverPeerCids: Set<bigint> | null = null;
    try {
      const serverPeers = await this.listRegisteredPeers();
      serverPeerCids = new Set(serverPeers.map(p => p.cid as bigint).filter((c): c is bigint => c !== undefined));
      debugLog('P2pRegistrationService', `[P2P Registration] Server has ${serverPeerCids.size} registered peers:`, Array.from(serverPeerCids).map(c => c.toString()));
    } catch (error: any) {
      // If server query fails (e.g., no active session yet), skip syncing stale data
      // We'll sync when the server becomes available
      if (error?.message?.includes('CID 0') || error?.message?.includes('No active')) {
        debugLog('P2pRegistrationService', '[P2P Registration] No active session, skipping sync of cached peer data');
        return;
      }
      console.warn('[P2P Registration] Failed to validate peers against server, skipping sync:', error?.message);
      return;
    }

    for (const [peerCidStr, peerInfo] of Object.entries(peerConnections)) {
      // Convert string key to bigint
      const peerCid = BigInt(peerCidStr);

      // VALIDATION: Only sync peers that exist on the server
      // This filters out stale peer data from previous sessions/tests
      if (serverPeerCids && !serverPeerCids.has(peerCid)) {
        debugLog('P2pRegistrationService', `[P2P Registration] Skipping stale peer ${peerCid.toString()} (not in server registry)`);
        continue;
      }

      // Check if peer is already registered
      if (this.registeredPeers.has(peerCid)) {
        debugLog('P2pRegistrationService', `[P2P Registration] Peer ${peerCid.toString()} already registered`);
        continue;
      }

      // Add to registered peers (validated against server)
      const peer: Peer = {
        cid: peerCid,
        username: peerInfo.peer_username || `User ${peerCid.toString().slice(0, 8)}`,
        fullName: peerInfo.peer_username || `User ${peerCid.toString().slice(0, 8)}`,
        isOnline: false, // We don't know online status from peer_connections
        isRegistered: true
      };

      this.allPeers.set(peerCid, peer);
      this.registeredPeers.set(peerCid, peer);

      debugLog('P2pRegistrationService', `[P2P Registration] Added validated peer from session: ${peerCid.toString()} (${peer.username})`);

      // Emit event so UI updates
      eventEmitter.emit('p2p:peer-registered', { peer });
    }
  }

  // ============== Auto-Accept Registration Methods ==============

  /**
   * Get auto-accept setting from LocalDB
   * @param cidOverride - Optional CID to use instead of fetching via getCurrentCid().
   *                      Use this in notification handlers where the target CID is already known
   *                      to avoid IndexedDB operations that could hang.
   * @returns true if auto-accept is enabled, false otherwise (default: false)
   */
  public async getAutoAcceptSetting(cidOverride?: bigint): Promise<boolean> {
    try {
      // Use provided CID if available, otherwise fetch (can hang if IndexedDB is in bad state)
      const currentCid = cidOverride ?? await this.getCurrentCid();
      if (!currentCid || currentCid === 0n) {
        return false;
      }

      const result = await websocketService.sendLocalDBGet(
        currentCid,
        P2PRegistrationService.AUTO_ACCEPT_KEY
      );

      if (result?.value) {
        const decoded = bytesToString(result.value);
        return decoded === 'true';
      }
    } catch (error: any) {
      // Downgrade "Key not found" to debug (expected on first use)
      if (error?.message?.includes('Key not found')) {
        debugLog('P2pRegistrationService', '[P2P] Auto-accept setting not found, using default: false');
      } else {
        console.warn('[P2P] Failed to get auto-accept setting:', error);
      }
    }
    return false; // Default: manual approval required
  }

  /**
   * Set auto-accept setting in LocalDB
   */
  public async setAutoAcceptSetting(autoAccept: boolean): Promise<void> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid || currentCid === 0n) {
      throw new Error('No active user session');
    }

    try {
      await websocketService.sendLocalDBSet(
        currentCid,
        P2PRegistrationService.AUTO_ACCEPT_KEY,
        stringToBytes(String(autoAccept))
      );
      debugLog('P2pRegistrationService', `[P2P] Auto-accept setting saved: ${autoAccept}`);
    } catch (error) {
      console.error('[P2P] Failed to save auto-accept setting:', error);
      throw error;
    }
  }

  /**
   * Accept a registration request - registers back with the peer
   */
  public async acceptRegistrationRequest(peerCid: bigint, peerUsername?: string): Promise<void> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid || currentCid === 0n) {
      throw new Error('No active user session');
    }

    if (peerCid === currentCid) {
      throw new Error('Cannot register with self');
    }

    debugLog('P2pRegistrationService', `[P2P] Accepting registration from ${peerUsername || peerCid.toString()}`);

    // Register back with the peer (P2PAutoConnect handles connections)
    await this.registerPeer(peerCid, { connectAfterRegister: false });

    // Remove from pending requests if present
    await peerRegistrationStore.removeRequestByPeerCid(peerCid);

    // Update local state
    const peer = this.registeredPeers.get(peerCid) || {
      cid: peerCid,
      username: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      fullName: peerUsername || `User ${peerCid.toString().slice(0, 8)}`,
      isOnline: true,
      isRegistered: true
    };
    this.registeredPeers.set(peerCid, peer);

    eventEmitter.emit('p2p:registration-accepted', { peerCid, peerUsername });
  }

  /**
   * Decline a registration request - removes from pending requests
   */
  public async declineRegistrationRequest(peerCid: bigint): Promise<void> {
    debugLog('P2pRegistrationService', `[P2P] Declining registration from ${peerCid.toString()}`);

    // Remove from pending requests
    await peerRegistrationStore.removeRequestByPeerCid(peerCid);

    eventEmitter.emit('p2p:registration-declined', { peerCid });
  }
}

// Export singleton instance
export const p2pRegistrationService = P2PRegistrationService.getInstance();