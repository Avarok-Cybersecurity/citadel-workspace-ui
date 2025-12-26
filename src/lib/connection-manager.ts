import { websocketService } from './websocket-service';
import { ConnectionService } from './connection-service';
import { eventEmitter } from './event-emitter';
import WorkspaceService from './workspace-service';
import { broadcastChannelService } from './broadcast-channel-service';
import { healthCheckService } from './health-check';
import { getTabData, setTabData, removeTabData, setSelectedUser, getSelectedUser, clearSelectedUser } from './tab-context';
import { peerRegistrationStore } from './peer-registration-store';
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
import { serverAutoConnectService } from './server-auto-connect-service';

/**
 * ConnectionManager handles persistent connection management across sessions
 * It stores credentials securely and automatically reconnects when needed
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  private isInitialized = false;
  private storedSessions: StoredSessions = { sessions: [] };
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private isLeader = false;
  private currentConnectionInfo: ConnectionInfo | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  // Request deduplication and caching for getActiveSessions()
  private pendingGetSessions: Promise<ActiveSession[]> | null = null;
  private cachedSessions: ActiveSession[] | null = null;
  private cachedSessionsTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 2000; // 2 second cache

  // Concurrency guard to prevent duplicate connection attempts
  private connectionAttempts: Set<string> = new Set();

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
      
      // Initialize WebSocket service first
      await websocketService.init();
      
      // Wait a bit for the service connection to be established
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Enable orphan mode to persist sessions across page reloads
      try {
        console.log('ConnectionManager: Enabling orphan mode...');
        const orphanResult = await websocketService.setOrphanMode(true);
        console.log('ConnectionManager: Orphan mode result:', orphanResult);
      } catch (error) {
        console.warn('ConnectionManager: Failed to enable orphan mode', error);
        // Continue even if orphan mode fails - it's not critical
      }
      
      // Get active sessions from internal service
      const activeSessions = await this.getActiveSessions();
      
      // Load stored sessions
      await this.loadStoredSessions();

      // Initialize peer registration store for pending connection requests
      try {
        await peerRegistrationStore.initialize();
        console.log('ConnectionManager: Peer registration store initialized');
      } catch (error) {
        console.warn('ConnectionManager: Failed to initialize peer registration store', error);
        // Continue even if this fails - it's not critical
      }

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

      // Initialize server auto-connect service
      try {
        await serverAutoConnectService.init();
        console.log('ConnectionManager: Server auto-connect service initialized');
      } catch (error) {
        console.warn('ConnectionManager: Failed to initialize server auto-connect service:', error);
        // Continue even if this fails - it's not critical
      }

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
   */
  private setupEventListeners(): void {
    // Listen for successful connections
    eventEmitter.on('websocket-message', (message: any) => {
      this.handleWebSocketMessage(message);
    });
    
    // Listen for broadcast messages from other tabs
    eventEmitter.on('broadcast-workspace-response', (message: any) => {
      this.handleWebSocketMessage(message);
    });
  }

  /**
   * Setup leader election handling
   */
  private setupLeaderElection(): void {
    eventEmitter.on('leader-changed', ({ isLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
      console.log(`ConnectionManager: Leader changed - isLeader: ${isLeader}, leaderId: ${leaderId}`);
      this.isLeader = isLeader;
      
      if (isLeader) {
        // We just became the leader, attempt to establish connection
        console.log('ConnectionManager: Became leader, attempting to establish connection');
        this.attemptLeaderConnection();
      } else {
        // We're no longer the leader
        console.log('ConnectionManager: No longer the leader');
        // Optionally disconnect if we have an active connection
        // But for now, let's keep it to allow the leader to handle disconnection
      }
    });
  }

  /**
   * Handle WebSocket messages for LocalDB and connection responses
   */
  private handleWebSocketMessage(message: any): void {
    // Use JSON.stringify directly since parseAndFormatMixedContent is removed to avoid import conflict
    console.log('ConnectionManager: Handling WebSocket message:', formatForDebug(JSON.stringify(message)));
    
    // @human-review: Add logging for messages received for non-selected users
    // Check if this message is for the tab's selected user
    const tabSelection = getSelectedUser();
    if (message.cid && tabSelection && tabSelection.selectedCid) {
      if (message.cid !== tabSelection.selectedCid) {
        console.log(`ConnectionManager: DEBUG - Message received for CID ${message.cid} but tab has CID ${tabSelection.selectedCid} selected`);
      }
    }
    
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
      console.log('ConnectionManager: Received GetSessionsResponse');
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
      console.log('ConnectionManager: Received registration/connection success');
      const cid = response.RegisterSuccess?.cid || response.ConnectSuccess?.cid;
      if (cid) {
        this.handleSuccessfulConnection(cid);
      }
    }

    // Handle successful connection management (session claim, orphan mode, etc.)
    if (response.ConnectionManagementSuccess) {
      console.log('ConnectionManager: Received ConnectionManagementSuccess');
      const cid = response.ConnectionManagementSuccess?.cid;
      if (cid) {
        console.log('ConnectionManager: Updating connection info with claimed session CID:', cid);
        this.handleSuccessfulConnection(cid.toString(), false);
      }
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
   */
  private async handleSuccessfulConnection(cid: string, shouldUpdateStoredSession: boolean = true): Promise<void> {
    // Store current connection info
    this.currentConnectionInfo = { cid };
    console.log('ConnectionManager: Handling successful connection', cid);
    
    // Update connection service
    const connectionService = ConnectionService.getInstance();
    connectionService.updateConnectionStatus({
      cid,
      serverAddress: '127.0.0.1:12349',
      isConnected: true
    });
    
    // Broadcast connection status to other tabs
    broadcastChannelService.broadcastConnectionStatus({
      isConnected: true,
      cid
    });
    
    // Update workspace service with the connection ID
    WorkspaceService.setConnectionId(cid);
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0;
    
    // Update stored session with CID if needed
    if (shouldUpdateStoredSession && this.storedSessions.sessions.length > 0) {
      const activeIndex = this.storedSessions.activeSessionIndex ?? 0;
      const session = this.storedSessions.sessions[activeIndex];
      if (session) {
        session.cid = cid;
        session.lastConnected = Date.now();
        await this.storeSession(session);
        console.log('ConnectionManager: Updated stored session with CID:', cid);

        // Notify auto-connect service of successful authentication
        eventEmitter.emit('auth:success', { cid, username: session.username });
      }
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
      console.log('ConnectionManager: Returning cached active sessions');
      return this.cachedSessions;
    }

    // If a request is already in flight, reuse it (deduplication)
    if (this.pendingGetSessions) {
      console.log('ConnectionManager: Reusing pending getActiveSessions request');
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
      console.log('ConnectionManager: Getting active sessions from internal service');

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
      console.log('ConnectionManager: Active sessions:', response.sessions);

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
  private getTabActiveSessionIndex(): number {
    // First check tab-specific selection
    const tabSelection = getSelectedUser();
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
    const tabSelection = getSelectedUser();
    let session: StoredSession | undefined;
    
    if (tabSelection && tabSelection.selectedUsername && tabSelection.selectedServerAddress) {
      // Use the tab's selected session
      session = this.storedSessions.sessions.find(
        s => s.username === tabSelection.selectedUsername && 
             s.serverAddress === tabSelection.selectedServerAddress
      );
      console.log('ConnectionManager: Auto-reconnecting with tab-selected user:', tabSelection.selectedUsername);
    } else {
      // Fall back to the active session index
      const activeIndex = this.storedSessions.activeSessionIndex ?? 0;
      session = this.storedSessions.sessions[activeIndex];
      console.log('ConnectionManager: Auto-reconnecting with default session index:', activeIndex);
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

    // Session checking is now handled automatically by websocketService.connect()
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
          session.serverAddress
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
          serverAddress: '127.0.0.1:12349',
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
            serverAddress: '127.0.0.1:12349',
            isConnected: false
          });
          
          // Stop reconnection attempts
          this.reconnectAttempts = this.maxReconnectAttempts;
          return;
        }
        
        // Try next session if available with a delay to prevent tight loops
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff, max 10s
          console.log(`ConnectionManager: Will retry in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(async () => {
            const nextIndex = (activeIndex + 1) % this.storedSessions.sessions.length;
            this.storedSessions.activeSessionIndex = nextIndex;
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
    const currentSession = this.getTabSelectedSession();
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
   * Send LocalDBSetKV request
   */
  private async setLocalDBValue(key: string, value: any): Promise<void> {
    const requestId = crypto.randomUUID();
    
    console.log('ConnectionManager: Sending LocalDBSetKV request');
    console.log('  Key:', key);
    console.log('  Value:', value);
    console.log('  Request ID:', requestId);
    
    const valueStr = JSON.stringify(value);
    console.log('  Serialized value:', formatForDebug(valueStr));
    
    const request = {
      LocalDBSetKV: {
        request_id: requestId,
        cid: 0, // Use 0 for global storage
        peer_cid: null,
        key,
        value: Array.from(new TextEncoder().encode(valueStr))
      }
    };
    
    // TODO: debug format the below text since it is very large for some types
    console.log('  Full request:', formatForDebug(JSON.stringify(request)));
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      const client = websocketService.getClient();
      if (!client) {
        console.error('ConnectionManager: No WebSocket client available');
        this.pendingRequests.delete(requestId);
        reject(new Error('No WebSocket client available'));
        return;
      }
      
      console.log('ConnectionManager: Sending request to internal service...');
      
      // Send directly to internal service without wrapping in Request
      client.sendDirectToInternalService(request as any)
        .then(() => {
          console.log('ConnectionManager: LocalDBSetKV request sent successfully');
        })
        .catch(error => {
          console.error('ConnectionManager: Failed to send LocalDBSetKV request:', error);
          this.pendingRequests.delete(requestId);
          reject(error);
        });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          console.error('ConnectionManager: LocalDBSetKV request timed out');
          this.pendingRequests.delete(requestId);
          reject(new Error('LocalDBSetKV request timed out'));
        }
      }, 5000);
    });
  }

  /**
   * Send LocalDBGetAllKV request
   */
  private async getAllLocalDBValues(): Promise<any> {
    const requestId = crypto.randomUUID();
    
    const request = {
      LocalDBGetAllKV: {
        request_id: requestId,
        cid: 0, // Use 0 for global storage
        peer_cid: null
      }
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Send directly to internal service without wrapping in Request
      websocketService.getClient()?.sendDirectToInternalService(request as any)
        .catch(error => {
          this.pendingRequests.delete(requestId);
          reject(error);
        });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          resolve(null); // Resolve with null on timeout to continue
        }
      }, 5000);
    });
  }

  /**
   * Handle user login/registration success
   */
  public async handleAuthSuccess(
    username: string,
    password: string,
    fullName: string,
    serverAddress: string = '127.0.0.1:12349',
    cid?: string
  ): Promise<void> {
    console.log('ConnectionManager: handleAuthSuccess called');
    console.log('  Username:', username);
    console.log('  Full Name:', fullName);
    console.log('  Server Address:', serverAddress);
    console.log('  CID:', cid);
    
    const session: StoredSession = {
      username,
      password,
      serverAddress,
      fullName,
      lastConnected: Date.now(),
      cid, // Store the CID if provided
      sessionSecuritySettings: {
        securityLevel: "Standard",
        secrecyMode: "BestEffort",
        encryptionAlgorithm: "AES_GCM_256",
        kemAlgorithm: "Kyber",
        sigAlgorithm: "None",
        headerObfuscatorSettings: "Disabled"
      }
    };
    
    console.log('ConnectionManager: Created session object:', session);
    
    try {
      await this.storeSession(session);
      
      // Set this user as the selected user for this tab
      setSelectedUser({
        selectedUsername: username,
        selectedServerAddress: serverAddress,
        selectedCid: cid
      });
      
      console.log('ConnectionManager: handleAuthSuccess completed successfully');
    } catch (error) {
      console.error('ConnectionManager: handleAuthSuccess failed:', error);
      throw error;
    }
  }

  /**
   * Handle user logout - removes the session for a specific user
   */
  public async handleLogout(username: string, serverAddress: string = '127.0.0.1:12349'): Promise<void> {
    console.log('ConnectionManager: handleLogout called for', username);
    
    // Remove the session from stored sessions
    this.storedSessions.sessions = this.storedSessions.sessions.filter(
      s => !(s.username === username && s.serverAddress === serverAddress)
    );
    
    // Update stored sessions in LocalDB
    await this.setLocalDBValue(SESSION_STORAGE_KEY, this.storedSessions);
    
    console.log('ConnectionManager: Session removed for', username);
    
    // Disconnect the WebSocket
    await websocketService.disconnect();
  }

  /**
   * Claim an orphaned session
   */
  private async claimOrphanedSession(session: StoredSession, sessionCid: bigint): Promise<void> {
    console.log('ConnectionManager: Attempting to claim session with CID:', sessionCid);
    console.log('ConnectionManager: CID type:', typeof sessionCid);
    console.log('ConnectionManager: CID toString:', sessionCid.toString());
    
    const requestId = crypto.randomUUID();
    
    // Create the ConnectionManagement request with ClaimSession command
    // Set only_if_orphaned to false to allow claiming any session we don't own
    // Keep session_cid as string since it's a u64 that might exceed JavaScript's Number.MAX_SAFE_INTEGER
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          ClaimSession: {
            session_cid: sessionCid.toString(), // Keep as string to preserve full precision
            only_if_orphaned: false // Allow claiming even if not orphaned
          }
        }
      }
    };
    
    console.log('ConnectionManager: Sending ClaimSession request:', JSON.stringify(request));
    
    // Create promise for response
    const responsePromise = new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('ClaimSession request timed out'));
        }
      }, 10000);
    });
    
    // Send request
    const client = websocketService.getClient();
    if (!client) {
      throw new Error('No WebSocket client available');
    }
    
    await client.sendDirectToInternalService(request as any);
    
    // Wait for response
    const response = await responsePromise;
    
    if (response.ConnectionManagementSuccess) {
      console.log('ConnectionManager: Successfully claimed orphaned session');
      
      // Update connection service with the claimed CID
      // Pass false to avoid updating the stored session again (we already have the CID)
      await this.handleSuccessfulConnection(sessionCid.toString(), false);
      
      // Update last connected time
      session.lastConnected = Date.now();
      await this.storeSession(session);
    } else if (response.ConnectionManagementFailure) {
      throw new Error(`Failed to claim session: ${response.ConnectionManagementFailure.error}`);
    } else {
      throw new Error('Unexpected response from ClaimSession');
    }
  }

  /**
   * Get current connection info including CID
   */
  public getConnectionInfo(): ConnectionInfo | null {
    return this.currentConnectionInfo;
  }

  /**
   * Get the currently selected session for this tab
   */
  public getTabSelectedSession(): StoredSession | null {
    const tabSelection = getSelectedUser();
    if (!tabSelection || !tabSelection.selectedUsername || !tabSelection.selectedServerAddress) {
      // No tab-specific selection, use the active index
      const activeIndex = this.getTabActiveSessionIndex();
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
      
      // If this was the current session, disconnect
      if (this.currentConnectionInfo && 
          this.currentConnectionInfo.serverAddress === serverAddress) {
        await this.disconnect();
      }
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
        await websocketService.disconnect(this.currentConnectionInfo.cid);
      }
      
      this.currentConnectionInfo = null;
      
      // Update connection status
      const connectionService = ConnectionService.getInstance();
      connectionService.updateConnectionStatus({
        cid: null,
        serverAddress: '127.0.0.1:12349',
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
    setSelectedUser({
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
          session.serverAddress
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