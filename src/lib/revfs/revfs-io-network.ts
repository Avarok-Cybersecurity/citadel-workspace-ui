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
  fileName: string,
  content: Uint8Array,
  virtualDir: string,
): Promise<RevfsIntentResult> {
  const requestId = crypto.randomUUID();
  const isServerStorage = peerCid === null;
  debugLog('RevfsIO', `backendSendFile: name=${fileName} bytes=${content.byteLength} virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

  // ByteContents.data is a Rust Vec<u8>, which serialises as a number array —
  // the same shape the working file-transfer upload sends.
  const data = Array.from(content);

  const request = {
    SendFile: {
      request_id: requestId,
      // The externally-tagged FileSource enum. This used to be a bare string
      // holding a tree directory path, which the WASM client's strict
      // deserializer rejected — so the request never left the browser and the
      // internal service never logged a thing.
      source: { ByteContents: { file_name: fileName, data } },
      cid,
      peer_cid: peerCid,
      chunk_size: null,
      // RemoteEncryptedVirtualFilesystem, not FileTransfer: this is what creates
      // the virtual_path key that DownloadFile and DeleteVirtualFile address.
      // With 'FileTransfer' the bytes would have gone somewhere unaddressable
      // even once the source was right.
      transfer_type: {
        RemoteEncryptedVirtualFilesystem: {
          virtual_path: virtualDir,
          security_level: 'Standard',
        },
      },
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

    // Where the file lands, learned from ReceptionBeginning and reported when
    // the transfer completes.
    let receivedPath: string | undefined;

    const settle = (result: RevfsIntentResult) => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      resolve(result);
    };

    const handleMessage = (message: unknown) => {
      const msg = message as Record<string, unknown>;

      // A REVFS pull reports progress through FileTransferTickNotification.
      //
      // This used to wait on FileTransferStatusNotification, which the internal
      // service emits from exactly one place — respond_file_transfer.rs, the
      // accept/decline flow for STANDARD transfers. A REVFS pull auto-accepts
      // and streams ticks instead, so the success branch was unreachable and
      // every download timed out at 30s. It also read `status.response
      // ?.download_path`, where `response` is a plain bool on the wire, so even
      // an impossible match would have produced `undefined`.
      //
      // Correlated on request_id, like every sibling in this file. The previous
      // `status.cid === cid` matched ANY transfer notification for the session,
      // so a concurrent standard transfer settled an unrelated pending download.
      const tick = msg.FileTransferTickNotification as {
        request_id?: string;
        status?: Record<string, unknown> | string;
      } | undefined;

      if (tick && tick.request_id === requestId) {
        const status = tick.status;

        // ReceptionBeginning carries the local path the bytes are written to.
        if (status !== null && typeof status === 'object' && 'ReceptionBeginning' in status) {
          const beginning = status.ReceptionBeginning as { path?: string } | [string, unknown];
          receivedPath = Array.isArray(beginning)
            ? String(beginning[0])
            : beginning?.path;
          return;
        }

        // Unit variants serialise as the bare string; a newtype carries a payload.
        const isComplete = status === 'ReceptionComplete' || status === 'TransferComplete';
        const isFailure =
          status === 'Fail' ||
          (status !== null && typeof status === 'object' && 'Fail' in status);

        if (isComplete) {
          debugLog('RevfsIO', 'backendDownloadFile complete:', receivedPath);
          settle({ type: 'backend-download-file', success: true, downloadPath: receivedPath });
          return;
        }
        if (isFailure) {
          debugLog('RevfsIO', 'backendDownloadFile transfer failed');
          settle({ type: 'backend-download-file', success: false });
        }
        return;
      }

      const failure = msg.DownloadFileFailure as { request_id?: string; message?: string } | undefined;
      if (failure?.request_id === requestId) {
        debugLog('RevfsIO', 'backendDownloadFile failed:', failure.message);
        settle({ type: 'backend-download-file', success: false });
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
