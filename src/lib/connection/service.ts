/**
 * Connection Manager Service
 *
 * Handles persistent connection management across sessions.
 * Orchestrates state and I/O operations following SBIO principle.
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
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { ConnectionState } from './state';
import { ConnectionIO, connectionIO } from './io';
import type {
  CurrentConnectionInfo,
  AuthSuccessParams,
  TabSelectionContext,
} from './types';
import type { StoredSession, ActiveSession } from '@/types/session-types';
import type { SessionSecuritySettings } from '../p2p-registration-service';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  GET_SESSIONS_TIMEOUT_MS,
  WEBSOCKET_INIT_TIMEOUT_MS,
  SET_USER_TIMEOUT_MS,
  POST_DISCONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
} from './constants';

export class ConnectionManager {
  private static instance: ConnectionManager;
  private state: ConnectionState;
  private io: ConnectionIO;

  private constructor() {
    this.state = new ConnectionState();
    this.io = connectionIO;
    this.setupEventListeners();
    this.setupLeaderElection();
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  public async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      console.log('ConnectionManager already initialized');
      return;
    }

    try {
      console.log('ConnectionManager: Initializing...');

      // Step 1: Initialize WebSocket service first
      await this.io.initWebSocket();

      // Step 2: Fire-and-forget orphan mode
      console.log('ConnectionManager: Enabling orphan mode (non-blocking)...');
      this.io.setOrphanMode(true);

      // Step 3: Run parallel operations
      const [activeSessions] = await Promise.all([
        this.getActiveSessions().catch(() => []),
        this.loadStoredSessions(),
        this.io.initPeerRegistrationStore().catch((error) => {
          console.warn('ConnectionManager: Failed to initialize peer registration store', error);
        }),
      ]);

      // Clear stored CIDs on page reload
      if (this.state.storedSessions.sessions.length > 0) {
        console.log('ConnectionManager: Clearing stored CIDs to force fresh connection');
        this.state.clearSessionCids();
        await this.io.storeSessionsToLocalDB(this.state.storedSessions);
      }

      this.state.setInitialized(true);
      console.log('ConnectionManager: Initialized successfully');

      // Step 4: Fire-and-forget server auto-connect
      this.io.initServerAutoConnect().catch((error) => {
        console.warn('ConnectionManager: Failed to initialize server auto-connect service:', error);
      });

      this.state.resolveReady();
    } catch (error) {
      console.error('ConnectionManager: Initialization failed', error);
      this.state.resolveReady();
      throw error;
    }
  }

  public async waitForReady(): Promise<void> {
    if (this.state.isInitialized) {
      return Promise.resolve();
    }
    return this.state.readyPromise;
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  private setupEventListeners(): void {
    this.state.executeCleanup();

    const wsUnsubscribe = this.io.onEvent('websocket-message', async (message: unknown) => {
      await this.handleWebSocketMessage(message);
    });
    this.state.addCleanupFunction(wsUnsubscribe);

    const broadcastUnsubscribe = this.io.onEvent('broadcast-workspace-response', async (message: unknown) => {
      await this.handleWebSocketMessage(message);
    });
    this.state.addCleanupFunction(broadcastUnsubscribe);
  }

  private setupLeaderElection(): void {
    const leaderUnsubscribe = this.io.onEvent<{ isLeader: boolean; leaderId: string }>(
      'leader-changed',
      async ({ isLeader, leaderId }) => {
        console.log(`ConnectionManager: Leader changed - isLeader: ${isLeader}, leaderId: ${leaderId}`);
        this.state.setLeader(isLeader);

        if (isLeader) {
          console.log('ConnectionManager: Became leader, attempting to establish connection');
          await this.attemptLeaderConnection();
        } else {
          console.log('ConnectionManager: No longer the leader');
        }
      }
    );
    this.state.addCleanupFunction(leaderUnsubscribe);
  }

  // ============================================================================
  // WebSocket Message Handling
  // ============================================================================

  private async handleWebSocketMessage(message: any): Promise<void> {
    // Handle LocalDB responses
    if (message.LocalDBSetKVSuccess) {
      this.resolveRequest(message.LocalDBSetKVSuccess.request_id, message.LocalDBSetKVSuccess);
    } else if (message.LocalDBSetKVFailure) {
      this.rejectRequest(message.LocalDBSetKVFailure.request_id, message.LocalDBSetKVFailure.message);
    } else if (message.LocalDBGetAllKVSuccess) {
      this.resolveRequest(message.LocalDBGetAllKVSuccess.request_id, message.LocalDBGetAllKVSuccess);
    } else if (message.LocalDBGetAllKVFailure) {
      this.rejectRequest(message.LocalDBGetAllKVFailure.request_id, message.LocalDBGetAllKVFailure.message);
    } else if (message.GetSessionsResponse) {
      this.resolveRequest(message.GetSessionsResponse.request_id, message.GetSessionsResponse);
    } else if (message.ConnectionManagementSuccess) {
      console.log('ConnectionManager: Received ConnectionManagementSuccess');
      this.resolveRequest(message.ConnectionManagementSuccess.request_id, message);
    } else if (message.ConnectionManagementFailure) {
      console.log('ConnectionManager: Received ConnectionManagementFailure');
      this.resolveRequest(message.ConnectionManagementFailure.request_id, message);
    }

    // Handle successful registration/connection
    // CRITICAL: Only process if this response belongs to this tab
    // Otherwise, broadcasts from other users' sessions will overwrite our connection info
    const response = message.Response || message;
    if (response.RegisterSuccess || response.ConnectSuccess) {
      const cid = response.RegisterSuccess?.cid || response.ConnectSuccess?.cid;
      const requestId = response.RegisterSuccess?.request_id || response.ConnectSuccess?.request_id;
      console.log(`[ILM-TRACE] ConnectionManager: Received registration/connection success, CID=${cid?.toString()}, request_id=${requestId}`);

      // Check if this response belongs to this tab:
      // 1. Matching pending request from this tab's ConnectionManager, OR
      // 2. CID matches this tab's selected session, OR
      // 3. No session selected yet AND no connection info exists (fresh registration)
      const hasPendingRequest = requestId && this.state.hasPendingRequest(requestId);
      const tabSelection = await this.io.getSelectedUser();
      const isOurSession = cid && tabSelection?.selectedCid === cid;
      const isFreshTab = !tabSelection?.selectedCid && !this.state.currentConnectionInfo;

      if (hasPendingRequest || isOurSession || isFreshTab) {
        console.log(`[ILM-TRACE] ConnectionManager: Processing connection success (hasPending=${hasPendingRequest}, isOurSession=${isOurSession}, isFreshTab=${isFreshTab})`);
        this.state.invalidateCache();
        if (cid) {
          console.log(`[ILM-TRACE] ConnectionManager: Calling handleSuccessfulConnection for CID=${cid.toString()}`);
          await this.handleSuccessfulConnection(cid, false);
        }
      } else {
        console.log(`[ILM-TRACE] ConnectionManager: Ignoring connection success - not our session (requestId=${requestId}, ourCid=${tabSelection?.selectedCid?.toString()}, currentCid=${this.state.currentConnectionInfo?.cid?.toString()})`);
      }
    }

    // Handle successful connection management
    // CRITICAL: Only process if this response belongs to this tab
    if (response.ConnectionManagementSuccess) {
      const requestId = response.ConnectionManagementSuccess?.request_id;
      const cid = response.ConnectionManagementSuccess?.cid;
      console.log('ConnectionManager: Received ConnectionManagementSuccess, request_id:', requestId, 'cid:', cid?.toString());

      // Check if this response belongs to this tab
      const hasPendingRequest = requestId && this.state.hasPendingRequest(requestId);
      const tabSelection = await this.io.getSelectedUser();
      const isOurSession = cid && tabSelection?.selectedCid === cid;
      const isFreshTab = !tabSelection?.selectedCid && !this.state.currentConnectionInfo;

      if (hasPendingRequest || isOurSession || isFreshTab) {
        console.log('ConnectionManager: Processing ConnectionManagementSuccess (hasPending:', hasPendingRequest, ', isOurSession:', isOurSession, ', isFreshTab:', isFreshTab, ')');
        this.state.invalidateCache();
        if (cid) {
          console.log('ConnectionManager: Updating connection info with claimed session CID:', cid);
          await this.handleSuccessfulConnection(cid, false);
        }
      } else {
        console.log('ConnectionManager: Ignoring ConnectionManagementSuccess - not our session');
      }
    }

    // Handle disconnect notifications
    if (response.DisconnectNotification) {
      console.log('ConnectionManager: Received DisconnectNotification for CID:', response.DisconnectNotification.cid);
      this.state.invalidateCache();
    }

    // Handle connection failures
    if (response.ConnectFailure) {
      await this.handleConnectFailure(response.ConnectFailure);
    }
  }

  private resolveRequest(requestId: string, data: unknown): void {
    const pending = this.state.getPendingRequest(requestId);
    if (pending) {
      pending.resolve(data);
      this.state.deletePendingRequest(requestId);
    }
  }

  private rejectRequest(requestId: string, message: string): void {
    const pending = this.state.getPendingRequest(requestId);
    if (pending) {
      pending.reject(new Error(message));
      this.state.deletePendingRequest(requestId);
    }
  }

  private async handleConnectFailure(failure: { message?: string }): Promise<void> {
    console.log('ConnectionManager: Received ConnectFailure:', failure);
    const errorMessage = failure.message || '';

    if (!errorMessage.toLowerCase().includes('session already connected')) {
      return;
    }

    console.log('ConnectionManager: Session already connected error detected');
    const extractedCid = this.state.extractCidFromErrorMessage(errorMessage);

    if (extractedCid) {
      console.log('ConnectionManager: Existing session CID from message:', extractedCid);
      this.io.emitEvent('session-already-connected', { cid: extractedCid, message: errorMessage });
      return;
    }

    // Try to find matching session from active sessions
    console.log('ConnectionManager: No CID in error message, fetching active sessions...');
    try {
      const activeSessions = await this.getActiveSessions();
      console.log('ConnectionManager: Active sessions after error:', activeSessions);

      const activeIndex = this.state.getActiveSessionIndex();
      const currentSession = this.state.storedSessions.sessions[activeIndex];

      const matchingSession = activeSessions.find(
        (s) =>
          currentSession &&
          s.username === currentSession.username &&
          s.server_address === currentSession.serverAddress
      );

      if (matchingSession) {
        console.log('ConnectionManager: Found matching active session:', matchingSession);
        this.io.emitEvent('session-already-connected', {
          cid: matchingSession.cid.toString(),
          message: errorMessage,
        });
      } else {
        console.log('ConnectionManager: No matching active session found');
      }
    } catch (error) {
      console.error('ConnectionManager: Failed to get active sessions:', error);
    }
  }

  // ============================================================================
  // Connection Handling
  // ============================================================================

  private async handleSuccessfulConnection(cid: bigint, shouldUpdateStoredSession: boolean = true): Promise<void> {
    this.state.setCurrentConnectionInfo({ cid });
    console.log('ConnectionManager: Handling successful connection', cid.toString(), 'shouldUpdateStoredSession:', shouldUpdateStoredSession);

    this.io.setInstanceCid(cid);
    console.log('ConnectionManager: Set instanceManager CID to', cid.toString());

    this.io.announcePresence();
    this.state.resetReconnectAttempts();

    if (!shouldUpdateStoredSession) {
      console.log('ConnectionManager: Skipping connection notifications - handleAuthSuccess will handle them');
      return;
    }

    // Update stored session with CID
    let sessionUsername: string | undefined;
    if (this.state.storedSessions.sessions.length > 0) {
      const activeIndex = this.state.getActiveSessionIndex();
      const session = this.state.storedSessions.sessions[activeIndex];
      if (session) {
        session.cid = cid;
        session.lastConnected = Date.now();
        sessionUsername = session.username;
        await this.storeSession(session);
        console.log('ConnectionManager: Updated stored session with CID:', cid.toString());
      }
    }

    this.io.setWorkspaceConnectionId(cid);
    this.io.updateConnectionService({ cid, isConnected: true });
    this.io.broadcastConnectionStatus({ isConnected: true, cid });

    if (sessionUsername) {
      this.io.emitEvent('auth:success', { cid, username: sessionUsername });
    }
  }

  // ============================================================================
  // Active Sessions
  // ============================================================================

  public async getActiveSessions(): Promise<ActiveSession[]> {
    if (this.state.isCacheValid()) {
      return this.state.cachedSessions!;
    }

    const pending = this.state.pendingGetSessions;
    if (pending) {
      return pending;
    }

    const fetchPromise = this._fetchActiveSessions();
    this.state.setPendingGetSessions(fetchPromise);

    try {
      const result = await fetchPromise;
      this.state.setCachedSessions(result);
      return result;
    } finally {
      this.state.setPendingGetSessions(null);
    }
  }

  public invalidateSessionCache(): void {
    this.state.invalidateCache();
    console.log('ConnectionManager: Session cache invalidated');
  }

  private async _fetchActiveSessions(): Promise<ActiveSession[]> {
    try {
      if (!this.io.isWebSocketConnected()) {
        try {
          await Promise.race([
            this.io.waitForWebSocketInit(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('WebSocket init timeout')), WEBSOCKET_INIT_TIMEOUT_MS)
            ),
          ]);
        } catch {
          return [];
        }

        if (!this.io.isWebSocketConnected()) {
          return [];
        }
      }

      const requestId = crypto.randomUUID();

      // Create promise for response - store resolve/reject in state for handleWebSocketMessage to use
      const responsePromise = new Promise<{ sessions?: ActiveSession[] }>((resolve, reject) => {
        this.state.setPendingRequest(requestId, { resolve: resolve as (value: unknown) => void, reject });

        // Set timeout
        setTimeout(() => {
          if (this.state.hasPendingRequest(requestId)) {
            this.state.deletePendingRequest(requestId);
            reject(new Error('GetSessions request timed out'));
          }
        }, GET_SESSIONS_TIMEOUT_MS);
      });

      // Send request
      await this.io.sendWebSocketMessage({ GetSessions: { request_id: requestId } });

      // Wait for response (resolved by handleWebSocketMessage)
      const response = await responsePromise;
      return response.sessions || [];
    } catch (error) {
      console.error('ConnectionManager: Failed to get active sessions', error);
      return [];
    }
  }

  // ============================================================================
  // Session Storage
  // ============================================================================

  public async storeSession(session: StoredSession): Promise<void> {
    try {
      console.log('ConnectionManager: Storing session for', session.username);
      this.state.addOrUpdateSession(session);
      await this.io.storeSessionsToLocalDB(this.state.storedSessions);
      console.log('ConnectionManager: Session stored successfully');
    } catch (error) {
      console.error('ConnectionManager: Failed to store session', error);
      throw error;
    }
  }

  private async loadStoredSessions(): Promise<void> {
    try {
      console.log('ConnectionManager: Loading stored sessions...');
      const loaded = await this.io.loadSessionsFromLocalDB();
      if (loaded) {
        this.state.setStoredSessions(loaded);
        console.log('ConnectionManager: Loaded', this.state.storedSessions.sessions.length, 'stored sessions');
      } else {
        console.log('ConnectionManager: No stored sessions found');
      }
    } catch (error) {
      console.error('ConnectionManager: Failed to load stored sessions', error);
    }
  }

  // ============================================================================
  // Auto-Reconnect
  // ============================================================================

  private async attemptLeaderConnection(): Promise<void> {
    if (!this.state.isInitialized) {
      console.log('ConnectionManager: Not initialized yet, skipping leader connection');
      return;
    }

    if (!this.state.isLeader) {
      console.log('ConnectionManager: Not the leader, skipping connection attempt');
      return;
    }

    const activeSessions = await this.getActiveSessions();
    await this.autoReconnect(activeSessions);
  }

  private async getTabActiveSessionIndex(): Promise<number> {
    const tabSelection = await this.io.getSelectedUser();
    if (tabSelection?.selectedUsername && tabSelection?.selectedServerAddress) {
      const index = this.state.findSessionIndex(
        tabSelection.selectedUsername,
        tabSelection.selectedServerAddress
      );
      if (index >= 0) {
        return index;
      }
    }
    return this.state.getActiveSessionIndex();
  }

  private async autoReconnect(activeSessions: ActiveSession[] = []): Promise<void> {
    if (this.state.storedSessions.sessions.length === 0) {
      return;
    }

    if (!this.state.isLeader && !this.io.getIsLeaderFromBroadcast()) {
      console.log('ConnectionManager: Not the leader, skipping auto-reconnect');
      return;
    }

    const tabSelection = await this.io.getSelectedUser();
    let session: StoredSession | undefined;

    if (tabSelection?.selectedUsername && tabSelection?.selectedServerAddress) {
      session = this.state.findSession(tabSelection.selectedUsername, tabSelection.selectedServerAddress);
      console.log('ConnectionManager: Auto-reconnecting with tab-selected user:', tabSelection.selectedUsername);
    } else {
      console.log('ConnectionManager: No tab-specific selection, skipping auto-reconnect');
      console.log('ConnectionManager: Tab must explicitly select a user via OrphanSessionsNavbar');
      return;
    }

    if (!session) {
      return;
    }

    const connectionKey = this.state.createConnectionKey(session.username, session.serverAddress);
    if (this.state.hasConnectionAttempt(connectionKey)) {
      console.log(`ConnectionManager: Connection already in progress for ${connectionKey}`);
      return;
    }

    // Check if session is already active
    const freshActiveSessions = await this.getActiveSessions();
    const alreadyActiveSession = freshActiveSessions.find(
      (s) => s.username === session!.username && s.server_address === session!.serverAddress
    );

    if (alreadyActiveSession) {
      console.log('ConnectionManager: Session already active in backend, skipping Connect to prevent ratchet reset');
      console.log('ConnectionManager: Active session CID:', alreadyActiveSession.cid.toString());

      await this.handleSuccessfulConnection(alreadyActiveSession.cid, false);

      this.state.setCurrentConnectionInfo({
        cid: alreadyActiveSession.cid,
        username: session.username,
        serverAddress: session.serverAddress,
        fullName: session.fullName,
      });

      session.cid = alreadyActiveSession.cid;
      session.lastConnected = Date.now();
      await this.storeSession(session);

      console.log('ConnectionManager: Reusing existing session instead of reconnecting');
      return;
    }

    console.log('ConnectionManager: Attempting auto-reconnect for', session.username);

    try {
      this.state.addConnectionAttempt(connectionKey);
      await this.performAutoReconnect(session, activeSessions);
    } finally {
      this.state.removeConnectionAttempt(connectionKey);
    }
  }

  private async performAutoReconnect(session: StoredSession, activeSessions: ActiveSession[]): Promise<void> {
    try {
      console.log('ConnectionManager: Checking service health before reconnect...');
      try {
        await this.io.waitForHealthy(HEALTH_CHECK_TIMEOUT_MS);
        console.log('ConnectionManager: Service is healthy, proceeding with reconnect');
      } catch (healthError) {
        console.warn('ConnectionManager: Service health check failed, attempting anyway:', healthError);
      }

      const requestId = crypto.randomUUID();
      await this.io.connect({
        requestId,
        username: session.username,
        password: session.password,
        serverAddress: session.serverAddress,
        serverPassword: session.serverPassword,
        sessionSecuritySettings: session.sessionSecuritySettings,
      });

      session.lastConnected = Date.now();
      await this.storeSession(session);

      console.log('ConnectionManager: Auto-reconnect successful');
    } catch (error: any) {
      console.error('ConnectionManager: Auto-reconnect failed', error);
      await this.handleAutoReconnectError(error, session, activeSessions);
    }
  }

  private async handleAutoReconnectError(
    error: any,
    session: StoredSession,
    activeSessions: ActiveSession[]
  ): Promise<void> {
    this.io.updateConnectionService({ cid: null, isConnected: false });
    this.io.broadcastConnectionStatus({ isConnected: false });

    const errorMessage = error.message?.toLowerCase() || '';
    if (
      errorMessage.includes('session already connected') ||
      errorMessage.includes('localhost is already trying to connect')
    ) {
      await this.handleSessionAlreadyConnectedError(error, session);
      this.state.resetReconnectAttempts();
      return;
    }

    if (!this.state.hasReachedMaxReconnectAttempts()) {
      const attempts = this.state.incrementReconnectAttempts();
      const delay = this.state.calculateBackoffDelay(attempts, MAX_RECONNECT_DELAY_MS);
      console.log(`ConnectionManager: Will retry in ${delay}ms (attempt ${attempts}/${this.state.maxReconnectAttempts})`);

      setTimeout(async () => {
        await this.autoReconnect(activeSessions);
      }, delay);
    } else {
      console.log('ConnectionManager: Max reconnection attempts reached, giving up');
    }
  }

  private async handleSessionAlreadyConnectedError(error: any, session: StoredSession): Promise<void> {
    console.log('ConnectionManager: Session already connected error - likely stale session');

    const extractedCid = this.state.extractCidFromErrorMessage(error.message);
    if (extractedCid) {
      console.log('ConnectionManager: Existing session CID from message:', extractedCid);
      this.io.emitEvent('session-already-connected', { cid: extractedCid, message: error.message });
      return;
    }

    console.log('ConnectionManager: No CID in error message, checking active sessions...');
    try {
      const activeSessions = await this.getActiveSessions();
      const matchingSession = activeSessions.find(
        (s) => s.username === session.username && s.server_address === session.serverAddress
      );

      if (matchingSession) {
        console.log('ConnectionManager: Found active session to claim:', matchingSession);
        this.io.emitEvent('session-already-connected', {
          cid: matchingSession.cid.toString(),
          message: error.message,
        });
      }
    } catch (err) {
      console.error('ConnectionManager: Failed to get active sessions:', err);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  public async triggerAutoConnect(): Promise<void> {
    console.log('ConnectionManager: Manually triggering auto-connect');
    const activeSessions = await this.getActiveSessions();
    await this.loadStoredSessions();

    if (this.state.storedSessions.sessions.length > 0) {
      this.state.resetReconnectAttempts();
      await this.autoReconnect(activeSessions);
    }
  }

  public async reconnectToStoredSessions(): Promise<void> {
    console.log('ConnectionManager: Reconnecting to stored sessions');
    const currentSession = await this.getTabSelectedSession();
    if (currentSession?.cid) {
      console.log('ConnectionManager: Disconnecting current session CID:', currentSession.cid);
      await this.io.disconnect(currentSession.cid);
    }
    await new Promise((resolve) => setTimeout(resolve, POST_DISCONNECT_DELAY_MS));
    await this.triggerAutoConnect();
  }

  public async setActiveSessionIndex(index: number): Promise<void> {
    if (index >= 0 && index < this.state.storedSessions.sessions.length) {
      this.state.setActiveSessionIndex(index);
      await this.io.storeSessionsToLocalDB(this.state.storedSessions);
      console.log('ConnectionManager: Updated active session index to', index);

      const session = this.state.storedSessions.sessions[index];
      this.io.emitEvent('session-selected', { session, index });
    }
  }

  public async clearStoredSessions(): Promise<void> {
    try {
      this.state.clearSessions();
      await this.io.storeSessionsToLocalDB(this.state.storedSessions);
      console.log('ConnectionManager: Cleared all stored sessions');
    } catch (error) {
      console.error('ConnectionManager: Failed to clear sessions', error);
      throw error;
    }
  }

  public getStoredSessions() {
    return this.state.storedSessions;
  }

  public async handleAuthSuccess(params: AuthSuccessParams): Promise<void> {
    console.log('ConnectionManager: handleAuthSuccess called');
    console.log('  Username:', params.username);
    console.log('  Full Name:', params.fullName);
    console.log('  Server Address:', params.serverAddress);
    console.log('  CID:', params.cid);

    const session: StoredSession = {
      username: params.username,
      password: params.password,
      serverAddress: params.serverAddress,
      serverPassword: params.serverPassword,
      fullName: params.fullName,
      lastConnected: Date.now(),
      cid: params.cid,
      sessionSecuritySettings: params.securitySettings,
    };

    try {
      await this.storeSession(session);

      // Set lastAccessed timestamp for OrphanSessionsNavbar MRU ordering
      // This ensures newly created/logged-in sessions appear at the top of the navbar
      if (params.cid !== undefined) {
        const lastAccessedKey = `session_last_accessed_${params.cid.toString()}`;
        localStorage.setItem(lastAccessedKey, Date.now().toString());
      }

      console.log('[ILM-TRACE] handleAuthSuccess: setting tab context for CID:', params.cid?.toString());
      try {
        await Promise.race([
          this.io.setSelectedUser({
            selectedUsername: params.username,
            selectedServerAddress: params.serverAddress,
            selectedCid: params.cid,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('setSelectedUser timeout')), SET_USER_TIMEOUT_MS)
          ),
        ]);
        console.log('[ILM-TRACE] handleAuthSuccess: tab context set successfully');
      } catch (err: any) {
        if (err.message === 'setSelectedUser timeout') {
          console.warn('[ILM-TRACE] handleAuthSuccess: setSelectedUser timed out - continuing anyway');
        } else {
          throw err;
        }
      }

      if (params.cid !== undefined) {
        this.state.setCurrentConnectionInfo({
          cid: params.cid,
          username: params.username,
          serverAddress: params.serverAddress,
          fullName: params.fullName,
        });

        this.io.setWorkspaceConnectionId(params.cid);

        console.log('[ILM-TRACE] handleAuthSuccess: triggering connection status update for CID:', params.cid.toString());
        this.io.updateConnectionService({
          cid: params.cid,
          isConnected: true,
          userContext: {
            selectedUsername: params.username,
            selectedServerAddress: params.serverAddress,
            selectedCid: params.cid,
          },
        });
      }

      console.log('[ILM-TRACE] handleAuthSuccess: completed successfully');
    } catch (error) {
      console.error('ConnectionManager: handleAuthSuccess failed:', error);
      throw error;
    }
  }

  public async handleLogout(username: string, serverAddress: string, cid: bigint): Promise<void> {
    console.log('ConnectionManager: handleLogout called for', username, 'CID:', cid);
    this.state.removeSession(username, serverAddress);
    await this.io.storeSessionsToLocalDB(this.state.storedSessions);
    console.log('ConnectionManager: Session removed for', username);

    if (cid) {
      await this.io.disconnect(cid);
    }
  }

  public getConnectionInfo(): CurrentConnectionInfo | null {
    return this.state.currentConnectionInfo;
  }

  public async getTabSelectedSession(): Promise<StoredSession | null> {
    const tabSelection = await this.io.getSelectedUser();
    if (!tabSelection?.selectedUsername || !tabSelection?.selectedServerAddress) {
      const activeIndex = await this.getTabActiveSessionIndex();
      return this.state.storedSessions.sessions[activeIndex] || null;
    }

    return (
      this.state.findSession(tabSelection.selectedUsername, tabSelection.selectedServerAddress) || null
    );
  }

  public getStoredSessionsArray(): StoredSession[] {
    return this.state.getSessionsArray();
  }

  public async removeSession(username: string, serverAddress: string): Promise<void> {
    try {
      console.log('ConnectionManager: Removing session for', username, 'at', serverAddress);
      this.state.removeSession(username, serverAddress);
      await this.io.storeSessionsToLocalDB(this.state.storedSessions);
      console.log('ConnectionManager: Session removed successfully');
    } catch (error) {
      console.error('ConnectionManager: Failed to remove session', error);
      throw error;
    }
  }

  public async removeAllSessions(): Promise<void> {
    try {
      console.log('ConnectionManager: Removing all stored sessions');
      this.state.clearSessions();
      await this.io.storeSessionsToLocalDB(this.state.storedSessions);
      console.log('ConnectionManager: All sessions removed successfully');

      if (this.state.currentConnectionInfo) {
        await this.disconnect();
      }
    } catch (error) {
      console.error('ConnectionManager: Failed to remove all sessions', error);
      throw error;
    }
  }

  /**
   * Disconnect a session from the server.
   * @param session - Optional session to disconnect. If not provided, uses currentConnectionInfo.
   *                  IMPORTANT: Always pass the session when you have it to avoid silent failures
   *                  when currentConnectionInfo is out of sync with the actual session.
   */
  public async disconnect(session?: { cid: bigint; username?: string; serverAddress?: string }): Promise<void> {
    try {
      // Use provided session or fall back to currentConnectionInfo
      const cid = session?.cid ?? this.state.currentConnectionInfo?.cid;
      const username = session?.username ?? this.state.currentConnectionInfo?.username;
      const serverAddress = session?.serverAddress ?? this.state.currentConnectionInfo?.serverAddress;

      if (!cid) {
        console.warn('ConnectionManager: disconnect() called but no CID available - skipping backend disconnect');
        // Still clear local state
        this.state.setCurrentConnectionInfo(null);
        this.state.invalidateCache();
        this.io.updateConnectionService({ cid: null, isConnected: false });
        this.io.broadcastConnectionStatus({ isConnected: false });
        return;
      }

      console.log('ConnectionManager: Disconnecting session with CID:', cid.toString());

      if (username && serverAddress) {
        await this.io.markUserDisconnected(username, serverAddress);
      }
      await this.io.disconnect(cid);

      this.state.setCurrentConnectionInfo(null);
      this.state.invalidateCache();

      this.io.updateConnectionService({ cid: null, isConnected: false });
      this.io.broadcastConnectionStatus({ isConnected: false });
    } catch (error) {
      console.error('ConnectionManager: Failed to disconnect', error);
      throw error; // Re-throw so callers know disconnect failed
    }
  }

  public async switchAccount(username: string, serverAddress: string): Promise<void> {
    const session = this.state.findSession(username, serverAddress);
    if (!session) {
      throw new Error('Session not found');
    }

    console.log(`ConnectionManager: Switching account to ${username}@${serverAddress} for this tab`);

    await this.io.setSelectedUser({
      selectedUsername: username,
      selectedServerAddress: serverAddress,
      selectedCid: session.cid,
    });

    if (this.state.isLeader) {
      await this.disconnect();

      try {
        const requestId = crypto.randomUUID();
        await this.io.connect({
          requestId,
          username: session.username,
          password: session.password,
          serverAddress: session.serverAddress,
          serverPassword: session.serverPassword,
          sessionSecuritySettings: session.sessionSecuritySettings,
        });

        session.lastConnected = Date.now();
        await this.storeSession(session);
      } catch (error) {
        console.error('ConnectionManager: Failed to switch account', error);
        throw error;
      }
    } else {
      console.log('ConnectionManager: Follower tab - updating selected user without reconnecting');
    }
  }

  public async updateSessionRole(username: string, serverAddress: string, role: string): Promise<void> {
    try {
      const session = this.state.findSession(username, serverAddress);
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
