import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { connectionManager } from './connection-manager';
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
      console.log('Peer registered with us:', message.PeerRegisterNotification);
      eventEmitter.emit('p2p:peer-registered-with-us', {
        peerCid: message.PeerRegisterNotification.peer_cid?.toString(),
        peerUsername: message.PeerRegisterNotification.peer_username
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
    } catch (error) {
      console.error('Error checking and registering peers:', error);
    }
  }

  /**
   * List all available peers in the network
   */
  public async listAllPeers(): Promise<any[]> {
    const connectionInfo = connectionManager.getConnectionInfo();
    if (!connectionInfo?.cid) {
      throw new Error('No active connection');
    }

    const requestId = crypto.randomUUID();
    const request: InternalServiceRequest = {
      ListAllPeers: {
        request_id: requestId,
        cid: connectionInfo.cid // Keep as string, websocketService will handle conversion
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
    const connectionInfo = connectionManager.getConnectionInfo();
    if (!connectionInfo?.cid) {
      throw new Error('No active connection');
    }

    const requestId = crypto.randomUUID();
    const request: InternalServiceRequest = {
      ListRegisteredPeers: {
        request_id: requestId,
        cid: connectionInfo.cid // Keep as string, websocketService will handle conversion
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
    const peers = response.peers || {};
    return Object.values(peers);
  }

  /**
   * Register a specific peer
   */
  public async registerPeer(
    peerCid: string, 
    options: PeerRegistrationOptions = {}
  ): Promise<void> {
    const connectionInfo = connectionManager.getConnectionInfo();
    if (!connectionInfo?.cid) {
      throw new Error('No active connection');
    }

    const requestId = crypto.randomUUID();
    const request: InternalServiceRequest = {
      PeerRegister: {
        request_id: requestId,
        cid: connectionInfo.cid, // Keep as string
        peer_cid: peerCid, // Keep as string
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
}

// Export singleton instance
export const p2pRegistrationService = P2PRegistrationService.getInstance();