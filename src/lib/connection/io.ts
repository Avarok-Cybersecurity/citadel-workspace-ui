/**
 * Connection I/O Router
 *
 * Handles all I/O operations for connection management.
 * Follows SBIO principle - all I/O is routed through this class.
 *
 * The service layer creates intents describing what should happen,
 * and this class executes them.
 */

import { websocketService } from '../websocket-service';
import { ConnectionService } from '../connection-service';
import WorkspaceService from '../workspace-service';
import { broadcastChannelService } from '../broadcast-channel-service';
import { healthCheckService } from '../health-check';
import { eventEmitter } from '../event-emitter';
import { peerRegistrationStore } from '../peer-registration-store';
import { serverAutoConnectService } from '../server-auto-connect-service';
import { instanceManager, instanceChannel } from '../multi-instance';
import { setSelectedUser, getSelectedUser, clearSelectedUser } from '../tab-context';
import { safeJSONStringify } from '../storage-utils';
import { formatForDebug } from '../debug-formatter';
import { stringToBytes, bytesToString } from '../utils/encoding-utils';
import type { SessionSecuritySettings } from '../p2p-registration-service';
import type { StoredSessions, GetSessionsRequest, GetSessionsResponse } from '@/types/session-types';
import type { ConnectionIntent, TabSelectionContext, PendingRequest } from './types';
import { SESSION_STORAGE_KEY } from '@/types/session-types';
import { debugLog } from '@/lib/debug-config';

export class ConnectionIO {
  /**
   * Execute a connection intent.
   */
  async executeIntent(intent: ConnectionIntent): Promise<unknown> {
    switch (intent.type) {
      case 'init-websocket':
        return this.initWebSocket();
      case 'set-orphan-mode':
        return this.setOrphanMode(intent.enabled);
      case 'send-websocket-message':
        return this.sendWebSocketMessage(intent.message);
      case 'connect':
        return this.connect(intent);
      case 'disconnect':
        return this.disconnect(intent.cid);
      case 'claim-session':
        return this.claimSession(intent.cid, intent.onlyIfOrphaned);
      case 'localdb-set':
        return this.localDBSet(intent.cid, intent.key, intent.value);
      case 'localdb-get':
        return this.localDBGet(intent.cid, intent.key);
      case 'broadcast-connection-status':
        return this.broadcastConnectionStatus(intent.status);
      case 'update-connection-service':
        return this.updateConnectionService(intent.status);
      case 'set-workspace-connection-id':
        return this.setWorkspaceConnectionId(intent.cid);
      case 'mark-user-disconnected':
        return this.markUserDisconnected(intent.username, intent.serverAddress);
      case 'emit-event':
        return this.emitEvent(intent.event, intent.data);
      case 'set-instance-cid':
        return this.setInstanceCid(intent.cid);
      case 'announce-presence':
        return this.announcePresence();
      case 'wait-for-healthy':
        return this.waitForHealthy(intent.timeoutMs);
      case 'set-selected-user':
        return this.setSelectedUser(intent.context);
      case 'clear-selected-user':
        return this.clearSelectedUser();
      default:
        throw new Error(`Unknown connection intent type: ${(intent as ConnectionIntent).type}`);
    }
  }

  // ============================================================================
  // WebSocket Operations
  // ============================================================================

  async initWebSocket(): Promise<void> {
    await websocketService.init();
  }

  setOrphanMode(enabled: boolean): void {
    websocketService.setOrphanModeNonBlocking(enabled);
  }

  async sendWebSocketMessage(message: unknown): Promise<void> {
    await websocketService.sendMessage(message as Record<string, unknown>);
  }

  isWebSocketConnected(): boolean {
    return websocketService.isConnected();
  }

  async waitForWebSocketInit(): Promise<void> {
    await websocketService.waitForInit();
  }

  async connect(params: {
    requestId: string;
    username: string;
    password: string;
    sessionSecuritySettings?: SessionSecuritySettings;
  }): Promise<void> {
    await websocketService.connect(
      params.requestId,
      params.username,
      params.password,
      params.sessionSecuritySettings
    );
  }

  async disconnect(cid: bigint): Promise<void> {
    await websocketService.disconnect(cid);
  }

  async claimSession(cid: bigint, onlyIfOrphaned: boolean): Promise<unknown> {
    return websocketService.claimSession(cid, onlyIfOrphaned);
  }

  // ============================================================================
  // LocalDB Operations
  // ============================================================================

  async localDBSet(cid: bigint, key: string, value: number[]): Promise<void> {
    await websocketService.sendLocalDBSet(cid, key, value);
  }

  async localDBGet(cid: bigint, key: string): Promise<{ value: number[] } | null> {
    return websocketService.sendLocalDBGet(cid, key);
  }

  /**
   * Helper: Store sessions to LocalDB.
   */
  async storeSessionsToLocalDB(sessions: StoredSessions): Promise<void> {
    const valueStr = safeJSONStringify(sessions);
    debugLog('ConnectionIO', 'Storing sessions, serialized:', formatForDebug(valueStr));
    const valueBytes = stringToBytes(valueStr);
    await this.localDBSet(0n, SESSION_STORAGE_KEY, valueBytes);
  }

  /**
   * Helper: Load sessions from LocalDB.
   */
  async loadSessionsFromLocalDB(): Promise<StoredSessions | null> {
    const result = await this.localDBGet(0n, SESSION_STORAGE_KEY);
    if (result && result.value) {
      try {
        const jsonStr = bytesToString(result.value);
        return JSON.parse(jsonStr) as StoredSessions;
      } catch (decodeError) {
        debugLog('ConnectionIO', 'Failed to decode stored sessions:', decodeError);
        return null;
      }
    }
    return null;
  }

  // ============================================================================
  // Connection Service Operations
  // ============================================================================

  updateConnectionService(status: {
    cid: bigint | null;
    isConnected: boolean;
    userContext?: TabSelectionContext;
  }): void {
    const connectionService = ConnectionService.getInstance();
    connectionService.updateConnectionStatus(status);
  }

  setWorkspaceConnectionId(cid: bigint): void {
    WorkspaceService.setConnectionId(cid);
  }

  // ============================================================================
  // Broadcast Operations
  // ============================================================================

  broadcastConnectionStatus(status: { isConnected: boolean; cid?: bigint }): void {
    broadcastChannelService.broadcastConnectionStatus(status);
  }

  getIsLeaderFromBroadcast(): boolean {
    return broadcastChannelService.getIsLeader();
  }

  // ============================================================================
  // Event Operations
  // ============================================================================

  emitEvent(event: string, data: unknown): void {
    eventEmitter.emit(event, data);
  }

  onEvent<T>(event: string, handler: (data: T) => void): () => void {
    return eventEmitter.on(event, handler);
  }

  // ============================================================================
  // Instance Management
  // ============================================================================

  setInstanceCid(cid: bigint): void {
    instanceManager.setCid(cid);
  }

  announcePresence(): void {
    instanceChannel.announcePresence();
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async waitForHealthy(timeoutMs: number): Promise<void> {
    await healthCheckService.waitForHealthy(timeoutMs);
  }

  // ============================================================================
  // Tab Context
  // ============================================================================

  async setSelectedUser(context: TabSelectionContext): Promise<void> {
    await setSelectedUser({
      selectedUsername: context.selectedUsername ?? undefined,
      selectedServerAddress: context.selectedServerAddress ?? undefined,
      selectedCid: context.selectedCid,
    });
  }

  async getSelectedUser(): Promise<TabSelectionContext | null> {
    const result = await getSelectedUser();
    if (!result) return null;
    return {
      selectedUsername: result.selectedUsername ?? null,
      selectedServerAddress: result.selectedServerAddress ?? null,
      selectedCid: result.selectedCid,
    };
  }

  async clearSelectedUser(): Promise<void> {
    await clearSelectedUser();
  }

  // ============================================================================
  // Server Auto Connect
  // ============================================================================

  async initServerAutoConnect(): Promise<void> {
    await serverAutoConnectService.init();
  }

  async markUserDisconnected(username: string, serverAddress: string): Promise<void> {
    await serverAutoConnectService.markUserDisconnected(username, serverAddress);
  }

  // ============================================================================
  // Peer Registration Store
  // ============================================================================

  async initPeerRegistrationStore(): Promise<void> {
    await peerRegistrationStore.initialize();
  }

  // ============================================================================
  // GetSessions Request Helper
  // ============================================================================

  /**
   * Send GetSessions request and wait for response.
   * Returns promise that resolves when response is received.
   */
  async sendGetSessionsRequest(
    requestId: string,
    pendingRequests: Map<string, PendingRequest>,
    timeoutMs: number
  ): Promise<GetSessionsResponse> {
    const request: GetSessionsRequest = { request_id: requestId };

    const responsePromise = new Promise<GetSessionsResponse>((resolve, reject) => {
      pendingRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject });

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('GetSessions request timed out'));
        }
      }, timeoutMs);
    });

    await this.sendWebSocketMessage({ GetSessions: request });
    return responsePromise;
  }
}

// Export singleton instance
export const connectionIO = new ConnectionIO();
