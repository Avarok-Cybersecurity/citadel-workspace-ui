import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { connectionManager } from './connection-manager';
import { getSelectedUser } from './tab-context';
import { peerRegistrationStore } from './peer-registration-store';
import type {
  InternalServiceRequest,
  InternalServiceResponse
} from 'citadel-workspace-client-ts';

export interface Peer {
  cid: string;
  username: string;
  fullName: string;
  isOnline: boolean;
  isRegistered: boolean;
}

export interface SessionSecuritySettings {
  security_level: string;
  secrecy_mode: string;
  crypto_params: {
    encryption_algorithm: string;
    kem_algorithm: string;
    sig_algorithm: string;
  };
  header_obfuscator_settings: string;
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
 */
export class P2PRegistrationService {
  private static instance: P2PRegistrationService;
  private isRunning = false;
  private registeredPeers = new Map<string, Peer>();
  private allPeers = new Map<string, Peer>();
  private pollingInterval: NodeJS.Timeout | null = null;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

  // Default polling interval (30 seconds)
  private readonly POLLING_INTERVAL = 30000;

  // LocalDB key for auto-accept setting
  private static readonly AUTO_ACCEPT_KEY = 'p2p_auto_accept_registrations';
  
  // Default session security settings for P2P
  private readonly DEFAULT_SESSION_SECURITY = {
    security_level: "Standard",
    secrecy_mode: "BestEffort",
    crypto_params: {
      encryption_algorithm: "AES_GCM_256",
      kem_algorithm: "Kyber",
      sig_algorithm: "None"
    },
    header_obfuscator_settings: "Disabled"
  };

  private constructor() {
    this.setupEventListeners();
  }

  /**
   * Get current CID with proper priority for multi-tab support:
   * 1) Tab context selectedCid (set during session switch)
   * 2) Tab session CID
   * 3) Global connection CID (fallback)
   */
  private getCurrentCid(): string | null {
    const tabSelection = getSelectedUser();
    if (tabSelection?.selectedCid) {
      return tabSelection.selectedCid;
    }
    const tabSession = connectionManager.getTabSelectedSession();
    if (tabSession?.cid) {
      return tabSession.cid.toString();
    }
    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.cid?.toString() || null;
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
    eventEmitter.on('connection:status-changed', ({ isConnected }: { isConnected: boolean }) => {
      if (isConnected && this.isRunning) {
        // Resume auto-registration when connection is restored
        this.checkAndRegisterPeers();
      }
    });
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
      const peerCid = message.PeerRegisterSuccess.peer_cid?.toString();
      if (peerCid) {
        const peer = this.allPeers.get(peerCid);
        if (peer) {
          peer.isRegistered = true;
          this.registeredPeers.set(peerCid, peer);
          eventEmitter.emit('p2p:peer-registered', { peer });
        }
      }
    } else if (message.PeerRegisterFailure) {
      const requestId = message.PeerRegisterFailure.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error(message.PeerRegisterFailure.message || 'Failed to register peer'));
        this.pendingRequests.delete(requestId);
      }
    } else if (message.PeerRegisterNotification) {
      // Handle notification when another peer registers with us
      // NOTE: In PeerRegisterNotification (from peer_event.rs):
      //   - `cid` is OUR CID (the recipient receiving the notification)
      //   - `peer_cid` is the CID of the peer who registered WITH us (the sender)
      const peerCid = message.PeerRegisterNotification.peer_cid?.toString();
      const peerUsername = message.PeerRegisterNotification.peer_username;

      console.log('[P2P] Peer registered with us:', message.PeerRegisterNotification);

      if (peerCid) {
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

        // 3. Check auto-accept setting to determine how to handle the registration
        this.handleIncomingRegistration(peerCid, peerUsername).catch(error => {
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
   * Start the auto-registration service
   */
  public async start(options: PeerRegistrationOptions = {}): Promise<void> {
    if (this.isRunning) {
      console.log('P2P Registration Service already running');
      return;
    }

    const connectionInfo = connectionManager.getConnectionInfo();
    if (!connectionInfo?.cid) {
      throw new Error('No active connection. Please connect first.');
    }

    this.isRunning = true;
    console.log('Starting P2P Registration Service');

    // Do initial check
    await this.checkAndRegisterPeers(options);

    // Start polling
    this.pollingInterval = setInterval(() => {
      this.checkAndRegisterPeers(options);
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

    console.log('Stopped P2P Registration Service');
    eventEmitter.emit('p2p:registration-service-stopped');
  }

  /**
   * Check for peers and register them if needed
   */
  private async checkAndRegisterPeers(options: PeerRegistrationOptions = {}): Promise<void> {
    try {
      // Get all available peers
      const allPeers = await this.listAllPeers();

      // Get currently registered peers
      const registeredPeers = await this.listRegisteredPeers();

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
    }
  }

  /**
   * List all available peers in the network
   */
  public async listAllPeers(): Promise<any[]> {
    // Use getCurrentCid() for proper multi-tab support
    const currentCid = this.getCurrentCid();
    // CID 0 is the service connection, not a user session - skip P2P requests
    if (!currentCid || currentCid === '0') {
      throw new Error('No active user session (CID 0 is service connection)');
    }

    const requestId = crypto.randomUUID();
    const request: InternalServiceRequest = {
      ListAllPeers: {
        request_id: requestId,
        cid: currentCid // Use the tab-aware CID
      }
    } as any;

    const responsePromise = new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('ListAllPeers request timed out'));
        }
      }, 10000);
    });

    await websocketService.sendMessage(request);
    const response = await responsePromise;

    // Convert Record<string, PeerInformation> to array
    const peerInfo = response.peer_information || {};
    return Object.values(peerInfo);
  }

  /**
   * List currently registered peers
   */
  public async listRegisteredPeers(): Promise<any[]> {
    // Use getCurrentCid() for proper multi-tab support
    const currentCid = this.getCurrentCid();
    // CID 0 is the service connection, not a user session - skip P2P requests
    if (!currentCid || currentCid === '0') {
      throw new Error('No active user session (CID 0 is service connection)');
    }

    const requestId = crypto.randomUUID();
    const request: InternalServiceRequest = {
      ListRegisteredPeers: {
        request_id: requestId,
        cid: currentCid // Use the tab-aware CID
      }
    } as any;

    const responsePromise = new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('ListRegisteredPeers request timed out'));
        }
      }, 10000);
    });

    await websocketService.sendMessage(request);
    const response = await responsePromise;

    // Convert Record<string, PeerInformation> to array
    // Key is the peer CID, value.cid is incorrectly the current user's CID
    const peers = response.peers || {};
    return Object.entries(peers).map(([peerCid, peerInfo]: [string, any]) => ({
      ...peerInfo,
      cid: peerCid  // Override with the CORRECT peer CID from the key
    }));
  }

  /**
   * Register a specific peer
   */
  public async registerPeer(
    peerCid: string,
    options: PeerRegistrationOptions = {}
  ): Promise<void> {
    // Use getCurrentCid() for proper multi-tab support
    const currentCid = this.getCurrentCid();
    // CID 0 is the service connection, not a user session - skip P2P requests
    if (!currentCid || currentCid === '0') {
      throw new Error('No active user session (CID 0 is service connection)');
    }

    // Prevent self-registration
    if (peerCid === currentCid) {
      throw new Error('Cannot register with self');
    }

    const requestId = crypto.randomUUID();
    const request: InternalServiceRequest = {
      PeerRegister: {
        request_id: requestId,
        cid: currentCid, // Use the tab-aware CID
        peer_cid: peerCid,
        session_security_settings: options.sessionSecuritySettings || this.DEFAULT_SESSION_SECURITY,
        connect_after_register: options.connectAfterRegister ?? false,
        peer_session_password: null
      }
    } as any;

    const responsePromise = new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('PeerRegister request timed out'));
        }
      }, 10000);
    });

    await websocketService.sendMessage(request);
    await responsePromise;
    
    console.log(`Successfully registered peer ${peerCid}`);
  }

  /**
   * Update internal peer maps based on list responses
   */
  private updatePeerMaps(allPeers: any[], registeredPeers: any[]): void {
    // Clear and update all peers map
    this.allPeers.clear();
    for (const peer of allPeers) {
      const cid = peer.cid?.toString();
      if (cid) {
        this.allPeers.set(cid, {
          cid,
          username: peer.username || 'Unknown',
          fullName: peer.name || peer.username || 'Unknown User',
          isOnline: peer.online_status !== undefined ? peer.online_status : true,
          isRegistered: false
        });
      }
    }

    // Clear and update registered peers map
    this.registeredPeers.clear();
    const registeredCids = new Set<string>();

    for (const peer of registeredPeers) {
      const cid = peer.cid?.toString();
      if (cid) {
        registeredCids.add(cid);
        const peerInfo = this.allPeers.get(cid) || {
          cid,
          username: peer.username || 'Unknown',
          fullName: peer.name || peer.username || 'Unknown User',
          isOnline: peer.online_status !== undefined ? peer.online_status : true,
          isRegistered: true
        };
        peerInfo.isRegistered = true;
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

    console.log(`Found ${unregisteredPeers.length} unregistered peers, registering...`);

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
  public isPeerRegistered(peerCid: string): boolean {
    return this.registeredPeers.has(peerCid);
  }

  /**
   * Get peer information
   */
  public getPeerInfo(peerCid: string): Peer | undefined {
    return this.allPeers.get(peerCid);
  }

  /**
   * Sync peer connections from GetSessions data.
   * This is more reliable than ListRegisteredPeers when sessions are claimed/switched
   * because it uses the internal service's server_connection_map peer_connections.
   * @param peerConnections - Record of peer_cid -> PeerSessionInformation
   */
  public syncPeerConnectionsFromSession(peerConnections: Record<string, { cid: string; peer_cid: string; peer_username: string }> | undefined): void {
    if (!peerConnections) {
      console.log('[P2P Registration] No peer connections to sync');
      return;
    }

    console.log('[P2P Registration] Syncing peer connections from session:', Object.keys(peerConnections));

    for (const [peerCidStr, peerInfo] of Object.entries(peerConnections)) {
      // Ensure we're working with string CIDs
      const peerCid = peerCidStr.toString();

      // Check if peer is already registered
      if (this.registeredPeers.has(peerCid)) {
        console.log(`[P2P Registration] Peer ${peerCid} already registered`);
        continue;
      }

      // Add to registered peers
      const peer: Peer = {
        cid: peerCid,
        username: peerInfo.peer_username || `User ${peerCid.slice(0, 8)}`,
        isOnline: false, // We don't know online status from peer_connections
        isRegistered: true
      };

      this.allPeers.set(peerCid, peer);
      this.registeredPeers.set(peerCid, peer);

      console.log(`[P2P Registration] Added peer from session peer_connections: ${peerCid} (${peer.username})`);

      // Emit event so UI updates
      eventEmitter.emit('p2p:peer-registered', { peer });
    }
  }

  // ============== Auto-Accept Registration Methods ==============

  /**
   * Handle incoming registration based on auto-accept setting
   */
  private async handleIncomingRegistration(peerCid: string, peerUsername?: string): Promise<void> {
    const autoAccept = await this.getAutoAcceptSetting();

    if (autoAccept) {
      // Auto-accept: Register back automatically
      console.log(`[P2P] Auto-accepting registration from ${peerUsername || peerCid}`);
      await this.acceptRegistrationRequest(peerCid, peerUsername);
    } else {
      // Manual: Add to pending requests for user approval
      const currentCid = this.getCurrentCid();
      if (!currentCid) {
        console.warn('[P2P] No current CID, cannot add to pending requests');
        return;
      }

      console.log(`[P2P] Adding registration from ${peerUsername || peerCid} to pending requests`);
      await peerRegistrationStore.handleIncomingRequest({
        cid: currentCid,
        peer_cid: peerCid,
        peer_username: peerUsername
      });
    }
  }

  /**
   * Get auto-accept setting from LocalDB
   * @returns true if auto-accept is enabled, false otherwise (default: false)
   */
  public async getAutoAcceptSetting(): Promise<boolean> {
    try {
      const currentCid = this.getCurrentCid();
      if (!currentCid || currentCid === '0') {
        return false;
      }

      const result = await websocketService.sendLocalDBGet(
        currentCid,
        P2PRegistrationService.AUTO_ACCEPT_KEY
      );

      if (result?.value) {
        const decoded = new TextDecoder().decode(new Uint8Array(result.value));
        return decoded === 'true';
      }
    } catch (error) {
      console.warn('[P2P] Failed to get auto-accept setting:', error);
    }
    return false; // Default: manual approval required
  }

  /**
   * Set auto-accept setting in LocalDB
   */
  public async setAutoAcceptSetting(autoAccept: boolean): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid || currentCid === '0') {
      throw new Error('No active user session');
    }

    try {
      const value = new TextEncoder().encode(String(autoAccept));
      await websocketService.sendLocalDBSet(
        currentCid,
        P2PRegistrationService.AUTO_ACCEPT_KEY,
        Array.from(value)
      );
      console.log(`[P2P] Auto-accept setting saved: ${autoAccept}`);
    } catch (error) {
      console.error('[P2P] Failed to save auto-accept setting:', error);
      throw error;
    }
  }

  /**
   * Accept a registration request - registers back with the peer
   */
  public async acceptRegistrationRequest(peerCid: string, peerUsername?: string): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid || currentCid === '0') {
      throw new Error('No active user session');
    }

    if (peerCid === currentCid) {
      throw new Error('Cannot register with self');
    }

    console.log(`[P2P] Accepting registration from ${peerUsername || peerCid}`);

    // Register back with the peer
    await this.registerPeer(peerCid, { connectAfterRegister: true });

    // Remove from pending requests if present
    await peerRegistrationStore.removeRequestByPeerCid(peerCid);

    // Update local state
    const peer = this.registeredPeers.get(peerCid) || {
      cid: peerCid,
      username: peerUsername || `User ${peerCid.slice(0, 8)}`,
      fullName: peerUsername || `User ${peerCid.slice(0, 8)}`,
      isOnline: true,
      isRegistered: true
    };
    this.registeredPeers.set(peerCid, peer);

    eventEmitter.emit('p2p:registration-accepted', { peerCid, peerUsername });
  }

  /**
   * Decline a registration request - removes from pending requests
   */
  public async declineRegistrationRequest(peerCid: string): Promise<void> {
    console.log(`[P2P] Declining registration from ${peerCid}`);

    // Remove from pending requests
    await peerRegistrationStore.removeRequestByPeerCid(peerCid);

    eventEmitter.emit('p2p:registration-declined', { peerCid });
  }
}

// Export singleton instance
export const p2pRegistrationService = P2PRegistrationService.getInstance();