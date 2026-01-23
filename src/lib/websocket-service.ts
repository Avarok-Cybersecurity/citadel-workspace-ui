import { WorkspaceClient } from 'citadel-workspace-client-ts';
import { connectionManager } from './connection-manager';
import { debugLog, errorLog } from './debug-config';

// New multi-instance architecture imports
import { instanceManager, instanceChannel, instanceInboundRouter } from './multi-instance';

// Extracted modules
import {
  LocalDBOperations,
  SessionManagement,
  FilePicker,
  P2POperations,
  MessengerOperations,
  DisconnectOperations,
  AuthOperations,
  WebSocketInitialization,
  WorkspaceOperations,
  GLOBAL_INIT_KEY
} from './websocket';

export interface WebSocketServiceConfig {
  websocketUrl?: string;
  messageHandler?: (message: unknown) => void;
  errorHandler?: (error: Error) => void;
}

class WebSocketService {
  private client: WorkspaceClient | null = null;
  private config: WebSocketServiceConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Extracted modules
  private readonly localDB: LocalDBOperations;
  private readonly sessionMgmt: SessionManagement;
  private readonly filePicker: FilePicker;
  private readonly p2pOps: P2POperations;
  private readonly messengerOps: MessengerOperations;
  private readonly disconnectOps: DisconnectOperations;
  private readonly authOps: AuthOperations;
  private readonly initOps: WebSocketInitialization;
  private readonly workspaceOps: WorkspaceOperations;

  /** Get the client, throwing if not initialized */
  private get assertClient(): WorkspaceClient {
    if (!this.client) {
      throw new Error('WebSocket client not initialized. Call init() first.');
    }
    return this.client;
  }

  constructor(config: WebSocketServiceConfig = {}) {
    this.config = {
      websocketUrl: config.websocketUrl || 'ws://localhost:12345',
      messageHandler: config.messageHandler,
      errorHandler: config.errorHandler,
    };

    // Initialize extracted modules with dependency injection
    const moduleConfig = {
      init: () => this.init(),
      sendRequest: (req: unknown, reqId?: string) => this._sendRequest(req, reqId),
      getClient: () => this.client,
    };

    this.localDB = new LocalDBOperations(moduleConfig);
    this.sessionMgmt = new SessionManagement(moduleConfig);
    this.filePicker = new FilePicker(moduleConfig);

    // P2P operations config
    const p2pConfig = {
      init: () => this.init(),
      sendMessage: (msg: unknown) => this.sendMessage(msg),
      isLeader: () => instanceManager.isLeader,
    };
    this.p2pOps = new P2POperations(p2pConfig);

    // Messenger operations config
    const messengerConfig = {
      init: () => this.init(),
      getClient: () => this.client,
    };
    this.messengerOps = new MessengerOperations(messengerConfig);

    // Disconnect operations config
    const disconnectConfig = {
      init: () => this.init(),
      sendRequest: (req: unknown, reqId?: string) => this._sendRequest(req, reqId),
    };
    this.disconnectOps = new DisconnectOperations(disconnectConfig);

    // Auth operations config
    const authConfig = {
      init: () => this.init(),
      sendRequest: (req: unknown, reqId?: string) => this._sendRequest(req, reqId),
      claimSession: (cid: bigint, onlyIfOrphaned: boolean) => this.claimSession(cid, onlyIfOrphaned),
      disconnect: (cid: bigint) => this.disconnect(cid),
    };
    this.authOps = new AuthOperations(authConfig);

    // Initialization operations config
    const initConfig = {
      websocketUrl: this.config.websocketUrl!,
      messageHandler: this.config.messageHandler,
      errorHandler: this.config.errorHandler,
      onClientCreated: (client: WorkspaceClient) => {
        this.client = client;
        this.isInitialized = true;
      },
      onClientReset: () => {
        this.client = null;
        this.isInitialized = false;
        this.initializationPromise = null;
      },
      releaseSession: (cid: bigint) => this.releaseSession(cid),
    };
    this.initOps = new WebSocketInitialization(initConfig);

    // Workspace operations config
    const workspaceConfig = {
      init: () => this.init(),
      getClient: () => this.client,
    };
    this.workspaceOps = new WorkspaceOperations(workspaceConfig);
  }

  async init(): Promise<void> {
    // Check global state first - silent return if already initialized (normal path)
    if (window[GLOBAL_INIT_KEY]?.initialized) {
      this.isInitialized = true;
      if (window[GLOBAL_INIT_KEY].client) {
        this.client = window[GLOBAL_INIT_KEY].client;
      }
      return;
    }

    if (this.isInitialized) {
      debugLog('websocket', 'Service already initialized');
      return;
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
      if (window[GLOBAL_INIT_KEY]) {
        window[GLOBAL_INIT_KEY].initialized = true;
      }
    } catch (error) {
      window[GLOBAL_INIT_KEY] = undefined;
      throw error;
    }
  }

  private async _doInit(): Promise<void> {
    debugLog('websocket', 'WASM client initialization starting...');

    // Set up WASM debug bridge before initializing client
    const { setupWasmDebugBridge } = await import('./wasm-debug-bridge');
    setupWasmDebugBridge();

    // Wait for leader election to settle
    debugLog('websocket', 'Waiting for leader election to settle...');
    await this.initOps.waitForLeaderElection();

    const isLeader = instanceManager.isLeader;
    debugLog('websocket', `Leader election complete. This tab is ${isLeader ? 'LEADER' : 'FOLLOWER'}`);

    if (!isLeader) {
      this.initOps.initializeAsFollower();
      this.isInitialized = true;
      this.client = null;
      return;
    }

    // LEADER: Create the WebSocket connection
    this.client = await this.initOps.createWebSocketAsLeader();
    this.isInitialized = true;
  }

  async connect(
    requestId: string,
    username: string,
    password: string,
    serverAddr: string,
    serverPassword?: string,
    sessionSecuritySettings?: Record<string, unknown>
  ): Promise<void> {
    return this.authOps.connect(requestId, username, password, serverAddr, serverPassword, sessionSecuritySettings);
  }

  async register(
    requestId: string,
    username: string,
    password: string,
    fullName: string,
    serverAddr: string,
    serverPassword?: string,
    sessionSecuritySettings?: Record<string, unknown>
  ): Promise<void> {
    return this.authOps.register(requestId, username, password, fullName, serverAddr, serverPassword, sessionSecuritySettings);
  }

  async sendWorkspaceRequest(cid: bigint, request: unknown): Promise<void> {
    return this.workspaceOps.sendWorkspaceRequest(cid, request);
  }

  async sendP2PMessage(cid: bigint, targetCid: bigint, message: string): Promise<void> {
    return this.p2pOps.sendP2PMessage(cid, targetCid, message);
  }

  async openP2PConnection(cid: bigint, targetCid: bigint): Promise<void> {
    return this.p2pOps.openP2PConnection(cid, targetCid);
  }

  /**
   * Accept an incoming P2P connection request.
   * This is sent in response to PeerConnectNotification to complete the handshake.
   * @param cid - Our session CID
   * @param peerCid - The peer who initiated the connection
   * @param notification - The original PeerConnectNotification (for session_security_settings and udp_mode)
   */
  async acceptPeerConnect(cid: bigint, peerCid: bigint, notification: Record<string, unknown> | null): Promise<void> {
    return this.p2pOps.acceptPeerConnect(cid, peerCid, notification);
  }

  /**
   * Disconnect from a specific P2P peer.
   * Sends PeerDisconnect request - C2S connection stays active.
   * Can reconnect later via openP2PConnection().
   * @param localCid - Our session CID
   * @param peerCid - The peer to disconnect from
   */
  async disconnectP2P(localCid: bigint, peerCid: bigint): Promise<void> {
    return this.p2pOps.disconnectP2P(localCid, peerCid);
  }

  /**
   * Open a messenger handle for the given CID.
   * Creates an ISM (InterSession Messaging) channel for reliable-ordered messaging.
   * NOTE: This does NOT establish a P2P connection - it only creates a local messaging handle.
   * @param cid - The CID to open the messenger for
   */
  async openMessengerFor(cid: bigint): Promise<void> {
    return this.messengerOps.openMessengerFor(cid);
  }

  /**
   * Ensures a messenger handle is open for the given CID.
   * Returns true if the messenger was just opened, false if already open.
   * @param cid - The CID to ensure messenger is open for
   */
  async ensureMessengerOpen(cid: bigint): Promise<boolean> {
    return this.messengerOps.ensureMessengerOpen(cid);
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
    localCid: bigint,
    peerCid: bigint,
    message: Uint8Array,
    securityLevel?: 'Standard' | 'Reinforced' | 'High' | 'Extreme'
  ): Promise<void> {
    return this.messengerOps.sendP2PMessageReliable(localCid, peerCid, message, securityLevel);
  }

  /**
   * Disconnect a session from the server.
   * Waits for DisconnectNotification from backend before resolving.
   * @param cid - The CID of the session to disconnect (REQUIRED)
   */
  async disconnect(cid: bigint): Promise<void> {
    return this.disconnectOps.disconnect(cid);
  }

  /**
   * Deregister from the server - permanently removes the account
   * This is different from disconnect which only ends the session.
   */
  async deregister(cid: bigint): Promise<void> {
    return this.disconnectOps.deregister(cid);
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
   * SINGLE-WEBSOCKET ARCHITECTURE: Send a request to the internal service.
   * - Leader: Sends directly via WebSocket
   * - Follower: Proxies through leader via BroadcastChannel
   *
   * This is the core send method that all other methods should use.
   */
  private async _sendRequest(request: any, requestId?: string): Promise<void> {
    await this.init();

    // DEBUG: Log leadership decision
    const messageType = Object.keys(request)[0] || 'unknown';
    console.log(`[ILM-TRACE] _sendRequest: isLeader=${instanceManager.isLeader}, leaderId=${instanceManager.leaderId}, instanceId=${instanceManager.instanceId}, msgType=${messageType}`);

    if (instanceManager.isLeader) {
      // LEADER: Send directly via WebSocket
      if (!this.client) {
        console.error(`[ILM-TRACE] ERROR: Leader without client! Cannot send ${messageType}`);
        throw new Error('WebSocket client not available (leader without client)');
      }
      console.log(`[ILM-TRACE] [Leader] Sending ${messageType} directly`);
      await this.client.sendDirectToInternalService(request);
    } else {
      // FOLLOWER: Proxy through leader via InstanceChannel
      console.log(`[ILM-TRACE] [Follower] Proxying ${messageType} through leader ${instanceManager.leaderId}`);
      const id = requestId || crypto.randomUUID();

      // Register the request with instance inbound router for response routing
      // NOTE: This is on the FOLLOWER side - the LEADER also needs to register via channel:outbound-request event
      instanceInboundRouter.registerPendingRequest(id, instanceManager.instanceId);

      // Send to leader - this returns when ACK is received
      const result = await instanceChannel.sendToLeader(request, id);

      if (result.status === 'error') {
        console.error(`[ILM-TRACE] [Follower] Proxy FAILED for ${messageType}: ${result.error}`);
        throw new Error(`Leader failed to send request: ${result.error}`);
      }

      console.log(`[ILM-TRACE] [Follower] Request ${messageType} proxied successfully`);
    }
  }

  /**
   * Send a direct message to the internal service
   * With serde-wasm-bindgen + ts_rs bigint annotations, BigInt CIDs pass directly to WASM
   */
  async sendMessage(message: any): Promise<void> {
    await this._sendRequest(message);
  }

  // ============== Session Management (delegated) ==============

  async setOrphanMode(enabled: boolean): Promise<unknown> {
    return this.sessionMgmt.setOrphanMode(enabled);
  }

  setOrphanModeNonBlocking(enabled: boolean): void {
    this.sessionMgmt.setOrphanModeNonBlocking(enabled);
  }

  async claimSession(sessionCid: string | bigint, onlyIfOrphaned: boolean = false): Promise<unknown> {
    return this.sessionMgmt.claimSession(sessionCid, onlyIfOrphaned);
  }

  async disconnectOrphan(sessionCid?: string | bigint | null): Promise<unknown> {
    return this.sessionMgmt.disconnectOrphan(sessionCid);
  }

  releaseSession(sessionCid: bigint): void {
    this.sessionMgmt.releaseSession(sessionCid);
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
   * SINGLE-WEBSOCKET ARCHITECTURE: Uses _sendRequest which handles leader/follower
   */
  async sendRequest(request: any): Promise<any> {
    await this.init();
    return this._sendRequest(request);
  }

  /**
   * Get current connection info including CID
   */
  async getConnectionInfo(): Promise<{ cid: bigint } | null> {
    return connectionManager.getConnectionInfo();
  }

  // ============== LocalDB Methods (delegated) ==============

  async sendLocalDBGet(cid: bigint, key: string): Promise<{ value: number[] } | null> {
    return this.localDB.get(cid, key);
  }

  async sendLocalDBSet(cid: bigint, key: string, value: number[]): Promise<void> {
    return this.localDB.set(cid, key, value);
  }

  async sendLocalDBDelete(cid: bigint, key: string): Promise<void> {
    return this.localDB.delete(cid, key);
  }

  async sendLocalDBListKeys(cid: bigint, prefix?: string): Promise<string[]> {
    return this.localDB.listKeys(cid, prefix);
  }

  // ============== File Picker (delegated) ==============

  async pickFile(
    cid: bigint,
    title?: string,
    allowedExtensions?: string[]
  ): Promise<{ file_path: string; file_name: string; file_size: bigint }> {
    return this.filePicker.pickFile(cid, title, allowedExtensions);
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();
