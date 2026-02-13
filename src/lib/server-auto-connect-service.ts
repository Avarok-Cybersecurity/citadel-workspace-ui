/**
 * Server Auto-Connect Service
 *
 * Automatically reconnects disconnected sessions to servers with:
 * - Exponential backoff: 5s → 10s → 20s → ... → 5min max
 * - Global settings stored via LocalDB with CID 0
 * - Centralized poll() method for on-demand triggering
 * - Event-driven lifecycle (startPolling/stopPolling)
 */

import { websocketService } from './websocket-service';
import { instanceManager } from './multi-instance';
import type { StoredSession, ActiveSession } from '@/types/session-types';
import { v4 as uuidv4 } from 'uuid';
import { EventListenerPollingService } from './utils/polling-service';
import { stringToBytes, bytesToString } from './utils/encoding-utils';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { getVariant } from '@/lib/ws-message-boundary';
import type { WebSocketMessage } from '@/types/ws-message-types';
import { TIMEOUT, POLLING } from './timeout-constants';

interface ConnectionAttempt {
  sessionKey: string;
  attempts: number;
  timeout: NodeJS.Timeout | null;
  lastError?: string;
}

const BASE_DELAY = TIMEOUT.SERVER_REQUEST_MS;
const MAX_DELAY = POLLING.OUTGOING_REQUESTS_INTERVAL_MS;
const POLL_INTERVAL_MS = POLLING.SERVER_POLL_INTERVAL_MS;
const LOCALDB_KEY = 'server_auto_connect_enabled';
const USER_DISCONNECTED_KEY = 'user_disconnected_sessions';
const GLOBAL_CID = 0n;

export class ServerAutoConnectService extends EventListenerPollingService {
  private static instance: ServerAutoConnectService;

  private reconnectAttempts = new Map<string, ConnectionAttempt>();
  private activeSessionKeys = new Set<string>();
  private userDisconnectedSessions = new Set<string>();
  private isEnabled = true;
  private isInitialized = false;

  private constructor() {
    super();
    this.setupEventListeners();
  }

  protected getPollingIntervalMs(): number {
    return POLL_INTERVAL_MS;
  }

  protected async poll(): Promise<void> {
    if (!this.isEnabled || !instanceManager.isLeader) {
      return;
    }
    await this.reconnectToDisconnectedSessions();
  }

  public static getInstance(): ServerAutoConnectService {
    if (!ServerAutoConnectService.instance) {
      ServerAutoConnectService.instance = new ServerAutoConnectService();
    }
    return ServerAutoConnectService.instance;
  }

  /**
   * Initialize the service - load settings from LocalDB
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.isEnabled = await this.loadEnabledSetting();
      await this.loadUserDisconnectedSessions();
      this.isInitialized = true;
      debugLog('ServerAutoConnectService', `Initialized (enabled: ${this.isEnabled}, userDisconnectedSessions: ${this.userDisconnectedSessions.size})`);
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to load settings, using defaults:', error);
      this.isEnabled = true; // Default to enabled
      this.isInitialized = true;
    }
  }

  /**
   * Load user disconnected sessions from LocalDB.
   * These are sessions the user explicitly signed out from and should not auto-reconnect.
   */
  private async loadUserDisconnectedSessions(): Promise<void> {
    try {
      const result = await websocketService.sendLocalDBGet(
        GLOBAL_CID,
        USER_DISCONNECTED_KEY
      );

      if (result?.value) {
        const decoded = bytesToString(result.value);
        const sessions = JSON.parse(decoded);
        if (Array.isArray(sessions)) {
          this.userDisconnectedSessions = new Set(sessions);
          debugLog('ServerAutoConnectService', `Loaded ${sessions.length} user-disconnected sessions from LocalDB`);
        }
      }
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to load user disconnected sessions:', error);
      // Keep empty set as default
    }
  }

  /**
   * Persist user disconnected sessions to LocalDB
   */
  private async persistUserDisconnectedSessions(): Promise<void> {
    try {
      const sessions = Array.from(this.userDisconnectedSessions);
      const value = stringToBytes(JSON.stringify(sessions));
      await websocketService.sendLocalDBSet(GLOBAL_CID, USER_DISCONNECTED_KEY, value);
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to persist user disconnected sessions:', error);
    }
  }

  /**
   * Setup event listeners for connection lifecycle events.
   * Uses EventListenerManager's listen() for automatic cleanup.
   */
  protected setupEventListeners(): void {
    // Start polling when user logs in successfully
    // Add delay to let the new session be fully established before polling
    // This prevents race conditions where poll() sees stale cache without the new session
    this.listen('auth:success', () => {
      debugLog('ServerAutoConnectService', 'Auth success detected, starting polling after delay');
      setTimeout(() => this.startPolling(), 3000);
    });

    // Stop polling on logout (reuse existing event)
    this.listen('p2p:registration-service-stopped', () => {
      debugLog('ServerAutoConnectService', 'Logout detected, stopping polling');
      this.stopPolling();
      this.cancelAllRetries();
    });

    // Handle connection success/failure from websocket messages
     
    this.listen<WebSocketMessage>('websocket-message', async (message) => {
      const connectSuccess = getVariant(message, 'ConnectSuccess');
      if (connectSuccess) {
        await this.handleConnectionSuccess(connectSuccess as { cid?: bigint; username?: string; server_addr?: string });
      }
      const connectFailure = getVariant(message, 'ConnectFailure');
      if (connectFailure) {
        this.handleConnectionFailure(connectFailure as { message?: string });
      }
      const disconnectNotification = getVariant(message, 'DisconnectNotification');
      if (disconnectNotification) {
        this.handleDisconnect(disconnectNotification as { cid?: bigint });
      }
    });

    // Start/stop polling based on leader status
    // Only leader tab should poll to prevent duplicate connect requests from multiple tabs
    this.listen<{ isLeader: boolean; leaderId: string }>('instance:leader-changed', (data) => {
      debugLog('ServerAutoConnectService', `Leader changed - isLeader: ${data.isLeader}`);
      if (data.isLeader) {
        // Became leader, start polling if enabled
        this.startPolling();
      } else {
        // Lost leadership, stop polling
        this.stopPolling();
        this.cancelAllRetries();
      }
    });
  }

  /**
   * Load enabled setting from LocalDB
   */
  private async loadEnabledSetting(): Promise<boolean> {
    try {
      const result = await websocketService.sendLocalDBGet(
        GLOBAL_CID,
        LOCALDB_KEY
      );

      if (result?.value) {
        const decoded = bytesToString(result.value);
        return decoded === 'true';
      }
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to load enabled setting:', error);
    }

    return true; // Default: enabled
  }

  /**
   * Get current enabled setting for UI
   */
  public async getEnabled(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.isEnabled;
  }

  /**
   * Set enabled setting and persist to LocalDB
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;

    try {
      const value = stringToBytes(String(enabled));
      await websocketService.sendLocalDBSet(GLOBAL_CID, LOCALDB_KEY, value);
      debugLog('ServerAutoConnectService', `Setting saved (enabled: ${enabled})`);

      // Start or stop polling based on new setting
      if (enabled) {
        this.startPolling();
      } else {
        this.stopPolling();
        this.cancelAllRetries();
      }
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to save enabled setting:', error);
      throw error;
    }
  }

  /**
   * Generate a unique key for a session
   */
  private getSessionKey(session: StoredSession): string {
    return `${session.username}@${session.serverAddress}`;
  }

  /**
   * Trigger an immediate poll to reconnect disconnected sessions.
   * Only runs on leader tab to prevent duplicate connect requests.
   */
  public triggerReconnect(): void {
    if (!this.isEnabled) {
      debugLog('ServerAutoConnectService', 'Poll skipped (disabled)');
      return;
    }

    if (!instanceManager.isLeader) {
      debugLog('ServerAutoConnectService', 'Poll skipped (not leader tab)');
      return;
    }

    this.triggerPoll().catch((err) => {
      debugLog('ServerAutoConnectService', 'Poll failed:', err);
    });
  }

  /**
   * Start periodic background polling for auto-reconnection.
   * Only runs on leader tab to prevent duplicate connect requests.
   */
  public override startPolling(): void {
    if (!this.isEnabled) {
      debugLog('ServerAutoConnectService', 'Polling not started (disabled)');
      return;
    }

    if (!instanceManager.isLeader) {
      debugLog('ServerAutoConnectService', 'Polling not started (not leader tab)');
      return;
    }

    debugLog('ServerAutoConnectService', `Starting background polling (interval: ${POLL_INTERVAL_MS / 1000}s)`);
    this.triggerReconnect();
    super.startPolling();
  }

  /**
   * Stop periodic background polling.
   */
  public override stopPolling(): void {
    super.stopPolling();
    debugLog('ServerAutoConnectService', 'Stopped background polling');
  }

  /**
   * Reconnect to all disconnected sessions
   */
  private async reconnectToDisconnectedSessions(): Promise<void> {
    // Import connectionManager dynamically to avoid circular dependency
    const { connectionManager } = await import('./connection');

    // Get stored sessions
    const storedSessions = connectionManager.getStoredSessions();
    if (!storedSessions.sessions || storedSessions.sessions.length === 0) {
      return;
    }

    // Get active sessions - FORCE FRESH to avoid race conditions with just-connected sessions
    let activeSessions: ActiveSession[] = [];
    try {
      // Invalidate cache to ensure we get fresh session data
      // This prevents duplicate connection attempts when a session was just established
      connectionManager.invalidateSessionCache();
      activeSessions = await connectionManager.getActiveSessions();
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to get active sessions:', error);
    }

    // Build set of active session keys
    // Note: ActiveSession uses snake_case (server_address), normalize for comparison
    const activeKeys = new Set<string>();
    debugLog('ServerAutoConnectService', `ServerAutoConnect: Active sessions count: ${activeSessions.length}`);
    for (const session of activeSessions) {
      // Match by username + server address if available
      if (session.username) {
        const key = `${session.username}@${session.server_address}`;
        activeKeys.add(key);
        debugLog('ServerAutoConnectService', `ServerAutoConnect: Active session key: ${key}`);
      }
    }

    // Find disconnected sessions
    debugLog('ServerAutoConnectService', `ServerAutoConnect: Stored sessions count: ${storedSessions.sessions.length}`);
    for (const session of storedSessions.sessions) {
      const sessionKey = this.getSessionKey(session);
      debugLog('ServerAutoConnectService', `ServerAutoConnect: Checking stored session: ${sessionKey}, active: ${activeKeys.has(sessionKey)}`);

      // Skip if already connected
      if (activeKeys.has(sessionKey)) {
        debugLog('ServerAutoConnectService', `Skipping ${session.username} (already active)`);
        continue;
      }

      // Skip if currently being reconnected
      if (this.reconnectAttempts.has(sessionKey)) {
        continue;
      }

      // Skip if no credentials stored
      if (!session.username || !session.password) {
        continue;
      }

      // Skip if user explicitly disconnected this session (respect user intent)
      if (this.userDisconnectedSessions.has(sessionKey)) {
        debugLog('ServerAutoConnectService', `Skipping ${session.username} (user-initiated disconnect)`);
        continue;
      }

      debugLog('ServerAutoConnectService', `Scheduling reconnect for ${session.username}`);
      this.scheduleReconnect(sessionKey, session);
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(sessionKey: string, session: StoredSession): void {
    const attempt: ConnectionAttempt = {
      sessionKey,
      attempts: 0,
      timeout: null
    };

    this.reconnectAttempts.set(sessionKey, attempt);

    // Attempt immediately for first try
    runAsyncSetup(async () => {
      await this.attemptReconnect(sessionKey, session);
    });
  }

  /**
   * Attempt to reconnect a session
   */
  private async attemptReconnect(sessionKey: string, session: StoredSession): Promise<void> {
    const attempt = this.reconnectAttempts.get(sessionKey);
    if (!attempt) {
      return;
    }

    try {
      debugLog('ServerAutoConnectService', `Attempting reconnect for ${session.username} (attempt ${attempt.attempts + 1})`);

      await websocketService.connect(
        uuidv4(),
        session.username,
        session.password,
        session.sessionSecuritySettings
      );

      // Success will be handled by event listener
    } catch (error) {
      // Calculate exponential backoff
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt.attempts), MAX_DELAY);
      attempt.attempts++;
      attempt.lastError = error instanceof Error ? error.message : String(error);

      debugLog('ServerAutoConnectService',
        `Reconnect failed for ${session.username}, ` +
        `retry in ${delay / 1000}s (attempt ${attempt.attempts})`
      );

      // Schedule retry
      attempt.timeout = setTimeout(() => {
        runAsyncSetup(async () => {
          await this.attemptReconnect(sessionKey, session);
        });
      }, delay);

      this.reconnectAttempts.set(sessionKey, attempt);
    }
  }

  /**
   * Handle successful connection
   */
  private async handleConnectionSuccess(connectSuccess: { cid?: bigint; username?: string; server_addr?: string }): Promise<void> {
    const cid = connectSuccess.cid?.toString();
    const username = connectSuccess.username;
    const serverAddress = connectSuccess.server_addr;

    if (username) {
      const sessionKey = `${username}@${serverAddress}`;
      this.cancelRetry(sessionKey);
      this.activeSessionKeys.add(sessionKey);
      // Clear user-disconnected status since user is now connected
      if (this.userDisconnectedSessions.has(sessionKey)) {
        this.userDisconnectedSessions.delete(sessionKey);
        // Persist to LocalDB
        await this.persistUserDisconnectedSessions();
      }
      debugLog('ServerAutoConnectService', `Connection successful for ${username}`);
    }
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(connectFailure: { message?: string }): void {
    // Connection failure is handled by attemptReconnect's catch block
    debugLog('ServerAutoConnectService', 'Connection failure:', connectFailure.message);
  }

  /**
   * Handle disconnect notification - trigger reconnect if enabled
   */
  private handleDisconnect(notification: { cid?: bigint }): void {
    const cid = notification.cid?.toString();
    debugLog('ServerAutoConnectService', `Disconnect notification for CID ${cid}`);

    // Remove from active sessions
    // Note: We'd need username to remove from activeSessionKeys
    // The reconnect will happen on next poll

    if (this.isEnabled) {
      setTimeout(() => this.triggerReconnect(), 1000);
    }
  }

  /**
   * Mark a session as user-disconnected to prevent auto-reconnect.
   * Call this when user explicitly disconnects via UI.
   * Respects user intent - if they disconnected, don't auto-reconnect.
   */
  public async markUserDisconnected(username: string, serverAddress: string): Promise<void> {
    const sessionKey = `${username}@${serverAddress}`;
    this.userDisconnectedSessions.add(sessionKey);
    this.cancelRetry(sessionKey);
    // Persist to LocalDB
    await this.persistUserDisconnectedSessions();
    debugLog('ServerAutoConnectService', `Marked ${username} as user-disconnected (won't auto-reconnect, persisted to LocalDB)`);
  }

  /**
   * Clear user-disconnected status for a session.
   * Called when user successfully logs in manually.
   */
  public async clearUserDisconnected(username: string, serverAddress: string): Promise<void> {
    const sessionKey = `${username}@${serverAddress}`;
    this.userDisconnectedSessions.delete(sessionKey);
    // Persist to LocalDB
    await this.persistUserDisconnectedSessions();
    debugLog('ServerAutoConnectService', `Cleared user-disconnected status for ${username} (persisted to LocalDB)`);
  }

  /**
   * Cancel pending retry for a session
   */
  public cancelRetry(sessionKey: string): void {
    const attempt = this.reconnectAttempts.get(sessionKey);
    if (attempt?.timeout) {
      clearTimeout(attempt.timeout);
      this.reconnectAttempts.delete(sessionKey);
    }
  }

  /**
   * Cancel all pending retries
   */
  public cancelAllRetries(): void {
    for (const [sessionKey, attempt] of this.reconnectAttempts) {
      if (attempt.timeout) {
        clearTimeout(attempt.timeout);
      }
    }
    this.reconnectAttempts.clear();
    this.activeSessionKeys.clear();
  }

  /**
   * Get number of pending reconnection attempts
   */
  public getPendingReconnectCount(): number {
    return this.reconnectAttempts.size;
  }
}

// Singleton export
export const serverAutoConnectService = ServerAutoConnectService.getInstance();
