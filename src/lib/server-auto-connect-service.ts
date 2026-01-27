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

interface ConnectionAttempt {
  sessionKey: string;
  attempts: number;
  timeout: NodeJS.Timeout | null;
  lastError?: string;
}

const BASE_DELAY = 5000;
const MAX_DELAY = 300000;
const POLL_INTERVAL_MS = 60000;
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
      console.log(`ServerAutoConnect: Initialized (enabled: ${this.isEnabled}, userDisconnectedSessions: ${this.userDisconnectedSessions.size})`);
    } catch (error) {
      console.warn('ServerAutoConnect: Failed to load settings, using defaults:', error);
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
        const decoded = new TextDecoder().decode(new Uint8Array(result.value));
        const sessions = JSON.parse(decoded);
        if (Array.isArray(sessions)) {
          this.userDisconnectedSessions = new Set(sessions);
          console.log(`ServerAutoConnect: Loaded ${sessions.length} user-disconnected sessions from LocalDB`);
        }
      }
    } catch (error) {
      console.warn('ServerAutoConnect: Failed to load user disconnected sessions:', error);
      // Keep empty set as default
    }
  }

  /**
   * Persist user disconnected sessions to LocalDB
   */
  private async persistUserDisconnectedSessions(): Promise<void> {
    try {
      const sessions = Array.from(this.userDisconnectedSessions);
      const value = Array.from(new TextEncoder().encode(JSON.stringify(sessions)));
      await websocketService.sendLocalDBSet(GLOBAL_CID, USER_DISCONNECTED_KEY, value);
    } catch (error) {
      console.warn('ServerAutoConnect: Failed to persist user disconnected sessions:', error);
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
      console.log('ServerAutoConnect: Auth success detected, starting polling after delay');
      setTimeout(() => this.startPolling(), 3000);
    });

    // Stop polling on logout (reuse existing event)
    this.listen('p2p:registration-service-stopped', () => {
      console.log('ServerAutoConnect: Logout detected, stopping polling');
      this.stopPolling();
      this.cancelAllRetries();
    });

    // Handle connection success/failure from websocket messages
    this.listen<any>('websocket-message', async (message) => {
      if (message.ConnectSuccess) {
        await this.handleConnectionSuccess(message.ConnectSuccess);
      }
      if (message.ConnectFailure) {
        this.handleConnectionFailure(message.ConnectFailure);
      }
      if (message.DisconnectNotification) {
        this.handleDisconnect(message.DisconnectNotification);
      }
    });

    // Start/stop polling based on leader status
    // Only leader tab should poll to prevent duplicate connect requests from multiple tabs
    this.listen<{ isLeader: boolean; leaderId: string }>('instance:leader-changed', (data) => {
      console.log(`ServerAutoConnect: Leader changed - isLeader: ${data.isLeader}`);
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
        const decoded = new TextDecoder().decode(new Uint8Array(result.value));
        return decoded === 'true';
      }
    } catch (error) {
      console.warn('ServerAutoConnect: Failed to load enabled setting:', error);
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
      const value = Array.from(new TextEncoder().encode(String(enabled)));
      await websocketService.sendLocalDBSet(GLOBAL_CID, LOCALDB_KEY, value);
      console.log(`ServerAutoConnect: Setting saved (enabled: ${enabled})`);

      // Start or stop polling based on new setting
      if (enabled) {
        this.startPolling();
      } else {
        this.stopPolling();
        this.cancelAllRetries();
      }
    } catch (error) {
      console.error('ServerAutoConnect: Failed to save enabled setting:', error);
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
      console.log('ServerAutoConnect: Poll skipped (disabled)');
      return;
    }

    if (!instanceManager.isLeader) {
      console.log('ServerAutoConnect: Poll skipped (not leader tab)');
      return;
    }

    this.triggerPoll().catch((err) => {
      console.error('ServerAutoConnect: Poll failed:', err);
    });
  }

  /**
   * Start periodic background polling for auto-reconnection.
   * Only runs on leader tab to prevent duplicate connect requests.
   */
  public override startPolling(): void {
    if (!this.isEnabled) {
      console.log('ServerAutoConnect: Polling not started (disabled)');
      return;
    }

    if (!instanceManager.isLeader) {
      console.log('ServerAutoConnect: Polling not started (not leader tab)');
      return;
    }

    console.log(`ServerAutoConnect: Starting background polling (interval: ${POLL_INTERVAL_MS / 1000}s)`);
    this.triggerReconnect();
    super.startPolling();
  }

  /**
   * Stop periodic background polling.
   */
  public override stopPolling(): void {
    super.stopPolling();
    console.log('ServerAutoConnect: Stopped background polling');
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
      console.warn('ServerAutoConnect: Failed to get active sessions:', error);
    }

    // Build set of active session keys
    // Note: ActiveSession uses snake_case (server_address), normalize for comparison
    const activeKeys = new Set<string>();
    console.log(`ServerAutoConnect: Active sessions count: ${activeSessions.length}`);
    for (const session of activeSessions) {
      // Match by username + server address if available
      if (session.username) {
        const key = `${session.username}@${session.server_address}`;
        activeKeys.add(key);
        console.log(`ServerAutoConnect: Active session key: ${key}`);
      }
    }

    // Find disconnected sessions
    console.log(`ServerAutoConnect: Stored sessions count: ${storedSessions.sessions.length}`);
    for (const session of storedSessions.sessions) {
      const sessionKey = this.getSessionKey(session);
      console.log(`ServerAutoConnect: Checking stored session: ${sessionKey}, active: ${activeKeys.has(sessionKey)}`);

      // Skip if already connected
      if (activeKeys.has(sessionKey)) {
        console.log(`ServerAutoConnect: Skipping ${session.username} (already active)`);
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
        console.log(`ServerAutoConnect: Skipping ${session.username} (user-initiated disconnect)`);
        continue;
      }

      console.log(`ServerAutoConnect: Scheduling reconnect for ${session.username}`);
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
    (async () => {
      await this.attemptReconnect(sessionKey, session);
    })().catch(console.error);
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
      console.log(`ServerAutoConnect: Attempting reconnect for ${session.username} (attempt ${attempt.attempts + 1})`);

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

      console.warn(
        `ServerAutoConnect: Reconnect failed for ${session.username}, ` +
        `retry in ${delay / 1000}s (attempt ${attempt.attempts})`
      );

      // Schedule retry
      attempt.timeout = setTimeout(() => {
        (async () => {
          await this.attemptReconnect(sessionKey, session);
        })().catch(console.error);
      }, delay);

      this.reconnectAttempts.set(sessionKey, attempt);
    }
  }

  /**
   * Handle successful connection
   */
  private async handleConnectionSuccess(connectSuccess: any): Promise<void> {
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
      console.log(`ServerAutoConnect: Connection successful for ${username}`);
    }
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(connectFailure: any): void {
    // Connection failure is handled by attemptReconnect's catch block
    console.warn('ServerAutoConnect: Connection failure:', connectFailure.message);
  }

  /**
   * Handle disconnect notification - trigger reconnect if enabled
   */
  private handleDisconnect(notification: any): void {
    const cid = notification.cid?.toString();
    console.log(`ServerAutoConnect: Disconnect notification for CID ${cid}`);

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
    console.log(`ServerAutoConnect: Marked ${username} as user-disconnected (won't auto-reconnect, persisted to LocalDB)`);
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
    console.log(`ServerAutoConnect: Cleared user-disconnected status for ${username} (persisted to LocalDB)`);
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
