import { WorkspaceClient, type WorkspaceClientConfig } from 'citadel-workspace-client-ts';
import { eventEmitter } from './event-emitter';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { broadcastChannelService } from './broadcast-channel-service';
import { connectionManager } from './connection-manager';
import { debugLog, errorLog } from './debug-config';

export interface WebSocketServiceConfig {
  websocketUrl?: string;
  messageHandler?: (message: any) => void;
  errorHandler?: (error: Error) => void;
}

// Helper function to convert string to byte array
function stringToByteArray(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

// Global state to prevent multiple WASM client initializations
const GLOBAL_INIT_KEY = '__citadel_wasm_client_init__';
declare global {
  interface Window {
    [GLOBAL_INIT_KEY]?: {
      promise: Promise<void>;
      initialized: boolean;
      client: WorkspaceClient | null;
    };
  }
}

class WebSocketService {
  private client: WorkspaceClient | null = null;
  private config: WebSocketServiceConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: WebSocketServiceConfig = {}) {
    this.config = {
      websocketUrl: config.websocketUrl || 'ws://localhost:12345',
      messageHandler: config.messageHandler,
      errorHandler: config.errorHandler,
    };
  }

  async init(): Promise<void> {
    // Check global state first - silent return if already initialized (normal path)
    if (window[GLOBAL_INIT_KEY]?.initialized) {
      this.isInitialized = true;
      // Retrieve the shared client instance
      if (window[GLOBAL_INIT_KEY].client) {
        this.client = window[GLOBAL_INIT_KEY].client;
      }
      return;
    }

    if (this.isInitialized) {
      debugLog('websocket', 'Service already initialized');
      return;
    }

    // Check global initialization promise
    if (window[GLOBAL_INIT_KEY]?.promise) {
      debugLog('websocket', 'Service initialization already in progress globally, waiting...');
      try {
        await window[GLOBAL_INIT_KEY].promise;
        this.isInitialized = true;
        // Retrieve the shared client instance
        if (window[GLOBAL_INIT_KEY]?.client) {
          this.client = window[GLOBAL_INIT_KEY].client;
        }
        return;
      } catch (error) {
        errorLog('Global initialization failed:', error);
        // Clear the global state to allow retry
        window[GLOBAL_INIT_KEY] = undefined;
        
        // Emit connection-failure event
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
        eventEmitter.emit('connection-failure', { error: errorMessage });
        
        throw error;
      }
    }

    // Prevent concurrent initialization attempts
    if (this.initializationPromise) {
      debugLog('websocket', 'Service initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    // Create and store the promise globally
    this.initializationPromise = this._doInit();
    window[GLOBAL_INIT_KEY] = {
      promise: this.initializationPromise,
      initialized: false,
      client: null
    };

    try {
      await this.initializationPromise;
      // Mark as initialized globally
      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].initialized = true;
      }
    } catch (error) {
      // Clear global state on error
      window[GLOBAL_INIT_KEY] = undefined;
      
      // Emit connection-failure event
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
      eventEmitter.emit('connection-failure', { error: errorMessage });
      
      throw error;
    } finally {
      // Keep the promise to prevent re-initialization
      // this.initializationPromise = null;
    }
  }

  private async _doInit(): Promise<void> {
    debugLog('websocket', 'WASM client initialization starting...');
    
    // Set up WASM debug bridge before initializing client
    const { setupWasmDebugBridge } = await import('./wasm-debug-bridge');
    setupWasmDebugBridge();
    
    const clientConfig: WorkspaceClientConfig = {
      websocketUrl: this.config.websocketUrl!,
      messageHandler: (message: InternalServiceResponse) => {
        debugLog('websocket', 'Message received from WASM client', message);
        
        // Broadcast the message to other tabs if we're the leader
        if (broadcastChannelService.getIsLeader()) {
          broadcastChannelService.broadcastWorkspaceResponse(message);
        }
        
        // Forward the response to the handler
        if (this.config.messageHandler) {
          this.config.messageHandler(message);
        }
        
        // Also emit events for compatibility
        eventEmitter.emit('websocket-message', message);
      },
      errorHandler: this.config.errorHandler,
    };

    try {
      debugLog('websocket', 'Creating WorkspaceClient with config', clientConfig);
      this.client = new WorkspaceClient(clientConfig);
      await this.client.init();
      this.isInitialized = true;
      // Store client in global state for sharing across instances
      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].client = this.client;
      }
      debugLog('websocket', 'WASM client initialization completed successfully');
    } catch (error) {
      errorLog('Error initializing WorkspaceClient:', error);
      this.client = null;
      this.isInitialized = false;
      
      // Emit connection-failure event for UI to handle
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize WebSocket connection';
      eventEmitter.emit('connection-failure', { error: errorMessage });
      
      throw error;
    }
  }

  async connect(requestId: string, username: string, password: string, serverAddr: string = '127.0.0.1:12349'): Promise<void> {
    await this.init(); // ensure initialized

    // STEP 1: Check if session already exists
    console.log(`[Connect] Checking for existing session: ${username}@${serverAddr}`);

    try {
      const { connectionManager } = await import('./connection-manager');
      const activeSessions = await connectionManager.getActiveSessions();

      const existingSession = activeSessions.find(
        s => s.username === username && s.server_address === serverAddr
      );

      if (existingSession) {
        console.log(`[Connect] Found existing session CID ${existingSession.cid}`);

        // STEP 2: Check if session is orphaned
        // Heuristic: Session is likely orphaned if it exists in GetSessions
        // but we don't have a stored CID for it, OR if workspace load fails
        const { connectionManager: cm } = await import('./connection-manager');
        const storedSession = cm.getStoredSessions().sessions.find(
          s => s.username === username && s.serverAddress === serverAddr
        );

        const isOrphaned = !storedSession?.cid || storedSession.cid !== existingSession.cid.toString();

        if (isOrphaned) {
          // STEP 3a: Session is orphaned → Claim it
          console.log(`[Connect] Session is orphaned - claiming CID ${existingSession.cid}`);
          await this.claimSession(existingSession.cid.toString(), false);
          return; // Early return - session claimed successfully
        } else {
          // STEP 3b: Session exists but NOT orphaned → Disconnect then Connect
          console.warn(`[Connect] Session exists but not orphaned - disconnecting first`);
          await this.disconnect(existingSession.cid.toString());
          await new Promise(resolve => setTimeout(resolve, 200)); // Allow cleanup time
          // Fall through to connect
        }
      }
    } catch (error) {
      // If GetSessions or session check fails, log and continue with Connect
      console.warn(`[Connect] Session check failed, proceeding with Connect:`, error);
    }

    // STEP 4: No existing session OR after disconnect → Proceed with Connect
    console.log(`[Connect] Proceeding with new connection for ${username}`);

    // Create proper connect options for WorkspaceClient
    // TODO: use @avarok/citadel-protocol-types to inform the combinations below for:
    // UdpMode, ConnectMode, SessionSecuritySettings (SecurityLevel, Secrecy Mode, Crypto Params (Encryption algorithm, kem algorithm, sig algorithm)), header obfuscation settings
    // These type all should exist inside that package ready to be slotted inside the UI components for anywhere they're required, not just connect.
    const connectOptions = {
      request_id: requestId,
      server_addr: serverAddr,
      username,
      password: stringToByteArray(password),
      connect_mode: { Standard: { force_login: true } } as any,
      udp_mode: "Disabled" as any,
      keep_alive_timeout: null,
      session_security_settings: {
        security_level: "Standard",
        secrecy_mode: "BestEffort",
        crypto_params: {
          encryption_algorithm: "AES_GCM_256",
          kem_algorithm: "Kyber",
          sig_algorithm: "None"
        },
        header_obfuscator_settings: "Disabled"
      } as any,
      server_password: null as any
    };

    // Send connect request directly to avoid the waitForResponse handler replacement issue
    const connectRequest = {
      Connect: connectOptions
    };
    
    // Send directly to internal service without using the problematic waitForResponse pattern
    await this.client.sendDirectToInternalService(connectRequest);
  }

  async register(requestId: string, username: string, password: string, fullName: string, sessionSecuritySettings?: any): Promise<void> {
    await this.init(); // ensure initialized

    // Use provided session security settings or defaults
    const securitySettings = sessionSecuritySettings || {
      securityLevel: "Standard",
      secrecyMode: "BestEffort",
      encryptionAlgorithm: "AES_GCM_256",
      kemAlgorithm: "Kyber",
      sigAlgorithm: "None",
      headerObfuscatorSettings: "Disabled"
    };

    // Create proper register options for WorkspaceClient
    const registerOptions = {
      request_id: requestId,
      server_addr: '127.0.0.1:12349',
      full_name: fullName,
      username,
      proposed_password: stringToByteArray(password),
      connect_after_register: true, // Establish connection immediately after registration
      session_security_settings: {
        security_level: securitySettings.securityLevel,
        secrecy_mode: securitySettings.secrecyMode,
        crypto_params: {
          encryption_algorithm: securitySettings.encryptionAlgorithm,
          kem_algorithm: securitySettings.kemAlgorithm,
          sig_algorithm: securitySettings.sigAlgorithm
        },
        header_obfuscator_settings: "Disabled"
      } as any,
      server_password: null as any
    };

    debugLog('websocket', 'Sending register options to WASM client', registerOptions);
    
    // Send register request directly to avoid the waitForResponse handler replacement issue
    const registerRequest = {
      Register: registerOptions
    };
    
    // Send directly to internal service without using the problematic waitForResponse pattern
    await this.client.sendDirectToInternalService(registerRequest);
  }


  async sendWorkspaceRequest(cid: string, request: any): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to send workspace request');
    }

    // Use WorkspaceClient's sendWorkspaceRequest method
    // Convert string CID to BigInt for the WASM client
    const cidBigInt = BigInt(cid);
    await this.client.sendWorkspaceRequest(cidBigInt, request);
  }

  async sendP2PMessage(cid: string, targetCid: string, message: string): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to send P2P message');
    }

    if (!targetCid) {
      throw new Error('Target CID (peer_cid) is required to send P2P message');
    }

    // Log the exact values being used
    console.log('[P2P] sendP2PMessage called with:', {
      cid: cid,
      cidType: typeof cid,
      targetCid: targetCid,
      targetCidType: typeof targetCid,
      messageLength: message.length
    });

    // Create InternalServiceRequest::Message with peer_cid to route to P2P channel
    const messageRequest = {
      Message: {
        request_id: crypto.randomUUID(),
        message: Array.from(new TextEncoder().encode(message)),
        cid: cid, // sender CID as string - will be converted to BigInt by sendMessage
        peer_cid: targetCid, // recipient CID as string - will be converted to BigInt by sendMessage
        security_level: 'Standard'
      }
    };

    console.log('[P2P] messageRequest before conversion:', JSON.stringify(messageRequest, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    debugLog('websocket', 'Sending P2P message', { cid, targetCid, messageLength: message.length });

    // Use sendMessage which handles BigInt conversion properly
    await this.sendMessage(messageRequest);
  }

  async openP2PConnection(cid: string, targetCid: string): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to open P2P connection');
    }
    
    if (cid === targetCid) {
      throw new Error('Cannot open P2P connection to self');
    }

    debugLog('websocket', 'Opening P2P connection', { cid, targetCid });

    // Send PeerConnect request to establish P2P channel
    const requestId = crypto.randomUUID();
    const peerConnectRequest = {
      PeerConnect: {
        request_id: requestId,
        cid: cid, // our CID - will be converted to BigInt by sendMessage
        peer_cid: targetCid, // peer CID - will be converted to BigInt by sendMessage
        udp_mode: 'Disabled',
        session_security_settings: {
          security_level: 'Standard',
          secrecy_mode: 'BestEffort',
          crypto_params: {
            encryption_algorithm: 'AES_GCM_256',
            kem_algorithm: 'Kyber',
            sig_algorithm: 'None'
          },
          header_obfuscator_settings: 'Disabled'
        }
      }
    };

    // Send the request and wait for success/failure
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('PeerConnect request timed out'));
      }, 30000);

      const handler = (message: any) => {
        if ('PeerConnectSuccess' in message && message.PeerConnectSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'P2P connection established', { targetCid });
          resolve();
        } else if ('PeerConnectFailure' in message && message.PeerConnectFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          const error = message.PeerConnectFailure.message || 'PeerConnect failed';
          errorLog('P2P connection failed:', error);
          reject(new Error(error));
        }
      };

      eventEmitter.on('websocket-message', handler);

      // Send the request
      this.sendMessage(peerConnectRequest).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Open a messenger handle for the given CID.
   * Creates an ISM (InterSession Messaging) channel for reliable-ordered messaging.
   * Must be called once at login and maintained via polling (ensureMessengerOpen).
   * NOTE: This does NOT establish a P2P connection - it only creates a local messaging handle.
   * To establish a P2P connection, use openP2PConnection() which sends PeerConnect.
   * @param cid - The CID to open the messenger for
   */
  async openMessengerFor(cid: string): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required to open messenger');
    }

    debugLog('websocket', 'Opening messenger handle for CID', { cid });

    // Call the WorkspaceClient's openMessengerFor which directly calls WASM's open_messenger_for
    // This creates a messenger.multiplex(cid) handle for ISM routing
    await this.client.openMessengerFor(cid);
  }

  /**
   * Ensures a messenger handle is open for the given CID.
   * Returns true if the messenger was just opened, false if already open.
   * Use this for polling to maintain messenger handles across leader/follower tab transitions.
   * @param cid - The CID to ensure messenger is open for
   */
  async ensureMessengerOpen(cid: string): Promise<boolean> {
    await this.init(); // ensure initialized

    if (!cid) {
      throw new Error('CID is required');
    }

    return await this.client.ensureMessengerOpen(cid);
  }

  /**
   * Send a reliable P2P message using the ISM (InterSession Messaging) layer.
   * This provides guaranteed delivery with retries and ordering.
   * @param localCid - The local user's CID
   * @param peerCid - The target peer's CID
   * @param message - The message bytes to send
   * @param securityLevel - Optional security level: 'Standard', 'Reinforced', 'High', or 'Extreme'
   */
  async sendP2PMessageReliable(
    localCid: string,
    peerCid: string,
    message: Uint8Array,
    securityLevel?: 'Standard' | 'Reinforced' | 'High' | 'Extreme'
  ): Promise<void> {
    await this.init(); // ensure initialized

    if (!localCid) {
      throw new Error('Local CID is required to send reliable P2P message');
    }

    if (!peerCid) {
      throw new Error('Peer CID is required to send reliable P2P message');
    }

    debugLog('websocket', 'Sending reliable P2P message', { localCid, peerCid, messageLength: message.length, securityLevel });

    await this.client.sendP2PMessageReliable(localCid, peerCid, message, securityLevel);
  }

  async disconnect(cid?: string): Promise<void> {
    await this.init(); // ensure initialized

    if (cid) {
      try {
        // Send a Disconnect request for specific CID
        // Disconnect is already a top-level request, no need to wrap in Request
        const request = {
          Disconnect: {
            request_id: crypto.randomUUID(),
            cid: cid // Send CID as string - Rust side will parse to u64
          }
        };
        debugLog('websocket', 'Sending Disconnect request', request);
        await this.client.sendDirectToInternalService(request);
      } catch (error) {
        errorLog('Error disconnecting:', error);
        throw error; // Re-throw so caller knows disconnect failed
      }
    }
  }

  async disconnectAndClose(): Promise<void> {
    // This completely closes the WebSocket connection
    this.client = null;
    this.isInitialized = false;
  }

  isConnected(): boolean {
    return this.isInitialized && this.client !== null;
  }


  getClient(): WorkspaceClient | null {
    return this.client;
  }

  /**
   * Convert BigInt values to strings recursively for JSON serialization
   */
  private convertBigIntToString(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertBigIntToString(item));
    }
    
    if (typeof obj === 'object') {
      const converted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        converted[key] = this.convertBigIntToString(value);
      }
      return converted;
    }
    
    return obj;
  }

  /**
   * Send a direct message to the internal service
   */
  async sendMessage(message: any): Promise<void> {
    await this.init(); // ensure initialized

    // First convert string CIDs to BigInt where needed, then convert back for serialization
    const processedMessage = this.convertCidFieldsToBigInt(message);

    // Log after BigInt conversion
    if (message.Message) {
      console.log('[P2P] After convertCidFieldsToBigInt:', {
        cid: processedMessage.Message?.cid?.toString(),
        cidType: typeof processedMessage.Message?.cid,
        peer_cid: processedMessage.Message?.peer_cid?.toString(),
        peer_cidType: typeof processedMessage.Message?.peer_cid
      });
    }

    // Convert BigInt values to strings for JSON serialization
    const jsonSerializableMessage = this.convertBigIntToString(processedMessage);

    // Log after string conversion
    if (message.Message) {
      console.log('[P2P] After convertBigIntToString (final to WASM):', {
        cid: jsonSerializableMessage.Message?.cid,
        cidType: typeof jsonSerializableMessage.Message?.cid,
        peer_cid: jsonSerializableMessage.Message?.peer_cid,
        peer_cidType: typeof jsonSerializableMessage.Message?.peer_cid
      });
    }

    debugLog('websocket', 'Sending message to internal service', jsonSerializableMessage);

    // CRITICAL DEBUG: Log exact JSON being sent to WASM for ALL Message requests
    if (jsonSerializableMessage.Message) {
      const reqId = jsonSerializableMessage.Message.request_id;
      const peerCid = jsonSerializableMessage.Message.peer_cid;
      console.log(`[P2P-DEBUG] REQUEST_ID=${reqId} peer_cid=${peerCid} FINAL JSON:`, JSON.stringify(jsonSerializableMessage, null, 2));
    }

    await this.client.sendDirectToInternalService(jsonSerializableMessage);
  }

  /**
   * Enable orphan mode for the current connection
   * When enabled, sessions will persist even when the TCP connection drops
   */
  async setOrphanMode(enabled: boolean): Promise<any> {
    await this.init(); // ensure initialized
    
    const requestId = crypto.randomUUID();
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          SetConnectionOrphan: {
            allow_orphan_sessions: enabled
          }
        }
      }
    };
    
    debugLog('websocket', 'Sending SetConnectionOrphan request', request);
    
    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('SetConnectionOrphan request timed out'));
      }, 10000);
      
      const handler = (message: any) => {
        const response = message.Response || message;
        
        if ('ConnectionManagementSuccess' in response && response.ConnectionManagementSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: response.ConnectionManagementSuccess.message
          });
        } else if ('ConnectionManagementFailure' in response && response.ConnectionManagementFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.ConnectionManagementFailure.error || 'Failed to set orphan mode'));
        }
      };
      
      eventEmitter.on('websocket-message', handler);
      
      // Send the request - ConnectionManagement is already a top-level request, no need to wrap in Request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Claim an existing session (take over from another connection)
   * @param sessionCid The CID of the session to claim
   * @param onlyIfOrphaned If true, only claim if the session is orphaned
   */
  async claimSession(sessionCid: string | bigint, onlyIfOrphaned: boolean = false): Promise<any> {
    await this.init(); // ensure initialized
    
    const requestId = crypto.randomUUID();
    // Convert to string for logging
    const sessionCidString = sessionCid.toString();
    
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          ClaimSession: {
            session_cid: sessionCidString, // Send as string, the server should handle conversion
            only_if_orphaned: onlyIfOrphaned
          }
        }
      }
    };
    
    debugLog('websocket', 'Sending ClaimSession request with CID: ' + sessionCidString);
    
    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('ClaimSession request timed out'));
      }, 10000);
      
      const handler = (message: any) => {
        const response = message.Response || message;
        
        if ('ConnectionManagementSuccess' in response && response.ConnectionManagementSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: response.ConnectionManagementSuccess.message,
            cid: response.ConnectionManagementSuccess.cid
          });
        } else if ('ConnectionManagementFailure' in response && response.ConnectionManagementFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.ConnectionManagementFailure.error || 'Failed to claim session'));
        }
      };
      
      eventEmitter.on('websocket-message', handler);
      
      // Send the request - ConnectionManagement is already a top-level request, no need to wrap in Request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Disconnect orphan sessions
   * @param sessionCid Optional - if provided, disconnect specific session. If null, disconnect all orphan sessions.
   */
  async disconnectOrphan(sessionCid?: string | bigint | null): Promise<any> {
    await this.init(); // ensure initialized
    
    const requestId = crypto.randomUUID();
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          DisconnectOrphan: {
            session_cid: sessionCid ? BigInt(sessionCid) : null
          }
        }
      }
    };
    
    debugLog('websocket', 'Sending DisconnectOrphan request', request);
    
    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('DisconnectOrphan request timed out'));
      }, 10000);
      
      const handler = (message: any) => {
        const response = message.Response || message;
        
        if ('ConnectionManagementSuccess' in response && response.ConnectionManagementSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: response.ConnectionManagementSuccess.message
          });
        } else if ('ConnectionManagementFailure' in response && response.ConnectionManagementFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.ConnectionManagementFailure.error || 'Failed to disconnect orphan'));
        }
      };
      
      eventEmitter.on('websocket-message', handler);
      
      // Send the request - ConnectionManagement is already a top-level request, no need to wrap in Request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  /**
   * Get the WASM module instance for direct P2P operations
   */
  async getWasmModule(): Promise<any> {
    await this.init(); // ensure initialized
    
    // The WASM module should be available on the client instance
    // This assumes the WorkspaceClient extends InternalServiceWasmClient which has access to the WASM module
    // @human-review Need to check how WorkspaceClient exposes WASM module
    return (this.client as any)?._wasmModule || null;
  }

  /**
   * Get the WASM client instance for direct access
   */
  async getWasmClient(): Promise<WorkspaceClient | null> {
    await this.init();
    return this.client;
  }

  /**
   * Send a raw request using the InternalServiceRequest format
   */
  async sendRequest(request: any): Promise<any> {
    await this.init();
    return this.client.sendDirectToInternalService(request);
  }

  /**
   * Get current connection info including CID
   */
  async getConnectionInfo(): Promise<{ cid: string } | null> {
    return connectionManager.getConnectionInfo();
  }

  // ============== LocalDB Methods ==============

  /**
   * Get a value from LocalDB
   * @param cid - The user's CID for scoped storage
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  async sendLocalDBGet(cid: string, key: string): Promise<{ value: number[] } | null> {
    const requestId = crypto.randomUUID();
    const client = this.getClient();

    if (!client) {
      throw new Error('No WebSocket client available');
    }

    const request = {
      LocalDBGetKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null,
        key
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBGetKV request timed out'));
      }, 5000);

      const handleMessage = (message: any) => {
        if (message.LocalDBGetKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve({ value: message.LocalDBGetKVSuccess.value });
        } else if (message.LocalDBGetKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(message.LocalDBGetKVFailure.message || 'LocalDB get failed'));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);
      client.sendDirectToInternalService(request as any).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  /**
   * Set a value in LocalDB
   * @param cid - The user's CID for scoped storage
   * @param key - The storage key
   * @param value - The value as a byte array
   */
  async sendLocalDBSet(cid: string, key: string, value: number[]): Promise<void> {
    const requestId = crypto.randomUUID();
    const client = this.getClient();

    if (!client) {
      throw new Error('No WebSocket client available');
    }

    const request = {
      LocalDBSetKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null,
        key,
        value
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBSetKV request timed out'));
      }, 5000);

      const handleMessage = (message: any) => {
        if (message.LocalDBSetKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve();
        } else if (message.LocalDBSetKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(message.LocalDBSetKVFailure.message || 'LocalDB set failed'));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);
      client.sendDirectToInternalService(request as any).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  /**
   * Convert CID fields from strings to BigInt where needed by the WASM client
   */
  private convertCidFieldsToBigInt(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertCidFieldsToBigInt(item));
    }
    
    if (typeof obj === 'object') {
      const converted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Convert CID-related fields to BigInt
        if ((key === 'cid' || key === 'peer_cid' || key === 'session_cid') && 
            typeof value === 'string' && value !== '') {
          converted[key] = BigInt(value);
        } else {
          converted[key] = this.convertCidFieldsToBigInt(value);
        }
      }
      return converted;
    }
    
    return obj;
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();