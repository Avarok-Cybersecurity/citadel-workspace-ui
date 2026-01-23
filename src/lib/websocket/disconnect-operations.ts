/**
 * Disconnect Operations
 *
 * Handles session disconnect and deregister operations via the internal service.
 * Extracted from websocket-service.ts to reduce file size.
 */

import { eventEmitter } from '../event-emitter';
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
      Disconnect: {
        request_id: requestId,
        cid: cid
      }
    };

    debugLog('websocket', 'Sending Disconnect request', request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('Disconnect request timed out'));
      }, 30000);

      const handler = (message: Record<string, unknown>) => {
        const response = (message.Response || message) as {
          DisconnectNotification?: { request_id?: string | null; cid?: bigint };
          DisconnectFailure?: { request_id?: string | null; cid?: bigint; message?: string };
        };

        if (response.DisconnectNotification) {
          const notification = response.DisconnectNotification;
          if (notification.request_id === requestId ||
              (notification.request_id === null && notification.cid === cid)) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            debugLog('websocket', 'Disconnect successful for CID:', cid.toString());
            resolve();
          }
        }

        if (response.DisconnectFailure) {
          const failure = response.DisconnectFailure;
          if (failure.request_id === requestId ||
              (failure.request_id === null && failure.cid === cid)) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            errorLog('Disconnect failed:', failure.message);
            reject(new Error(failure.message || 'Failed to disconnect'));
          }
        }
      };

      eventEmitter.on('websocket-message', handler);

      this.config.sendRequest(request, requestId).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        errorLog('Error sending disconnect request:', error);
        reject(error);
      });
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
      Deregister: {
        request_id: requestId,
        cid: cid
      }
    };

    debugLog('websocket', 'Sending Deregister request', request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('Deregister request timed out'));
      }, 30000);

      const handler = (message: Record<string, unknown>) => {
        const response = (message.Response || message) as {
          DeregisterSuccess?: { request_id: string };
          DeregisterFailure?: { request_id: string; message?: string };
        };

        if (response.DeregisterSuccess && response.DeregisterSuccess.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          debugLog('websocket', 'Deregister successful for CID:', cid.toString());
          resolve();
        }

        if (response.DeregisterFailure && response.DeregisterFailure.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(response.DeregisterFailure.message || 'Failed to deregister'));
        }
      };

      eventEmitter.on('websocket-message', handler);

      this.config.sendRequest(request, requestId).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handler);
        reject(error);
      });
    });
  }
}
