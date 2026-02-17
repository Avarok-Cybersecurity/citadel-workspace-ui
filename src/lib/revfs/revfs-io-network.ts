/**
 * RE-VFS Network I/O
 *
 * Backend file operations wired to WASM client / Citadel protocol.
 * Handles SendFile, DownloadFile, DeleteVirtualFile via event emitter.
 */

import type { RevfsIntentResult } from '@/types/revfs-intents';
import { eventEmitter } from '../event-emitter';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';

/** Timeout for backend file operations (30 seconds) */
const BACKEND_TIMEOUT_MS = TIMEOUT.FILE_SEND_MS;

export interface NetworkIODeps {
  sendInternalServiceRequest: (request: unknown) => Promise<void>;
}

/**
 * Send a file via the Citadel protocol.
 * - If peerCid is bigint: file is stored in peer's virtual file system (P2P)
 * - If peerCid is null: file is stored on server (server storage)
 */
export async function backendSendFile(
  deps: NetworkIODeps,
  cid: bigint,
  peerCid: bigint | null,
  source: string,
  virtualDir: string,
): Promise<RevfsIntentResult> {
  const requestId = crypto.randomUUID();
  const isServerStorage = peerCid === null;
  debugLog('RevfsIO', `backendSendFile: source=${source} virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

  const request = {
    SendFile: {
      request_id: requestId,
      source,
      cid,
      peer_cid: peerCid,
      chunk_size: null,
      transfer_type: 'FileTransfer',
    },
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendSendFile timed out');
      resolve({ type: 'backend-send-file', success: false });
    }, BACKEND_TIMEOUT_MS);

    const handleMessage = (message: unknown) => {
      const msg = message as Record<string, unknown>;

      const success = msg.SendFileRequestSuccess as { request_id?: string } | undefined;
      if (success?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('RevfsIO', 'backendSendFile success');
        resolve({ type: 'backend-send-file', success: true, virtualDir });
      }

      const failure = msg.SendFileRequestFailure as { request_id?: string; message?: string } | undefined;
      if (failure?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('RevfsIO', 'backendSendFile failed:', failure.message);
        resolve({ type: 'backend-send-file', success: false });
      }
    };

    eventEmitter.on('websocket-message', handleMessage);

    deps.sendInternalServiceRequest(request).catch(error => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendSendFile request error:', error);
      resolve({ type: 'backend-send-file', success: false });
    });
  });
}

/**
 * Download a file via the Citadel protocol.
 * Returns the local download path on success.
 */
export async function backendDownloadFile(
  deps: NetworkIODeps,
  cid: bigint,
  peerCid: bigint | null,
  virtualDir: string,
): Promise<RevfsIntentResult> {
  const requestId = crypto.randomUUID();
  const isServerStorage = peerCid === null;
  debugLog('RevfsIO', `backendDownloadFile: virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

  const request = {
    DownloadFile: {
      request_id: requestId,
      virtual_directory: virtualDir,
      cid,
      peer_cid: peerCid,
      security_level: 'Standard',
      delete_on_pull: false,
    },
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendDownloadFile timed out');
      resolve({ type: 'backend-download-file', success: false });
    }, BACKEND_TIMEOUT_MS);

    const handleMessage = (message: unknown) => {
      const msg = message as Record<string, unknown>;

      const status = msg.FileTransferStatusNotification as {
        cid?: bigint;
        peer_cid?: bigint;
        success?: boolean;
        response?: { download_path?: string };
      } | undefined;

      if (status && status.cid === cid) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        if (status.success) {
          const downloadPath = status.response?.download_path;
          debugLog('RevfsIO', 'backendDownloadFile success:', downloadPath);
          resolve({ type: 'backend-download-file', success: true, downloadPath });
        } else {
          debugLog('RevfsIO', 'backendDownloadFile transfer failed');
          resolve({ type: 'backend-download-file', success: false });
        }
      }

      const failure = msg.DownloadFileFailure as { request_id?: string; message?: string } | undefined;
      if (failure?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('RevfsIO', 'backendDownloadFile failed:', failure.message);
        resolve({ type: 'backend-download-file', success: false });
      }
    };

    eventEmitter.on('websocket-message', handleMessage);

    deps.sendInternalServiceRequest(request).catch(error => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendDownloadFile request error:', error);
      resolve({ type: 'backend-download-file', success: false });
    });
  });
}

/**
 * Delete a file via the Citadel protocol.
 */
export async function backendDeleteFile(
  deps: NetworkIODeps,
  cid: bigint,
  peerCid: bigint | null,
  virtualDir: string,
): Promise<RevfsIntentResult> {
  const requestId = crypto.randomUUID();
  const isServerStorage = peerCid === null;
  debugLog('RevfsIO', `backendDeleteFile: virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

  const request = {
    DeleteVirtualFile: {
      request_id: requestId,
      virtual_directory: virtualDir,
      cid,
      peer_cid: peerCid,
    },
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendDeleteFile timed out');
      resolve({ type: 'backend-delete-file', success: false });
    }, BACKEND_TIMEOUT_MS);

    const handleMessage = (message: unknown) => {
      const msg = message as Record<string, unknown>;

      const success = msg.DeleteVirtualFileSuccess as { request_id?: string } | undefined;
      if (success?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('RevfsIO', 'backendDeleteFile success');
        resolve({ type: 'backend-delete-file', success: true });
      }

      const failure = msg.DeleteVirtualFileFailure as { request_id?: string; message?: string } | undefined;
      if (failure?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('RevfsIO', 'backendDeleteFile failed:', failure.message);
        resolve({ type: 'backend-delete-file', success: false });
      }
    };

    eventEmitter.on('websocket-message', handleMessage);

    deps.sendInternalServiceRequest(request).catch(error => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendDeleteFile request error:', error);
      resolve({ type: 'backend-delete-file', success: false });
    });
  });
}
