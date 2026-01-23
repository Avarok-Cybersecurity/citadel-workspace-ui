/**
 * Session Management Operations
 *
 * Handles session management via ConnectionManagement requests.
 */

import { eventEmitter } from '../event-emitter';
import { debugLog } from '../debug-config';
import type { WorkspaceClient } from 'citadel-workspace-client-ts';

export interface SessionManagementConfig {
  init: () => Promise<void>;
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
  getClient: () => WorkspaceClient | null;
}

export interface SessionManagementResult {
  success: boolean;
  message?: string;
  cid?: bigint;
}

export class SessionManagement {
  private readonly config: SessionManagementConfig;

  constructor(config: SessionManagementConfig) {
    this.config = config;
  }

  async setOrphanMode(enabled: boolean): Promise<SessionManagementResult> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          SetConnectionOrphan: {
            allow_orphan_sessions: enabled
          }
        }
      }
    };

    debugLog('websocket', 'Sending SetConnectionOrphan request', request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('SetConnectionOrphan request timed out'));
      }, 3000);

      const handler = (message: unknown) => {
        const msg = message as { Response?: Record<string, unknown> } & Record<string, unknown>;
        const response = msg.Response || msg;

        const typedResponse = response as {
          ConnectionManagementSuccess?: { request_id: string; message?: string };
          ConnectionManagementFailure?: { request_id: string; error?: string };
        };

        if (typedResponse.ConnectionManagementSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: typedResponse.ConnectionManagementSuccess.message
          });
        } else if (typedResponse.ConnectionManagementFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(typedResponse.ConnectionManagementFailure.error || 'Failed to set orphan mode'));
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

  setOrphanModeNonBlocking(enabled: boolean): void {
    this.setOrphanMode(enabled).catch(err => {
      console.warn('[SessionManagement] setOrphanMode failed (non-blocking):', err.message);
    });
  }

  async claimSession(sessionCid: string | bigint, onlyIfOrphaned: boolean = false): Promise<SessionManagementResult> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const sessionCidBigInt = typeof sessionCid === 'string' ? BigInt(sessionCid) : sessionCid;

    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          ClaimSession: {
            session_cid: sessionCidBigInt,
            only_if_orphaned: onlyIfOrphaned
          }
        }
      }
    };

    debugLog('websocket', 'Sending ClaimSession request with CID: ' + sessionCidBigInt.toString());

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('ClaimSession request timed out'));
      }, 10000);

      const handler = (message: unknown) => {
        const msg = message as { Response?: Record<string, unknown> } & Record<string, unknown>;
        const response = msg.Response || msg;

        const typedResponse = response as {
          ConnectionManagementSuccess?: { request_id: string; message?: string; cid?: bigint };
          ConnectionManagementFailure?: { request_id: string; error?: string };
        };

        if (typedResponse.ConnectionManagementSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: typedResponse.ConnectionManagementSuccess.message,
            cid: typedResponse.ConnectionManagementSuccess.cid
          });
        } else if (typedResponse.ConnectionManagementFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(typedResponse.ConnectionManagementFailure.error || 'Failed to claim session'));
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

  async disconnectOrphan(sessionCid?: string | bigint | null): Promise<SessionManagementResult> {
    await this.config.init();

    const requestId = crypto.randomUUID();
    const request = {
      ConnectionManagement: {
        request_id: requestId,
        management_command: {
          DisconnectOrphan: {
            session_cid: sessionCid ? BigInt(sessionCid) : null
          }
        }
      }
    };

    debugLog('websocket', 'Sending DisconnectOrphan request', request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handler);
        reject(new Error('DisconnectOrphan request timed out'));
      }, 10000);

      const handler = (message: unknown) => {
        const msg = message as { Response?: Record<string, unknown> } & Record<string, unknown>;
        const response = msg.Response || msg;

        const typedResponse = response as {
          ConnectionManagementSuccess?: { request_id: string; message?: string };
          ConnectionManagementFailure?: { request_id: string; error?: string };
        };

        if (typedResponse.ConnectionManagementSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          resolve({
            success: true,
            message: typedResponse.ConnectionManagementSuccess.message
          });
        } else if (typedResponse.ConnectionManagementFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handler);
          reject(new Error(typedResponse.ConnectionManagementFailure.error || 'Failed to disconnect orphan'));
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

  releaseSession(sessionCid: bigint): void {
    const client = this.config.getClient();
    if (!client) {
      debugLog('websocket', 'Cannot release session - not the leader (no client)');
      return;
    }

    const request = {
      ConnectionManagement: {
        request_id: crypto.randomUUID(),
        management_command: {
          ReleaseSession: {
            session_cid: sessionCid
          }
        }
      }
    };

    debugLog('websocket', `Releasing session ${sessionCid.toString()}`);

    // Fire-and-forget - don't await since tab may be closing
    client.sendDirectToInternalService(request).catch(error => {
      console.error('[SessionManagement] Failed to release session:', error);
    });
  }
}
