import { WorkspaceClient, type WorkspaceClientConfig } from 'citadel-workspace-client-ts';
import { eventEmitter } from './event-emitter';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { broadcastChannelService } from './broadcast-channel-service';
import { connectionManager } from './connection-manager';
import { debugLog, errorLog } from './debug-config';
import { normalizeHeaderObfuscatorSettings } from './security-utils';
import { resolveServerAddress } from './address-resolver';

// New multi-instance architecture imports
import { instanceManager } from './instance-manager';
import { instanceChannel } from './instance-channel';
import { leaderOutboundHandler } from './leader-outbound-handler';
import { instanceInboundRouter } from './instance-inbound-router';

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
      messageHandler: (rawMessage: InternalServiceResponse) => {
        // With serde-wasm-bindgen and ts_rs bigint annotations, WASM returns native BigInt for u64 CID fields
        const message = rawMessage;

        debugLog('websocket', 'Message received from WASM client', message);

        // DEBUG: Log Connect responses specifically
        const resp = (message as any).Response || message;
        if ('ConnectSuccess' in resp) {
          console.log('[WS-MSG] ConnectSuccess received:', resp.ConnectSuccess);
        } else if ('ConnectFailure' in resp) {
          console.log('[WS-MSG] ConnectFailure received:', resp.ConnectFailure);
        }

        // NEW: Route inbound messages through instance inbound router
        // The router will forward to the correct instance based on CID
        if (instanceManager.isLeader) {
          instanceInboundRouter.routeMessage(message);
        }

        // Legacy: Broadcast the message to other tabs if we're the leader
        // This is being replaced by instanceInboundRouter but kept for compatibility
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

      // Notify all listeners that WebSocket connection is ready
      // Services can now safely use WebSocket for their initialization
      eventEmitter.emit('on-ws-connection-success');

      // Store client in global state for sharing across instances
      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].client = this.client;
      }

      // NEW: Register the direct send function with leader outbound handler
      // This allows the handler to send messages when this instance is leader
      leaderOutboundHandler.setWebSocketSendFunction(async (message: any) => {
        if (this.client) {
          await this.client.sendDirectToInternalService(message);
        }
      });
      debugLog('websocket', 'Registered send function with leader outbound handler');

      // Listen for WebSocket disconnection to stop the message processing loop
      // This prevents the UI from freezing when the WebSocket dies
      // Also reset initialization state to allow re-initialization on next connect
      eventEmitter.on('websocket-disconnected', async () => {
        debugLog('websocket', 'WebSocket disconnected event received, stopping message processing and resetting state');
        if (this.client) {
          this.client.stopMessageProcessing();
          // CRITICAL: Call close() to reset WASM internal state
          // This ensures is_initialized() returns false, allowing init() to succeed on reconnect
          // Without this, the WASM module's workspace_state remains Some(...) and init() fails
          // with "Already initialized" error when user tries to login again
          try {
            await this.client.close();
            debugLog('websocket', 'WASM client closed successfully');
          } catch (closeError) {
            // Ignore errors during close - the connection is already dead
            debugLog('websocket', 'WASM client close error (ignored):', closeError);
          }
          this.client = null;
        }
        // Reset initialization state to allow re-initialization
        // This is critical for scenarios like sign-out + re-login where the WebSocket
        // closes but the page stays open (no page reload)
        this.isInitialized = false;
        this.initializationPromise = null;
        // Clear global state to allow full re-initialization
        window[GLOBAL_INIT_KEY] = undefined;
        debugLog('websocket', 'WebSocket service state reset after disconnection');
      });

      // Listen for session release requests (from instance-channel when last tab with a CID closes)
      eventEmitter.on('session:release-request', ({ cid }: { cid: string }) => {
        debugLog('websocket', `Session release requested for CID ${cid}`);
        this.releaseSession(cid);
      });

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

  async connect(requestId: string, username: string, password: string, serverAddr: string, serverPassword?: string, sessionSecuritySettings?: any): Promise<void> {
    await this.init(); // ensure initialized

    // Resolve hostname to IP if needed (DNS resolution)
    const resolvedAddr = await resolveServerAddress(serverAddr);
    console.log(`[Connect] Resolved address: ${serverAddr} -> ${resolvedAddr}`);

    // Clear user-disconnected status on explicit login attempt
    // This allows users to log back in after explicitly disconnecting
    // userDisconnectedSessions is for AUTO-reconnect prevention, not blocking explicit login
    const { serverAutoConnectService } = await import('./server-auto-connect-service');
    serverAutoConnectService.clearUserDisconnected(username, resolvedAddr);

    // STEP 1: Check if session already exists
    console.log(`[Connect] Checking for existing session: ${username}@${resolvedAddr}`);

    try {
      const { connectionManager } = await import('./connection-manager');
      const activeSessions = await connectionManager.getActiveSessions();

      const existingSession = activeSessions.find(
        s => s.username === username && s.server_address === resolvedAddr
      );

      if (existingSession) {
        console.log(`[Connect] Found existing session CID ${existingSession.cid}`);

        // STEP 2: Check if session is orphaned
        // Heuristic: Session is likely orphaned if it exists in GetSessions
        // but we don't have a stored CID for it, OR if workspace load fails
        const { connectionManager: cm } = await import('./connection-manager');
        const storedSession = cm.getStoredSessions().sessions.find(
          s => s.username === username && s.serverAddress === resolvedAddr
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
          // disconnect() now waits for DisconnectNotification signal before resolving
          // No artificial delay needed - backend confirmed cleanup via signal
          await this.disconnect(existingSession.cid.toString());
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
      server_addr: resolvedAddr,
      username,
      password: stringToByteArray(password),
      connect_mode: { Standard: { force_login: true } } as any,
      udp_mode: "Disabled" as any,
      keep_alive_timeout: null,
      // Use provided session security settings or defaults
      session_security_settings: {
        security_level: sessionSecuritySettings?.securityLevel || "Standard",
        secrecy_mode: sessionSecuritySettings?.secrecyMode || "BestEffort",
        header_obfuscator_settings: normalizeHeaderObfuscatorSettings(sessionSecuritySettings?.headerObfuscatorSettings),
        crypto_params: {
          encryption_algorithm: sessionSecuritySettings?.encryptionAlgorithm || "AES_GCM_256",
          kem_algorithm: sessionSecuritySettings?.kemAlgorithm || "Kyber",
          sig_algorithm: sessionSecuritySettings?.sigAlgorithm || "None"
        },
      },
      server_password: serverPassword || null
    };

    // Send connect request directly to avoid the waitForResponse handler replacement issue
    const connectRequest = {
      Connect: connectOptions
    };

    // DEBUG: Log the connect request being sent
    console.log(`[Connect] Sending Connect request with request_id: ${requestId}`);
    console.log(`[Connect] WebSocket client initialized: ${this.isInitialized}, client exists: ${!!this.client}`);

    // Send directly to internal service without using the problematic waitForResponse pattern
    try {
      await this.client.sendDirectToInternalService(connectRequest);
      console.log(`[Connect] Connect request sent successfully for ${username}`);
    } catch (sendError) {
      console.error(`[Connect] FAILED to send Connect request:`, sendError);
      throw sendError;
    }
  }

  async register(requestId: string, username: string, password: string, fullName: string, server_addr: string, server_password?: string, sessionSecuritySettings?: any): Promise<void> {
    await this.init(); // ensure initialized

    // Resolve hostname to IP if needed (DNS resolution)
    const resolvedAddr = await resolveServerAddress(server_addr);
    console.log(`[Register] Resolved address: ${server_addr} -> ${resolvedAddr}`);

    const registerOptions = {
      request_id: requestId,
      server_addr: resolvedAddr,
      full_name: fullName,
      username,
      proposed_password: stringToByteArray(password),
      connect_after_register: true, // Establish connection immediately after registration
      // Use provided session security settings or defaults
      session_security_settings: {
        security_level: sessionSecuritySettings?.securityLevel || "Standard",
        secrecy_mode: sessionSecuritySettings?.secrecyMode || "BestEffort",
        header_obfuscator_settings: normalizeHeaderObfuscatorSettings(sessionSecuritySettings?.headerObfuscatorSettings),
        crypto_params: {
          encryption_algorithm: sessionSecuritySettings?.encryptionAlgorithm || "AES_GCM_256",
          kem_algorithm: sessionSecuritySettings?.kemAlgorithm || "Kyber",
          sig_algorithm: sessionSecuritySettings?.sigAlgorithm || "None"
        },
      },
      server_password: server_password || null
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
   * Accept an incoming P2P connection request.
   * This is sent in response to PeerConnectNotification to complete the handshake.
   * @param cid - Our session CID
   * @param peerCid - The peer who initiated the connection
   * @param notification - The original PeerConnectNotification (for session_security_settings and udp_mode)
   */
  async acceptPeerConnect(cid: string, peerCid: string, notification: any): Promise<void> {
    await this.init(); // ensure initialized

    if (!cid || !peerCid) {
      throw new Error('CID and peerCid are required to accept P2P connection');
    }

    debugLog('websocket', 'Accepting P2P connection', { cid, peerCid });

    const requestId = crypto.randomUUID();
    const acceptRequest = {
      PeerConnectAccept: {
        request_id: requestId,
        cid: cid,
        peer_cid: peerCid,
        accept: true,
        udp_mode: notification?.udp_mode || 'Disabled',
        session_security_settings: notification?.session_security_settings || {
          security_level: 'Standard',
          secrecy_mode: 'BestEffort',
          crypto_params: {
            encryption_algorithm: 'AES_GCM_256',
            kem_algorithm: 'Kyber',
            sig_algorithm: 'None'
          },
          header_obfuscator_settings: 'Disabled'
        },
        peer_session_password: null
      }
    };

    // Send the request and wait for success/failure (with shorter timeout since it should be fast)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        // Don't reject on timeout - this is a best-effort accept
        console.warn('PeerConnectAccept timed out - continuing with PeerConnect fallback');
        resolve();
      }, 10000);

      const handler = (message: any) => {
        if ('PeerConnectAcceptSuccess' in message && message.PeerConnectAcceptSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'P2P connection accept sent', { peerCid });
          resolve();
        } else if ('PeerConnectAcceptFailure' in message && message.PeerConnectAcceptFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          const error = message.PeerConnectAcceptFailure.message || 'PeerConnectAccept failed';
          // Don't reject - we'll fall back to PeerConnect
          console.warn('PeerConnectAccept failed:', error, '- will use PeerConnect fallback');
          resolve();
        }
      };

      eventEmitter.on('websocket-message', handler);

      // Send the request
      this.sendMessage(acceptRequest).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        // Don't reject - we'll fall back to PeerConnect
        console.warn('Failed to send PeerConnectAccept:', error);
        resolve();
      });
    });
  }

  /**
   * Disconnect from a specific P2P peer.
   * Sends PeerDisconnect request - C2S connection stays active.
   * Can reconnect later via openP2PConnection().
   * @param localCid - Our session CID
   * @param peerCid - The peer to disconnect from
   */
  async disconnectP2P(localCid: string, peerCid: string): Promise<void> {
    await this.init(); // ensure initialized

    if (!localCid) {
      throw new Error('Local CID is required to disconnect P2P');
    }

    if (!peerCid) {
      throw new Error('Peer CID is required to disconnect P2P');
    }

    debugLog('websocket', 'Disconnecting P2P connection', { localCid, peerCid });

    const requestId = crypto.randomUUID();
    const peerDisconnectRequest = {
      PeerDisconnect: {
        request_id: requestId,
        cid: localCid, // our CID - will be converted to BigInt by sendMessage
        peer_cid: peerCid // peer CID - will be converted to BigInt by sendMessage
      }
    };

    // Send the request and wait for success/failure
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('PeerDisconnect request timed out'));
      }, 10000);

      const handler = (message: any) => {
        // Check for PeerDisconnectSuccess with matching request_id
        if ('PeerDisconnectSuccess' in message && message.PeerDisconnectSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'P2P disconnect successful', { peerCid });
          resolve();
        }
        // Also accept DisconnectNotification with matching peer_cid (peer-initiated disconnect)
        else if ('DisconnectNotification' in message) {
          const notification = message.DisconnectNotification;
          if (notification.request_id === requestId ||
              notification.peer_cid?.toString() === peerCid) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            debugLog('websocket', 'P2P disconnect notification received', { peerCid });
            resolve();
          }
        }
        // Check for PeerDisconnectFailure with matching request_id
        else if ('PeerDisconnectFailure' in message && message.PeerDisconnectFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          const error = message.PeerDisconnectFailure.message || 'PeerDisconnect failed';
          errorLog('P2P disconnect failed:', error);
          reject(new Error(error));
        }
      };

      eventEmitter.on('websocket-message', handler);

      // Send the request
      this.sendMessage(peerDisconnectRequest).catch(error => {
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

  /**
   * Disconnect a session from the server.
   * Waits for DisconnectNotification from backend before resolving.
   * This ensures the session is fully cleaned up before the Promise resolves.
   * @param cid - The CID of the session to disconnect (REQUIRED)
   */
  async disconnect(cid: string): Promise<void> {
    if (!cid) {
      throw new Error('CID is required to disconnect a session');
    }

    await this.init(); // ensure initialized

    const requestId = crypto.randomUUID();
    const request = {
      Disconnect: {
        request_id: requestId,
        cid: cid
      }
    };

    debugLog('websocket', 'Sending Disconnect request', request);

    // Wait for DisconnectNotification or DisconnectFailure response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('Disconnect request timed out'));
      }, 30000); // 30 second timeout

      const handler = (message: any) => {
        const response = message.Response || message;

        // Check for DisconnectNotification with matching request_id
        if ('DisconnectNotification' in response) {
          const notification = response.DisconnectNotification;
          // Match by request_id if present, otherwise match by cid
          if (notification.request_id === requestId ||
              (notification.request_id === null && notification.cid?.toString() === cid)) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            debugLog('websocket', 'Disconnect successful for CID:', cid);
            resolve();
          }
        }

        // Check for DisconnectFailure with matching request_id
        if ('DisconnectFailure' in response) {
          const failure = response.DisconnectFailure;
          if (failure.request_id === requestId ||
              (failure.request_id === null && failure.cid?.toString() === cid)) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            errorLog('Disconnect failed:', failure.message);
            reject(new Error(failure.message || 'Failed to disconnect'));
          }
        }
      };

      eventEmitter.on('websocket-message', handler);

      // Send the request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        errorLog('Error sending disconnect request:', error);
        reject(error);
      });
    });
  }

  /**
   * Deregister from the server - permanently removes the account
   * This is different from disconnect which only ends the session.
   * Use this for complete cleanup between test runs.
   */
  async deregister(cid: string): Promise<void> {
    await this.init(); // ensure initialized

    const requestId = crypto.randomUUID();
    const request = {
      Deregister: {
        request_id: requestId,
        cid: cid
      }
    };

    debugLog('websocket', 'Sending Deregister request', request);

    // Set up event listener for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('Deregister request timed out'));
      }, 30000); // 30 second timeout

      const handler = (message: any) => {
        const response = message.Response || message;

        if ('DeregisterSuccess' in response && response.DeregisterSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'Deregister successful for CID:', cid);
          resolve();
        }

        if ('DeregisterFailure' in response && response.DeregisterFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.DeregisterFailure.message || 'Failed to deregister'));
        }
      };

      eventEmitter.on('websocket-message', handler);

      // Send the request
      this.client.sendDirectToInternalService(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }

  async disconnectAndClose(): Promise<void> {
    // This completely closes the WebSocket connection
    this.client = null;
    this.isInitialized = false;
  }

  /**
   * Reset the WebSocket service state to allow re-initialization.
   * Call this before attempting to reconnect after a connection failure.
   * This clears both local and global state.
   */
  reset(): void {
    debugLog('websocket', 'Resetting WebSocket service state for reconnection');

    // Clear local state
    this.client = null;
    this.isInitialized = false;
    this.initializationPromise = null;

    // Clear global state to allow re-initialization
    window[GLOBAL_INIT_KEY] = undefined;

    debugLog('websocket', 'WebSocket service state reset complete');
  }

  isConnected(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Wait for WebSocket initialization to complete.
   * Use this before making requests that require a connected WebSocket.
   * Returns immediately if already initialized.
   */
  async waitForInit(): Promise<void> {
    // Already initialized - return immediately
    if (this.isInitialized && this.client) {
      return;
    }

    // Check global state
    if (window[GLOBAL_INIT_KEY]?.initialized && window[GLOBAL_INIT_KEY]?.client) {
      this.isInitialized = true;
      this.client = window[GLOBAL_INIT_KEY].client;
      return;
    }

    // Wait for initialization promise if it exists
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    // Wait for global initialization promise if it exists
    if (window[GLOBAL_INIT_KEY]?.promise) {
      await window[GLOBAL_INIT_KEY].promise;
      if (window[GLOBAL_INIT_KEY]?.client) {
        this.client = window[GLOBAL_INIT_KEY].client;
        this.isInitialized = true;
      }
      return;
    }

    // If no initialization is in progress, start it
    await this.init();
  }

  getClient(): WorkspaceClient | null {
    return this.client;
  }

  /**
   * Send a direct message to the internal service
   * With serde-wasm-bindgen + ts_rs bigint annotations, BigInt CIDs pass directly to WASM
   */
  async sendMessage(message: any): Promise<void> {
    await this.init();
    await this.client.sendDirectToInternalService(message);
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
      }, 3000); // Reduced from 10s to 3s - fail fast, don't block UI
      
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
   * Non-blocking version of setOrphanMode for initialization
   * Fire-and-forget - don't wait for response, don't block UI
   */
  setOrphanModeNonBlocking(enabled: boolean): void {
    this.setOrphanMode(enabled).catch(err => {
      console.warn('[WebSocketService] setOrphanMode failed (non-blocking):', err.message);
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
            session_cid: sessionCidString,
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
   * Release a session, marking it as orphaned for immediate reclaiming.
   * Called when the last browser tab with this CID closes.
   * This is a fire-and-forget operation since it's called during beforeunload.
   * @param sessionCid The CID of the session to release
   */
  releaseSession(sessionCid: string | bigint): void {
    if (!this.client) {
      console.warn('[WebSocketService] Cannot release session - client not initialized');
      return;
    }

    // Convert to string to avoid BigInt JSON serialization issues
    const cidString = sessionCid.toString();

    const request = {
      ConnectionManagement: {
        request_id: crypto.randomUUID(),
        management_command: {
          ReleaseSession: {
            session_cid: cidString
          }
        }
      }
    };

    debugLog('websocket', `Releasing session ${cidString}`);

    // Fire-and-forget - don't await since tab may be closing
    this.client.sendDirectToInternalService(request).catch(error => {
      console.error('[WebSocketService] Failed to release session:', error);
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
   * Delete a key from LocalDB
   * @param cid - The user's CID for scoped storage
   * @param key - The storage key to delete
   */
  async sendLocalDBDelete(cid: string, key: string): Promise<void> {
    const requestId = crypto.randomUUID();
    const client = this.getClient();

    if (!client) {
      throw new Error('No WebSocket client available');
    }

    const request = {
      LocalDBDeleteKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null,
        key
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBDeleteKV request timed out'));
      }, 5000);

      const handleMessage = (message: any) => {
        if (message.LocalDBDeleteKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve();
        } else if (message.LocalDBDeleteKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(message.LocalDBDeleteKVFailure.message || 'LocalDB delete failed'));
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
   * Get all keys from LocalDB matching a prefix
   * @param cid - The user's CID for scoped storage
   * @param prefix - Optional prefix to filter keys
   * @returns Array of keys matching the prefix
   */
  async sendLocalDBListKeys(cid: string, prefix?: string): Promise<string[]> {
    const requestId = crypto.randomUUID();
    const client = this.getClient();

    if (!client) {
      throw new Error('No WebSocket client available');
    }

    const request = {
      LocalDBGetAllKV: {
        request_id: requestId,
        cid: cid,
        peer_cid: null
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('LocalDBGetAllKV request timed out'));
      }, 5000);

      const handleMessage = (message: any) => {
        if (message.LocalDBGetAllKVSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          // Extract keys from the map and filter by prefix
          const map = message.LocalDBGetAllKVSuccess.map || {};
          let keys = Object.keys(map);
          if (prefix) {
            keys = keys.filter(k => k.startsWith(prefix));
          }
          resolve(keys);
        } else if (message.LocalDBGetAllKVFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(message.LocalDBGetAllKVFailure.message || 'LocalDB get all failed'));
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

  // ============== File Picker ==============

  /**
   * Open a native file picker dialog to select a file.
   * This requires the internal-service to be running natively (not in browser sandbox).
   * @param cid - The user's CID
   * @param title - Optional title for the file picker dialog
   * @param allowedExtensions - Optional list of allowed file extensions (e.g., ["pdf", "txt"])
   * @returns The selected file's path, name, and size
   */
  async pickFile(
    cid: string,
    title?: string,
    allowedExtensions?: string[]
  ): Promise<{ file_path: string; file_name: string; file_size: bigint }> {
    await this.init(); // ensure initialized

    const requestId = crypto.randomUUID();
    const client = this.getClient();

    if (!client) {
      throw new Error('No WebSocket client available');
    }

    const request = {
      PickFile: {
        request_id: requestId,
        cid: cid,
        title: title || null,
        allowed_extensions: allowedExtensions || null
      }
    };

    debugLog('websocket', 'Sending PickFile request', request);

    return new Promise((resolve, reject) => {
      // Longer timeout for file picker - user interaction can take time
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('File picker timed out'));
      }, 120000); // 2 minute timeout

      const handleMessage = (message: any) => {
        if (message.PickFileSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve({
            file_path: message.PickFileSuccess.file_path,
            file_name: message.PickFileSuccess.file_name,
            file_size: message.PickFileSuccess.file_size
          });
        } else if (message.PickFileFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error(message.PickFileFailure.message || 'File picker failed'));
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
}

// Create singleton instance
export const websocketService = new WebSocketService();
