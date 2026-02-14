/**
 * Connection I/O - WebSocket & LocalDB Operations
 *
 * Handles WebSocket transport and LocalDB persistence.
 * Part of the ConnectionIO class (SBIO pattern).
 */

import { websocketService } from '../websocket-service';
import { safeJSONStringify } from '../storage-utils';
import { formatForDebug } from '../debug-formatter';
import { stringToBytes, bytesToString } from '../utils/encoding-utils';
import type { SessionSecuritySettings } from '../p2p-registration-service';
import type { StoredSessions, GetSessionsRequest, GetSessionsResponse } from '@/types/session-types';
import type { ConnectionIntent, PendingRequest } from './types';
import { SESSION_STORAGE_KEY } from '@/types/session-types';
import { debugLog } from '@/lib/debug-config';

/**
 * WebSocket and LocalDB I/O operations.
 * Extracted from ConnectionIO for file size compliance.
 */
export class ConnectionIOWebSocket {
  async executeWebSocketIntent(intent: ConnectionIntent): Promise<unknown> {
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
      default:
        return undefined;
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

  async storeSessionsToLocalDB(sessions: StoredSessions): Promise<void> {
    const valueStr = safeJSONStringify(sessions);
    debugLog('ConnectionIO', 'Storing sessions, serialized:', formatForDebug(valueStr));
    const valueBytes = stringToBytes(valueStr);
    await this.localDBSet(0n, SESSION_STORAGE_KEY, valueBytes);
  }

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
  // GetSessions Request Helper
  // ============================================================================

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
