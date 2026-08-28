/**
 * Server Auto-Connect Service - Service Class
 *
 * Singleton that automatically reconnects disconnected sessions to servers with:
 * - Exponential backoff: 5s -> 10s -> 20s -> ... -> 5min max
 * - Global settings stored via LocalDB with CID 0
 * - Centralized poll() method for on-demand triggering
 * - Event-driven lifecycle (startPolling/stopPolling)
 */

import { instanceManager } from '@/lib/multi-instance';
import type { StoredSession } from '@/types/session-types';
import { EventListenerPollingService } from '@/lib/utils/polling-service';
import { getVariant } from '@/lib/ws-message-boundary';
import type { WebSocketMessage } from '@/types/ws-message-types';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '@/lib/timeout-constants';
import type { ConnectionAttempt } from './types';
import { POLL_INTERVAL_MS } from './types';
import {
  loadEnabledSetting,
  saveEnabledSetting,
  loadUserDisconnectedSessions,
  persistUserDisconnectedSessions,
} from './persistence';
import {
  reconnectToDisconnectedSessions,
  scheduleReconnect as doScheduleReconnect,
  cancelRetry as doCancelRetry,
  cancelAllRetries as doCancelAllRetries,
} from './reconnect-logic';

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
    if (!this.isEnabled || !instanceManager.isLeader) return;
    await reconnectToDisconnectedSessions(
      this.isEnabled,
      this.reconnectAttempts,
      this.userDisconnectedSessions,
      (key, session) => this.scheduleReconnect(key, session)
    );
  }

  public static getInstance(): ServerAutoConnectService {
    if (!ServerAutoConnectService.instance) {
      ServerAutoConnectService.instance = new ServerAutoConnectService();
    }
    return ServerAutoConnectService.instance;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.isEnabled = await loadEnabledSetting();
      this.userDisconnectedSessions = await loadUserDisconnectedSessions();
      this.isInitialized = true;
      debugLog('ServerAutoConnectService', `Initialized (enabled: ${this.isEnabled}, userDisconnectedSessions: ${this.userDisconnectedSessions.size})`);
    } catch (error) {
      debugLog('ServerAutoConnectService', 'Failed to load settings, using defaults:', error);
      this.isEnabled = true;
      this.isInitialized = true;
    }
  }

  protected setupEventListeners(): void {
    this.listen('auth:success', () => {
      debugLog('ServerAutoConnectService', 'Auth success detected, starting polling after delay');
      setTimeout(() => this.startPolling(), TIMEOUT.SESSION_MANAGEMENT_MS);
    });

    this.listen('p2p:registration-service-stopped', () => {
      debugLog('ServerAutoConnectService', 'Logout detected, stopping polling');
      this.stopPolling();
      this.cancelAllRetries();
    });

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

    this.listen<{ isLeader: boolean; leaderId: string }>('instance:leader-changed', (data) => {
      debugLog('ServerAutoConnectService', `Leader changed - isLeader: ${data.isLeader}`);
      if (data.isLeader) {
        this.startPolling();
      } else {
        this.stopPolling();
        this.cancelAllRetries();
      }
    });
  }

  public async getEnabled(): Promise<boolean> {
    if (!this.isInitialized) await this.init();
    return this.isEnabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    try {
      // Assigned only after the write lands. Setting it first meant a failed
      // save left the service running the NEW value while the UI reverted its
      // switch and told the user it had not saved — and the next getEnabled()
      // reported the value the user had just been told was rejected.
      await saveEnabledSetting(enabled);
      this.isEnabled = enabled;
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

  public override stopPolling(): void {
    super.stopPolling();
    debugLog('ServerAutoConnectService', 'Stopped background polling');
  }

  private scheduleReconnect(sessionKey: string, session: StoredSession): void {
    doScheduleReconnect(this.reconnectAttempts, sessionKey, session);
  }

  private async handleConnectionSuccess(connectSuccess: { cid?: bigint; username?: string; server_addr?: string }): Promise<void> {
    const username = connectSuccess.username;
    const serverAddress = connectSuccess.server_addr;

    if (username) {
      const sessionKey: string = `${username}@${serverAddress}`;
      this.cancelRetry(sessionKey);
      this.activeSessionKeys.add(sessionKey);
      if (this.userDisconnectedSessions.has(sessionKey)) {
        this.userDisconnectedSessions.delete(sessionKey);
        await persistUserDisconnectedSessions(this.userDisconnectedSessions);
      }
      debugLog('ServerAutoConnectService', `Connection successful for ${username}`);
    }
  }

  private handleConnectionFailure(connectFailure: { message?: string }): void {
    debugLog('ServerAutoConnectService', 'Connection failure:', connectFailure.message);
  }

  private handleDisconnect(notification: { cid?: bigint }): void {
    const cid = notification.cid?.toString();
    debugLog('ServerAutoConnectService', `Disconnect notification for CID ${cid}`);
    if (this.isEnabled) {
      setTimeout(() => this.triggerReconnect(), 1000);
    }
  }

  /**
   * Record, in memory, that the user signed out. Separate from the persistence
   * below: they have different deadlines — see lib/connection/lifecycle.ts.
   */
  public markUserDisconnectedNow(username: string, serverAddress: string): void {
    const sessionKey: string = `${username}@${serverAddress}`;
    this.userDisconnectedSessions.add(sessionKey);
    this.cancelRetry(sessionKey);
  }

  /** Persist what `markUserDisconnectedNow` recorded. Best-effort. */
  public async persistUserDisconnected(): Promise<void> {
    await persistUserDisconnectedSessions(this.userDisconnectedSessions);
  }

  /** Both halves, for callers with no disconnect waiting on the write. */
  public async markUserDisconnected(username: string, serverAddress: string): Promise<void> {
    this.markUserDisconnectedNow(username, serverAddress);
    await this.persistUserDisconnected();
  }

  public async clearUserDisconnected(username: string, serverAddress: string): Promise<void> {
    const sessionKey: string = `${username}@${serverAddress}`;
    this.userDisconnectedSessions.delete(sessionKey);
    await persistUserDisconnectedSessions(this.userDisconnectedSessions);
    debugLog('ServerAutoConnectService', `Cleared user-disconnected status for ${username} (persisted to LocalDB)`);
  }

  public cancelRetry(sessionKey: string): void {
    doCancelRetry(this.reconnectAttempts, sessionKey);
  }

  public cancelAllRetries(): void {
    doCancelAllRetries(this.reconnectAttempts, this.activeSessionKeys);
  }

  public getPendingReconnectCount(): number {
    return this.reconnectAttempts.size;
  }
}
