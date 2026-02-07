/**
 * Disconnect Operations
 *
 * Handles session disconnect and deregister operations via the internal service.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { requestResponse } from './request-response';
import { debugLog, errorLog } from '../debug-config';

export interface DisconnectConfig {
  init: () => Promise<void>;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
}

export class DisconnectOperations {
  private readonly config: DisconnectConfig;

  constructor(config: DisconnectConfig) {
    this.config = config;
  }

  /**
   * Disconnect a session from the server.
   * Waits for DisconnectNotification from backend before resolving.
   * This ensures the session is fully cleaned up before the Promise resolves.
   */
  async disconnect(cid: bigint): Promise<void> {
    if (cid === undefined || cid === null) {
      throw new Error('CID is required to disconnect a session');
    }

    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      Disconnect: { request_id: requestId, cid }
    };

    debugLog('websocket', 'Sending Disconnect request', request);

    await requestResponse<true>({
      request, requestId, timeoutMs: 30000,
      sendRequest: this.config.sendRequest,
      operationName: 'Disconnect',
      matcher: {
        matchSuccess: (message) => {
          const response = ((message as { Response?: Record<string, unknown> }).Response || message) as {
            DisconnectNotification?: { request_id?: string | null; cid?: bigint };
          };
          if (response.DisconnectNotification) {
            const n = response.DisconnectNotification;
            if (n.request_id === requestId || (n.request_id === null && n.cid === cid)) {
              debugLog('websocket', 'Disconnect successful for CID:', cid.toString());
              return true;
            }
          }
          return undefined;
        },
        matchFailure: (message) => {
          const response = ((message as { Response?: Record<string, unknown> }).Response || message) as {
            DisconnectFailure?: { request_id?: string | null; cid?: bigint; message?: string };
          };
          if (response.DisconnectFailure) {
            const f = response.DisconnectFailure;
            if (f.request_id === requestId || (f.request_id === null && f.cid === cid)) {
              errorLog('Disconnect failed:', f.message);
              return f.message || 'Failed to disconnect';
            }
          }
          return undefined;
        },
      },
    });
  }

  /**
   * Deregister from the server - permanently removes the account.
   * This is different from disconnect which only ends the session.
   * Use this for complete cleanup between test runs.
   */
  async deregister(cid: bigint): Promise<void> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      Deregister: { request_id: requestId, cid }
    };

    debugLog('websocket', 'Sending Deregister request', request);

    await requestResponse<true>({
      request, requestId, timeoutMs: 30000,
      sendRequest: this.config.sendRequest,
      operationName: 'Deregister',
      matcher: {
        matchSuccess: (message) => {
          const response = ((message as { Response?: Record<string, unknown> }).Response || message) as {
            DeregisterSuccess?: { request_id: string };
          };
          if (response.DeregisterSuccess?.request_id === requestId) {
            debugLog('websocket', 'Deregister successful for CID:', cid.toString());
            return true;
          }
          return undefined;
        },
        matchFailure: (message) => {
          const response = ((message as { Response?: Record<string, unknown> }).Response || message) as {
            DeregisterFailure?: { request_id: string; message?: string };
          };
          if (response.DeregisterFailure?.request_id === requestId) {
            return response.DeregisterFailure.message || 'Failed to deregister';
          }
          return undefined;
        },
      },
    });
  }
}
