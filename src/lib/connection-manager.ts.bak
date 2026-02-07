import { websocketService } from './websocket-service';
import { ConnectionService } from './connection-service';
import { eventEmitter } from './event-emitter';
import WorkspaceService from './workspace-service';
import { broadcastChannelService } from './broadcast-channel-service';
import { healthCheckService } from './health-check';
import { getTabData, setTabData, removeTabData, setSelectedUser, getSelectedUser, clearSelectedUser } from './tab-context';
import { peerRegistrationStore } from './peer-registration-store';
import { instanceManager, instanceChannel } from './multi-instance';
// Remove static import to avoid conflict with dynamic import in websocket-service
// import { parseAndFormatMixedContent } from './wasm-debug-bridge';
import { 
  StoredSession, 
  StoredSessions, 
  ConnectionInfo,
  SESSION_STORAGE_KEY,
  LocalDBSetKVRequest,
  LocalDBGetAllKVRequest,
  ActiveSession,
  GetSessionsRequest,
  GetSessionsResponse
} from '@/types/session-types';
import { formatForDebug } from './debug-formatter';
import { safeJSONStringify } from './storage-utils';
import { serverAutoConnectService } from './server-auto-connect-service';
import { SessionSecuritySettings } from './p2p-registration-service';

/**
 * ConnectionManager handles persistent connection management across sessions
 * It stores credentials securely and automatically reconnects when needed
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
 * ║ For ConnectionManager:                                                       ║
 * ║ - StoredSession.cid is preserved across page reloads                         ║
 * ║ - handleSuccessfulConnection() updates currentConnectionInfo with same CID   ║
 * ║ - claimOrphanedSession() reconnects with the SAME CID (no new CID created)   ║
 * ║ - autoReconnect() checks for existing active session to avoid duplicate CID  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  private isInitialized = false;
  private storedSessions: StoredSessions = { sessions: [] };
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isLeader = false;
  private currentConnectionInfo: { cid: bigint; username?: string; serverAddress?: string; fullName?: string } | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  // Request deduplication and caching for getActiveSessions()
  private pendingGetSessions: Promise<ActiveSession[]> | null = null;
  private cachedSessions: ActiveSession[] | null = null;
  private cachedSessionsTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 2000; // 2 second cache

  // Concurrency guard to prevent duplicate connection attempts
  private connectionAttempts: Set<string> = new Set();

  // Store unsubscribe functions to properly clean up our own listeners
  // (without affecting other services' listeners for the same events)
  private static cleanupFunctions: (() => void)[] = [];

  private constructor() {
    // Create a promise that resolves when initialization is complete
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    this.setupEventListeners();
    this.setupLeaderElection();
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Initialize the connection manager and WebSocket service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('ConnectionManager already initialized');
      return;
    }

    try {
      console.log('ConnectionManager: Initializing...');

      // Step 1: Initialize WebSocket service first (required)
      await websocketService.init();

      // Step 2: Fire-and-forget orphan mode - don't block on this
      console.log('ConnectionManager: Enabling orphan mode (non-blocking)...');
      websocketService.setOrphanModeNonBlocking(true);

      // Step 3: Run these in parallel - they don't depend on each other
      const [activeSessions] = await Promise.all([
        // Get active sessions from internal service (has its own timeout)
        this.getActiveSessions().catch(() => ({ sessions: [] })),
        // Load stored sessions
        this.loadStoredSessions(),
        // Initialize peer registration store
        peerRegistrationStore.initialize().catch(error => {
          console.warn('ConnectionManager: Failed to initialize peer registration store', error);
        }),
      ]);

      // Clear stored CIDs on page reload to force fresh connections
      // This prevents using stale CIDs from previous WebSocket connections
      if (this.storedSessions.sessions.length > 0) {
        console.log('ConnectionManager: Clearing stored CIDs to force fresh connection');
        for (const session of this.storedSessions.sessions) {
          session.cid = undefined;
        }
        await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
      }

      this.isInitialized = true;
      console.log('ConnectionManager: Initialized successfully');

      // Step 4: Fire-and-forget server auto-connect (non-critical)
      serverAutoConnectService.init().catch(error => {
        console.warn('ConnectionManager: Failed to initialize server auto-connect service:', error);
      });

      // Resolve ready promise to unblock waiting callers
      if (this.readyResolve) {
        this.readyResolve();
      }
    } catch (error) {
      console.error('ConnectionManager: Initialization failed', error);
      // Still resolve ready promise even on error to avoid deadlock
      if (this.readyResolve) {
        this.readyResolve();
      }
      throw error;
    }
  }

  /**
   * Wait for ConnectionManager to finish initialization
   * This ensures stored sessions are loaded before attempting to use them
   */
  public async waitForReady(): Promise<void> {
    if (this.isInitialized) {
      return Promise.resolve();
    }
    return this.readyPromise || Promise.resolve();
  }

  /**
   * Setup event listeners for WebSocket responses
   *
   * CRITICAL: On page reload/HMR, the eventEmitter module persists but ConnectionManager
   * is recreated. Old event listeners from the previous instance would still be attached,
   * causing duplicate event handling. We MUST clean up OUR OWN listeners before adding new ones,
   * without affecting other services' listeners for the same events.
   */
  private setupEventListeners(): void {
    // CRITICAL: Clean up only OUR OWN stale listeners from previous instances
    // Use stored unsubscribe functions - don't call eventEmitter.off() which would
    // remove ALL listeners (including from other services like p2p-registration-service)
    for (const cleanup of ConnectionManager.cleanupFunctions) {
      cleanup();
    }
    ConnectionManager.cleanupFunctions = [];

    // Listen for successful connections - store unsubscribe function
    const wsUnsubscribe = eventEmitter.on('websocket-message', async (message: any) => {
      await this.handleWebSocketMessage(message);
    });
    ConnectionManager.cleanupFunctions.push(wsUnsubscribe);

    // Listen for broadcast messages from other tabs - store unsubscribe function
    const broadcastUnsubscribe = eventEmitter.on('broadcast-workspace-response', async (message: any) => {
      await this.handleWebSocketMessage(message);
    });
    ConnectionManager.cleanupFunctions.push(broadcastUnsubscribe);
  }

  /**
   * Setup leader election handling
   */
  private setupLeaderElection(): void {
    // Store unsubscribe function - don't use eventEmitter.off() which removes all listeners
    const leaderUnsubscribe = eventEmitter.on('leader-changed', async ({ isLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
      console.log(`ConnectionManager: Leader changed - isLeader: ${isLeader}, leaderId: ${leaderId}`);
      this.isLeader = isLeader;

      if (isLeader) {
        // We just became the leader, attempt to establish connection
        console.log('ConnectionManager: Became leader, attempting to establish connection');
        await this.attemptLeaderConnection();
      } else {
        // We're no longer the leader
        console.log('ConnectionManager: No longer the leader');
        // Optionally disconnect if we have an active connection
        // But for now, let's keep it to allow the leader to handle disconnection
      }
    });
    ConnectionManager.cleanupFunctions.push(leaderUnsubscribe);
  }

  /**
   * Handle WebSocket messages for LocalDB and connection responses
   */
  private async handleWebSocketMessage(message: any): Promise<void> {
    // NOTE: Removed blocking getSelectedUser() call here.
    // The tab selection check was only for debugging cross-CID messages.
    // The call was blocking indefinitely when IndexedDB is in a bad state
    // (e.g., after clearBrowserStorage times out with pending delete operations).
    // Message processing should not depend on IndexedDB for routing decisions.
    
    // Handle LocalDB responses
    if (message.LocalDBSetKVSuccess) {
      console.log('ConnectionManager: Received LocalDBSetKVSuccess');
      const requestId = message.LocalDBSetKVSuccess.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message.LocalDBSetKVSuccess);
        this.pendingRequests.delete(requestId);
      }
    } else if (message.LocalDBSetKVFailure) {
      console.log('ConnectionManager: Received LocalDBSetKVFailure');
      const requestId = message.LocalDBSetKVFailure.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error(message.LocalDBSetKVFailure.message));
        this.pendingRequests.delete(requestId);
      }
    } else if (message.LocalDBGetAllKVSuccess) {
      console.log('ConnectionManager: Received LocalDBGetAllKVSuccess');
      const requestId = message.LocalDBGetAllKVSuccess.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message.LocalDBGetAllKVSuccess);
        this.pendingRequests.delete(requestId);
      }
    } else if (message.LocalDBGetAllKVFailure) {
      console.log('ConnectionManager: Received LocalDBGetAllKVFailure');
      const requestId = message.LocalDBGetAllKVFailure.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.reject(new Error(message.LocalDBGetAllKVFailure.message));
        this.pendingRequests.delete(requestId);
      }
    } else if (message.GetSessionsResponse) {
      const requestId = message.GetSessionsResponse.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message.GetSessionsResponse);
        this.pendingRequests.delete(requestId);
      }
    } else if (message.ConnectionManagementSuccess) {
      console.log('ConnectionManager: Received ConnectionManagementSuccess');
      const requestId = message.ConnectionManagementSuccess.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message);
        this.pendingRequests.delete(requestId);
      }
    } else if (message.ConnectionManagementFailure) {
      console.log('ConnectionManager: Received ConnectionManagementFailure');
      const requestId = message.ConnectionManagementFailure.request_id;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(message);
        this.pendingRequests.delete(requestId);
      }
    }
    
    // Handle successful registration/connection
    const response = message.Response || message;
    if (response.RegisterSuccess || response.ConnectSuccess) {
      const cid = response.RegisterSuccess?.cid || response.ConnectSuccess?.cid;
      console.log(`[ILM-TRACE] ConnectionManager: Received registration/connection success, CID=${cid?.toString()}`);
      // Invalidate session cache so getActiveSessions() returns fresh data including new session
      this.invalidateSessionCache();
      if (cid) {
        // WASM serializes u64 as BigInt - pass directly
        console.log(`[ILM-TRACE] ConnectionManager: Calling handleSuccessfulConnection for CID=${cid.toString()}`);
        // CRITICAL: Pass shouldUpdateStoredSession=false to prevent session CID corruption
        // in multi-tab scenarios. The handleAuthMessage doesn't know which username this
        // response is for, so using activeSessionIndex would update the wrong session.
        // Instead, Join.tsx's handleAuthSuccess (which knows the username) will call
        // storeSession() with the correct CID after this.
        await this.handleSuccessfulConnection(cid, false);
      }
    }

    // Handle successful connection management (session claim, orphan mode, etc.)
    if (response.ConnectionManagementSuccess) {
      console.log('ConnectionManager: Received ConnectionManagementSuccess');
      // Invalidate session cache so getActiveSessions() returns fresh data after session claim
      this.invalidateSessionCache();
      const cid = response.ConnectionManagementSuccess?.cid;
      if (cid) {
        console.log('ConnectionManager: Updating connection info with claimed session CID:', cid);
        await this.handleSuccessfulConnection(cid, false);
      }
    }

    // Handle disconnect notifications - invalidate cache so getActiveSessions() returns fresh data
    if (response.DisconnectNotification) {
      console.log('ConnectionManager: Received DisconnectNotification for CID:', response.DisconnectNotification.cid);
      // Invalidate session cache so subsequent getActiveSessions() calls don't return stale data
      // showing the disconnected session as still active
      this.invalidateSessionCache();
    }

    // Handle connection failures
    if (response.ConnectFailure) {
      console.log('ConnectionManager: Received ConnectFailure:', response.ConnectFailure);
      const errorMessage = response.ConnectFailure.message || '';
      
      // Check if it's a session already connected error
      if (errorMessage.toLowerCase().includes('session already connected')) {
        console.log('ConnectionManager: Session already connected error detected');
        
        // Try to extract CID from error message first
        const cidMatch = errorMessage.match(/cid\s*=\s*(\d+)/i);
        if (cidMatch) {
          const existingCid = cidMatch[1];
          console.log('ConnectionManager: Existing session CID from message:', existingCid);
          
          // Emit event for orphan session handling
          eventEmitter.emit('session-already-connected', {
            cid: existingCid,
            message: errorMessage
          });
        } else {
          // If no CID in message, try to get active sessions to find the conflicting session
          console.log('ConnectionManager: No CID in error message, fetching active sessions...');
          this.getActiveSessions().then(activeSessions => {
            console.log('ConnectionManager: Active sessions after error:', activeSessions);
            
            // Look for a session that matches our current connection attempt
            const matchingSession = activeSessions.find(session => {
              // Match based on username and server address from the current stored session
              const activeIndex = this.storedSessions.activeSessionIndex ?? 0;
              const currentSession = this.storedSessions.sessions[activeIndex];
              return currentSession && 
                     session.username === currentSession.username && 
                     session.server_address === currentSession.serverAddress;
            });
            
            if (matchingSession) {
              console.log('ConnectionManager: Found matching active session:', matchingSession);
              
              // Emit event for orphan session handling with the found CID
              eventEmitter.emit('session-already-connected', {
                cid: matchingSession.cid.toString(),
                message: errorMessage
              });
            } else {
              console.log('ConnectionManager: No matching active session found');
            }
          }).catch(error => {
            console.error('ConnectionManager: Failed to get active sessions:', error);
          });
        }
      }
    }
  }

  /**
   * Handle successful connection by updating connection service
   *
   * @param cid - The connection ID assigned by the server
   * @param shouldUpdateStoredSession - If false, skip session storage and connection status
   *   notifications. Used for register/connect responses where handleAuthSuccess will
   *   handle these with proper userContext to avoid WorkspaceApp deduplication issues.
   */
  private async handleSuccessfulConnection(cid: bigint, shouldUpdateStoredSession: boolean = true): Promise<void> {
    // Store current connection info
    this.currentConnectionInfo = { cid };
    console.log('ConnectionManager: Handling successful connection', cid.toString(), 'shouldUpdateStoredSession:', shouldUpdateStoredSession);

    // Update instance manager with the CID this tab/instance owns
    instanceManager.setCid(cid);
    console.log('ConnectionManager: Set instanceManager CID to', cid.toString());

    // Announce updated CID to other instances so leader knows which CID this instance owns
    instanceChannel.announcePresence();

    // Reset reconnect attempts
    this.reconnectAttempts = 0;

    // If shouldUpdateStoredSession is false, skip the rest - handleAuthSuccess will do it
    // with proper userContext to avoid WorkspaceApp deduplication issues
    if (!shouldUpdateStoredSession) {
      console.log('ConnectionManager: Skipping connection notifications - handleAuthSuccess will handle them');
      return;
    }

    // CRITICAL: Update stored session with CID BEFORE notifying handlers
    // This ensures WorkspaceApp can find the session by CID when onConnectionChange fires
    let sessionUsername: string | undefined;
    if (this.storedSessions.sessions.length > 0) {
      const activeIndex = this.storedSessions.activeSessionIndex ?? 0;
      const session = this.storedSessions.sessions[activeIndex];
      if (session) {
        session.cid = cid;
        session.lastConnected = Date.now();
        sessionUsername = session.username;
        await this.storeSession(session);
        console.log('ConnectionManager: Updated stored session with CID:', cid.toString());
      }
    }

    // Update workspace service with the connection ID
    WorkspaceService.setConnectionId(cid);

    // NOW notify handlers - stored session CID is already set
    const connectionService = ConnectionService.getInstance();
    connectionService.updateConnectionStatus({
      cid,
      isConnected: true
    });

    // Broadcast connection status to other tabs
    broadcastChannelService.broadcastConnectionStatus({
      isConnected: true,
      cid
    });

    // Notify auto-connect service of successful authentication (after stored session is updated)
    if (sessionUsername) {
      eventEmitter.emit('auth:success', { cid, username: sessionUsername });
    }
  }

  /**
   * Get active sessions from the internal service.
   * Uses request deduplication and short-term caching to prevent concurrent requests.
   */
  public async getActiveSessions(): Promise<ActiveSession[]> {
    // Check cache first (2 second TTL)
    const now = Date.now();
    if (this.cachedSessions && (now - this.cachedSessionsTimestamp) < this.CACHE_TTL_MS) {
      // PERF FIX: Removed per-call logging - this is called every 1-2 seconds
      return this.cachedSessions;
    }

    // If a request is already in flight, reuse it (deduplication)
    if (this.pendingGetSessions) {
      // PERF FIX: Removed per-call logging
      return this.pendingGetSessions;
    }

    // Create the actual request
    this.pendingGetSessions = this._fetchActiveSessions();

    try {
      const result = await this.pendingGetSessions;
      // Cache the result
      this.cachedSessions = result;
      this.cachedSessionsTimestamp = Date.now();
      return result;
    } finally {
      // Clear pending request so next call after cache expires makes fresh request
      this.pendingGetSessions = null;
    }
  }

  /**
   * Invalidate the session cache to force fresh data on next getActiveSessions() call.
   * Use this when a connection state change has occurred and stale cache could cause issues.
   */
  public invalidateSessionCache(): void {
    this.cachedSessions = null;
    this.cachedSessionsTimestamp = 0;
    console.log('ConnectionManager: Session cache invalidated');
  }

  /**
   * Internal method that actually fetches active sessions from the backend
   */
  private async _fetchActiveSessions(): Promise<ActiveSession[]> {
    try {
      // Check if WebSocket is connected before attempting to send
      // This prevents timeouts and errors when the internal service is down
      if (!websocketService.isConnected()) {
        // Try to wait for initialization (with a short timeout)
        try {
          await Promise.race([
            websocketService.waitForInit(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('WebSocket init timeout')), 3000)
            )
          ]);
        } catch {
          // WebSocket not available - return empty sessions
          // This is expected during startup or when internal service is down
          return [];
        }

        // Double-check connection after waiting
        if (!websocketService.isConnected()) {
          return [];
        }
      }

      const requestId = crypto.randomUUID();
      const request: GetSessionsRequest = {
        request_id: requestId
      };

      // Create promise for response
      const responsePromise = new Promise<GetSessionsResponse>((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });

        // Set timeout
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('GetSessions request timed out'));
          }
        }, 10000);
      });

      // Send request
      await websocketService.sendMessage({
        GetSessions: request
      });

      // Wait for response
      const response = await responsePromise;
      // PERF FIX: Removed per-response logging - this is called every 2 seconds

      // WASM returns sessions with BigInt CIDs, which is what we use throughout
      return response.sessions || [];
    } catch (error) {
      console.error('ConnectionManager: Failed to get active sessions', error);
      // Return empty array on error to allow initialization to continue
      return [];
    }
  }

  /**
   * Store session credentials in LocalDB
   */
  public async storeSession(session: StoredSession): Promise<void> {
    try {
      console.log('ConnectionManager: Storing session for', session.username);
      console.log('ConnectionManager: Current sessions before update:', this.storedSessions);
      
      // Update stored sessions
      const existingIndex = this.storedSessions.sessions.findIndex(
        s => s.username === session.username && s.serverAddress === session.serverAddress
      );
      
      if (existingIndex >= 0) {
        this.storedSessions.sessions[existingIndex] = session;
        console.log('ConnectionManager: Updated existing session at index', existingIndex);
      } else {
        this.storedSessions.sessions.push(session);
        console.log('ConnectionManager: Added new session');
      }
      
      console.log('ConnectionManager: Sessions to store:', this.storedSessions);
      
      // Store in LocalDB using CID 0 (global storage)
      await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
      
      console.log('ConnectionManager: Session stored successfully');
    } catch (error) {
      console.error('ConnectionManager: Failed to store session', error);
      throw error;
    }
  }

  /**
   * Load stored sessions from LocalDB
   */
  private async loadStoredSessions(): Promise<void> {
    try {
      console.log('ConnectionManager: Loading stored sessions...');
      
      const result = await this.getAllLocalDBValues();
      
      if (result && result.map && result.map[SESSION_STORAGE_KEY]) {
        // The value is stored as a byte array, need to decode it
        const byteArray = result.map[SESSION_STORAGE_KEY];
        if (Array.isArray(byteArray)) {
          try {
            const jsonStr = new TextDecoder().decode(new Uint8Array(byteArray));
            this.storedSessions = JSON.parse(jsonStr);
            console.log('ConnectionManager: Loaded', this.storedSessions.sessions.length, 'stored sessions');
          } catch (decodeError) {
            console.error('ConnectionManager: Failed to decode stored sessions:', decodeError);
            // Initialize with empty sessions on decode error
            this.storedSessions = { sessions: [] };
          }
        } else {
          // If it's already an object, use it directly (backward compatibility)
          this.storedSessions = byteArray;
          console.log('ConnectionManager: Loaded', this.storedSessions.sessions.length, 'stored sessions');
        }
      } else {
        console.log('ConnectionManager: No stored sessions found');
      }
    } catch (error) {
      console.error('ConnectionManager: Failed to load stored sessions', error);
      // Continue with empty sessions on error
    }
  }

  /**
   * Attempt connection when becoming the leader
   */
  private async attemptLeaderConnection(): Promise<void> {
    if (!this.isInitialized) {
      console.log('ConnectionManager: Not initialized yet, skipping leader connection');
      return;
    }
    
    if (!this.isLeader) {
      console.log('ConnectionManager: Not the leader, skipping connection attempt');
      return;
    }
    
    // Get active sessions and attempt reconnection
    const activeSessions = await this.getActiveSessions();
    await this.autoReconnect(activeSessions);
  }

  /**
   * Get the active session index for the current tab
   */
  private async getTabActiveSessionIndex(): Promise<number> {
    // First check tab-specific selection
    const tabSelection = await getSelectedUser();
    if (tabSelection && tabSelection.selectedUsername && tabSelection.selectedServerAddress) {
      const index = this.storedSessions.sessions.findIndex(
        s => s.username === tabSelection.selectedUsername &&
             s.serverAddress === tabSelection.selectedServerAddress
      );
      if (index >= 0) {
        return index;
      }
    }

    // Fall back to the shared active session index
    return this.storedSessions.activeSessionIndex ?? 0;
  }

  /**
   * Attempt to auto-reconnect using stored sessions
   */
  private async autoReconnect(activeSessions: ActiveSession[] = []): Promise<void> {
    if (this.storedSessions.sessions.length === 0) {
      return;
    }

    // Only attempt connection if we're the leader
    if (!this.isLeader && !broadcastChannelService.getIsLeader()) {
      console.log('ConnectionManager: Not the leader, skipping auto-reconnect');
      return;
    }

    // Get the tab-specific selected user to determine which session to reconnect
    const tabSelection = await getSelectedUser();
    let session: StoredSession | undefined;

    if (tabSelection && tabSelection.selectedUsername && tabSelection.selectedServerAddress) {
      // Use the tab's selected session
      session = this.storedSessions.sessions.find(
        s => s.username === tabSelection.selectedUsername &&
             s.serverAddress === tabSelection.selectedServerAddress
      );
      console.log('ConnectionManager: Auto-reconnecting with tab-selected user:', tabSelection.selectedUsername);
    } else {
      // No tab-specific selection - DO NOT fall back to shared activeSessionIndex
      // Each tab must explicitly select which session to use
      // This prevents Tab 2 from auto-connecting to Tab 1's session
      console.log('ConnectionManager: No tab-specific selection, skipping auto-reconnect');
      console.log('ConnectionManager: Tab must explicitly select a user via OrphanSessionsNavbar');
      return;
    }

    if (!session) {
      return;
    }

    // GUARD: Prevent concurrent connection attempts for same user
    const connectionKey = `${session.username}@${session.serverAddress}`;
    if (this.connectionAttempts.has(connectionKey)) {
      console.log(`ConnectionManager: Connection already in progress for ${connectionKey}`);
      return;
    }

    // GUARD: Skip Connect if session is already active in backend (prevents ratchet reset after ClaimSession)
    // This is the frontend guard complementing the backend guard in connect.rs
    const freshActiveSessions = await this.getActiveSessions();
    const alreadyActiveSession = freshActiveSessions.find(
      activeSession => activeSession.username === session.username &&
                       activeSession.server_address === session.serverAddress
    );

    if (alreadyActiveSession) {
      console.log('ConnectionManager: Session already active in backend, skipping Connect to prevent ratchet reset');
      console.log('ConnectionManager: Active session CID:', alreadyActiveSession.cid.toString());

      // Just update connection info without calling Connect
      await this.handleSuccessfulConnection(alreadyActiveSession.cid, false);

      // Update currentConnectionInfo with full session data for disconnect() support
      this.currentConnectionInfo = {
        cid: alreadyActiveSession.cid,
        username: session.username,
        serverAddress: session.serverAddress,
        fullName: session.fullName
      };

      // Update stored session with CID
      session.cid = alreadyActiveSession.cid;
      session.lastConnected = Date.now();
      await this.storeSession(session);

      console.log('ConnectionManager: Reusing existing session instead of reconnecting');
      return;
    }

    console.log('ConnectionManager: Attempting auto-reconnect for', session.username);

    try {
      this.connectionAttempts.add(connectionKey);

      try {
        // Wait for service to be healthy before attempting connection
        console.log('ConnectionManager: Checking service health before reconnect...');
        try {
          await healthCheckService.waitForHealthy(5000); // Wait up to 5 seconds
          console.log('ConnectionManager: Service is healthy, proceeding with reconnect');
        } catch (healthError) {
          console.warn('ConnectionManager: Service health check failed, attempting anyway:', healthError);
        }

        const requestId = crypto.randomUUID();
        await websocketService.connect(
          requestId,
          session.username,
          session.password,
          session.serverAddress,
          session.serverPassword,
          session.sessionSecuritySettings
        );

        // Update last connected time
        session.lastConnected = Date.now();
        await this.storeSession(session);

        console.log('ConnectionManager: Auto-reconnect successful');
      } catch (error: any) {
        console.error('ConnectionManager: Auto-reconnect failed', error);
        
        // Update connection status to disconnected
        const connectionService = ConnectionService.getInstance();
        connectionService.updateConnectionStatus({
          cid: null,
          isConnected: false
        });
        
        // Broadcast disconnection status to other tabs
        broadcastChannelService.broadcastConnectionStatus({
          isConnected: false
        });
        
        // Check if error indicates session is already connected or localhost is connecting
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('session already connected') || 
            errorMessage.includes('localhost is already trying to connect')) {
          console.log('ConnectionManager: Session already connected error - likely stale session');
          
          // Try to extract CID from error message first
          const cidMatch = error.message.match(/cid\s*=\s*(\d+)/i);
          if (cidMatch) {
            const existingCid = cidMatch[1];
            console.log('ConnectionManager: Existing session CID from message:', existingCid);
            
            // Emit event for orphan session handling
            eventEmitter.emit('session-already-connected', {
              cid: existingCid,
              message: error.message
            });
          } else {
            // If no CID in message, try to get active sessions
            console.log('ConnectionManager: No CID in error message, checking active sessions...');
            
            // Since we're already in auto-reconnect, we know which session we're trying to connect
            // Use the session info directly
            const activeIndex = this.storedSessions.activeSessionIndex ?? 0;
            const currentSession = this.storedSessions.sessions[activeIndex];
            
            if (currentSession) {
              // Get active sessions to find the conflicting CID
              this.getActiveSessions().then(activeSessions => {
                const matchingSession = activeSessions.find(activeSession => 
                  activeSession.username === currentSession.username && 
                  activeSession.server_address === currentSession.serverAddress
                );
                
                if (matchingSession) {
                  console.log('ConnectionManager: Found active session to claim:', matchingSession);
                  
                  // Emit event for orphan session handling
                  eventEmitter.emit('session-already-connected', {
                    cid: matchingSession.cid.toString(),
                    message: error.message
                  });
                }
              }).catch(err => {
                console.error('ConnectionManager: Failed to get active sessions:', err);
              });
            }
          }
          
          // Update connection status to disconnected
          connectionService.updateConnectionStatus({
            cid: null,  
            isConnected: false
          });
          
          // Stop reconnection attempts
          this.reconnectAttempts = this.maxReconnectAttempts;
          return;
        }
        
        // Retry with exponential backoff - each tab has ONE designated session, no rotation
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff, max 10s
          console.log(`ConnectionManager: Will retry in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

          setTimeout(async () => {
            // Retry same session - each tab owns ONE session (no rotation)
            await this.autoReconnect(activeSessions);
          }, delay);
        } else {
          console.log('ConnectionManager: Max reconnection attempts reached, giving up');
        }
      }
    } finally {
      // Always clean up the connection attempt guard
      this.connectionAttempts.delete(connectionKey);
    }
  }

  /**
   * Trigger auto-connect manually (e.g., after registration)
   */
  public async triggerAutoConnect(): Promise<void> {
    console.log('ConnectionManager: Manually triggering auto-connect');
    
    // Get current active sessions to avoid reconnecting to already connected sessions
    const activeSessions = await this.getActiveSessions();
    
    // Reload stored sessions in case they were just added
    await this.loadStoredSessions();
    
    // Attempt auto-reconnect if we have stored sessions
    if (this.storedSessions.sessions.length > 0) {
      // Reset reconnect attempts when manually triggering
      this.reconnectAttempts = 0;
      await this.autoReconnect(activeSessions);
    }
  }

  /**
   * Reconnect to stored sessions with updated active index
   */
  public async reconnectToStoredSessions(): Promise<void> {
    console.log('ConnectionManager: Reconnecting to stored sessions');

    // First disconnect current connection
    const currentSession = await this.getTabSelectedSession();
    if (currentSession?.cid) {
      console.log('ConnectionManager: Disconnecting current session CID:', currentSession.cid);
      await websocketService.disconnect(currentSession.cid);
    }

    // Small delay to ensure clean disconnect
    await new Promise(resolve => setTimeout(resolve, 500));

    // Trigger auto-connect which will use the activeSessionIndex
    await this.triggerAutoConnect();
  }

  /**
   * Update active session index
   */
  public async setActiveSessionIndex(index: number): Promise<void> {
    if (index >= 0 && index < this.storedSessions.sessions.length) {
      this.storedSessions.activeSessionIndex = index;
      await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
      console.log('ConnectionManager: Updated active session index to', index);

      // Emit session-selected event for other services to react
      const session = this.storedSessions.sessions[index];
      eventEmitter.emit('session-selected', { session, index });
    }
  }

  /**
   * Clear all stored sessions
   */
  public async clearStoredSessions(): Promise<void> {
    try {
      this.storedSessions = { sessions: [] };
      await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
      console.log('ConnectionManager: Cleared all stored sessions');
    } catch (error) {
      console.error('ConnectionManager: Failed to clear sessions', error);
      throw error;
    }
  }

  /**
   * Get current stored sessions
   */
  public getStoredSessions(): StoredSessions {
    return this.storedSessions;
  }

  /**
   * Send LocalDBSetKV request via websocketService
   * SINGLE-WEBSOCKET ARCHITECTURE: Uses websocketService which handles leader/follower
   */
  private async setLocalDBValue(key: string, value: any): Promise<void> {
    console.log('ConnectionManager: Sending LocalDBSetKV request');
    console.log('  Key:', key);

    const valueStr = safeJSONStringify(value);
    console.log('  Serialized value:', formatForDebug(valueStr));

    // Convert to byte array for LocalDB storage
    const valueBytes = Array.from(new TextEncoder().encode(valueStr));

    // Use websocketService.sendLocalDBSet which handles leader/follower via BroadcastChannel
    await websocketService.sendLocalDBSet(0n, key, valueBytes);

    console.log('ConnectionManager: LocalDBSetKV request completed successfully');
  }

  /**
   * Get all LocalDB values (returns mock structure for backward compatibility)
   * SINGLE-WEBSOCKET ARCHITECTURE: Uses websocketService which handles leader/follower
   */
  private async getAllLocalDBValues(): Promise<{ map: { [key: string]: number[] } } | null> {
    try {
      // Get the session storage value using websocketService
      const result = await websocketService.sendLocalDBGet(0n, SESSION_STORAGE_KEY);

      if (result && result.value) {
        // Return in the expected format with a map structure
        return {
          map: {
            [SESSION_STORAGE_KEY]: result.value
          }
        };
      }

      return null;
    } catch (error) {
      console.log('ConnectionManager: getAllLocalDBValues failed (may be first run):', error);
      return null;
    }
  }

  /**
   * Handle user login/registration success
   */
  public async handleAuthSuccess(
    username: string,
    password: string,
    fullName: string,
    serverAddress: string,
    serverPassword: string,
    securitySettings: SessionSecuritySettings,
    cid?: bigint
  ): Promise<void> {
    console.log('ConnectionManager: handleAuthSuccess called');
    console.log('  Username:', username);
    console.log('  Full Name:', fullName);
    console.log('  Server Address:', serverAddress);
    console.log('  CID:', cid);
    if (serverPassword != "") {
      console.log('  Server Password:', serverPassword);
    }
    
    const session: StoredSession = {
      username,
      password,
      serverAddress,
      serverPassword,
      fullName,
      lastConnected: Date.now(),
      cid, // Store the CID if provided
      sessionSecuritySettings: securitySettings
    };
    
    console.log('ConnectionManager: Created session object:', session);
    
    try {
      await this.storeSession(session);

      // Set this user as the selected user for this tab
      // Use timeout to prevent indefinite hanging if IndexedDB is blocked
      console.log('[ILM-TRACE] handleAuthSuccess: setting tab context for CID:', cid?.toString());
      const setUserTimeout = 3000; // 3 second timeout
      try {
        await Promise.race([
          setSelectedUser({
            selectedUsername: username,
            selectedServerAddress: serverAddress,
            selectedCid: cid
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('setSelectedUser timeout')), setUserTimeout)
          )
        ]);
        console.log('[ILM-TRACE] handleAuthSuccess: tab context set successfully');
      } catch (err: any) {
        if (err.message === 'setSelectedUser timeout') {
          console.warn('[ILM-TRACE] handleAuthSuccess: setSelectedUser timed out after', setUserTimeout, 'ms - continuing anyway');
          // Continue with the rest of handleAuthSuccess even if setSelectedUser hangs
          // The workspace loading will still work via the session store
        } else {
          throw err;
        }
      }

      // Update currentConnectionInfo with full session data so disconnect() can
      // properly call markUserDisconnected() with username and serverAddress.
      // This is critical for preventing ServerAutoConnect from attempting to
      // reconnect a session that the user explicitly signed out from.
      if (cid !== undefined) {
        this.currentConnectionInfo = {
          cid,
          username,
          serverAddress,
          fullName
        };

        // Update workspace service with the connection ID
        // This was previously done in handleSuccessfulConnection, but is now here
        // since handleSuccessfulConnection returns early for register/connect responses
        WorkspaceService.setConnectionId(cid);

        // CRITICAL: Trigger connection status update with FULL user context.
        // This bypasses IndexedDB entirely - WorkspaceApp reads the context directly
        // from this event instead of calling getSelectedUser() which may time out.
        console.log('[ILM-TRACE] handleAuthSuccess: triggering connection status update for CID:', cid.toString());
        const connectionService = ConnectionService.getInstance();
        connectionService.updateConnectionStatus({
          cid,
          isConnected: true,
          // Pass user context directly to avoid IndexedDB dependency
          userContext: {
            username,
            serverAddress,
            selectedCid: cid
          }
        });
      }

      console.log('[ILM-TRACE] handleAuthSuccess: completed successfully');
    } catch (error) {
      console.error('ConnectionManager: handleAuthSuccess failed:', error);
      throw error;
    }
  }

  /**
   * Handle user logout - removes the session for a specific user
   * @param username - The username of the session to logout
   * @param serverAddress - The server address of the session
   * @param cid - The CID of the session to disconnect (required for proper cleanup)
   */
  public async handleLogout(username: string, serverAddress: string, cid: bigint): Promise<void> {
    console.log('ConnectionManager: handleLogout called for', username, 'CID:', cid);

    // Remove the session from stored sessions
    this.storedSessions.sessions = this.storedSessions.sessions.filter(
      s => !(s.username === username && s.serverAddress === serverAddress)
    );

    // Update stored sessions in LocalDB
    await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);

    console.log('ConnectionManager: Session removed for', username);

    // Disconnect the session using the provided CID
    if (cid) {
      await websocketService.disconnect(cid);
    }
  }

  /**
   * Claim an orphaned session
   * SINGLE-WEBSOCKET ARCHITECTURE: Uses websocketService.claimSession which handles leader/follower
   */
  private async claimOrphanedSession(session: StoredSession, sessionCid: bigint): Promise<void> {
    console.log('ConnectionManager: Attempting to claim session with CID:', sessionCid.toString());

    // Use websocketService.claimSession which handles leader/follower via BroadcastChannel
    // Set only_if_orphaned to false to allow claiming any session we don't own
    const response = await websocketService.claimSession(sessionCid, false);

    console.log('ConnectionManager: Successfully claimed orphaned session', response);

    // Update connection service with the claimed CID
    // Pass false to avoid updating the stored session again (we already have the CID)
    await this.handleSuccessfulConnection(sessionCid, false);

    // Update currentConnectionInfo with full session data for disconnect() support
    this.currentConnectionInfo = {
      cid: sessionCid,
      username: session.username,
      serverAddress: session.serverAddress,
      fullName: session.fullName
    };

    // Update last connected time
    session.lastConnected = Date.now();
    await this.storeSession(session);
  }

  /**
   * Get current connection info including CID
   */
  public getConnectionInfo(): { cid: bigint; username?: string; serverAddress?: string; fullName?: string } | null {
    return this.currentConnectionInfo;
  }

  /**
   * Get the currently selected session for this tab
   */
  public async getTabSelectedSession(): Promise<StoredSession | null> {
    const tabSelection = await getSelectedUser();
    if (!tabSelection || !tabSelection.selectedUsername || !tabSelection.selectedServerAddress) {
      // No tab-specific selection, use the active index
      const activeIndex = await this.getTabActiveSessionIndex();
      return this.storedSessions.sessions[activeIndex] || null;
    }

    return this.storedSessions.sessions.find(
      s => s.username === tabSelection.selectedUsername &&
           s.serverAddress === tabSelection.selectedServerAddress
    ) || null;
  }

  /**
   * Get all stored sessions/accounts as an array
   */
  public getStoredSessionsArray(): StoredSession[] {
    return [...this.storedSessions.sessions];
  }

  /**
   * Remove a stored session/account
   */
  public async removeSession(username: string, serverAddress: string): Promise<void> {
    try {
      console.log('ConnectionManager: Removing session for', username, 'at', serverAddress);
      
      // Filter out the session to remove
      this.storedSessions.sessions = this.storedSessions.sessions.filter(
        s => !(s.username === username && s.serverAddress === serverAddress)
      );
      
      // Store updated sessions in LocalDB
      await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
      
      console.log('ConnectionManager: Session removed successfully');

      // NOTE: Do NOT disconnect here. The caller is responsible for handling disconnect
      // if needed (e.g., OrphanSessionsNavbar already calls websocketService.disconnect(cid)
      // with the EXPLICIT target CID before calling removeSession).
      // Calling this.disconnect() here would disconnect currentConnectionInfo.cid which
      // may be a DIFFERENT session than the one being removed (multiple users can share
      // the same serverAddress).
    } catch (error) {
      console.error('ConnectionManager: Failed to remove session', error);
      throw error;
    }
  }

  /**
   * Remove all stored sessions/accounts
   */
  public async removeAllSessions(): Promise<void> {
    try {
      console.log('ConnectionManager: Removing all stored sessions');
      
      // Clear sessions
      this.storedSessions = { sessions: [] };
      
      // Store empty sessions in LocalDB
      await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
      
      console.log('ConnectionManager: All sessions removed successfully');
      
      // Disconnect current session if any
      if (this.currentConnectionInfo) {
        await this.disconnect();
      }
    } catch (error) {
      console.error('ConnectionManager: Failed to remove all sessions', error);
      throw error;
    }
  }

  /**
   * Disconnect current session
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.currentConnectionInfo) {
        // Mark as user-disconnected BEFORE disconnecting to prevent ServerAutoConnect
        // from trying to reconnect this session automatically.
        // This respects user intent - if they explicitly sign out, don't auto-reconnect.
        const { username, serverAddress } = this.currentConnectionInfo;
        if (username && serverAddress) {
          await serverAutoConnectService.markUserDisconnected(username, serverAddress);
        }

        await websocketService.disconnect(this.currentConnectionInfo.cid);
      }

      this.currentConnectionInfo = null;

      // Invalidate session cache to ensure fresh data on next getActiveSessions() call
      // This prevents stale cached sessions from causing login redirects to non-existent sessions
      this.invalidateSessionCache();

      // Update connection status
      const connectionService = ConnectionService.getInstance();
      connectionService.updateConnectionStatus({
        cid: null,
        isConnected: false
      });

      // Broadcast disconnection status
      broadcastChannelService.broadcastConnectionStatus({
        isConnected: false
      });
    } catch (error) {
      console.error('ConnectionManager: Failed to disconnect', error);
    }
  }

  /**
   * Switch to a different account
   */
  public async switchAccount(username: string, serverAddress: string): Promise<void> {
    const session = this.storedSessions.sessions.find(
      s => s.username === username && s.serverAddress === serverAddress
    );
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    console.log(`ConnectionManager: Switching account to ${username}@${serverAddress} for this tab`);

    // Update tab-specific selected user BEFORE disconnecting
    await setSelectedUser({
      selectedUsername: username,
      selectedServerAddress: serverAddress,
      selectedCid: session.cid
    });

    // Disconnect current session only if we're the leader
    // Followers should just update their selected user without disconnecting
    if (this.isLeader) {
      await this.disconnect();

      // Connect with the selected account
      try {
        const requestId = crypto.randomUUID();
        await websocketService.connect(
          requestId,
          session.username,
          session.password,
          session.serverAddress,
          session.serverPassword,
          session.sessionSecuritySettings
        );

        // Update last connected time
        session.lastConnected = Date.now();
        await this.storeSession(session);
      } catch (error) {
        console.error('ConnectionManager: Failed to switch account', error);
        throw error;
      }
    } else {
      console.log('ConnectionManager: Follower tab - updating selected user without reconnecting');
      // For follower tabs, just notify that the selected user has changed
      // The UI will update to show the selected user's data
    }
  }

  /**
   * Update the role for a stored session
   * @param username - Username of the session to update
   * @param serverAddress - Server address of the session
   * @param role - New role value (Admin, Owner, Member, Guest)
   */
  public async updateSessionRole(username: string, serverAddress: string, role: string): Promise<void> {
    try {
      const session = this.storedSessions.sessions.find(
        s => s.username === username && s.serverAddress === serverAddress
      );

      if (session) {
        session.role = role;
        await this.storeSession(session);
        console.log(`ConnectionManager: Updated role for ${username} to ${role}`);
      }
    } catch (error) {
      console.error('ConnectionManager: Failed to update session role', error);
    }
  }
}

// Export singleton instance
export const connectionManager = ConnectionManager.getInstance();