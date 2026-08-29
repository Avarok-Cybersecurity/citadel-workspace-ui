/**
 * Pulling a file back out of the encrypted virtual filesystem.
 *
 * Separate from the send/delete pair because a REVFS pull's completion signal
 * is a different event stream — ticks, not a status notification — and the
 * reasoning about which variants are terminal belongs beside the code that
 * reads them.
 */

import type { RevfsIntentResult } from '@/types/revfs-intents';
import { eventEmitter } from '../event-emitter';
import { BACKEND_TIMEOUT_MS, type NetworkIODeps } from './revfs-io-network';
import { debugLog } from '@/lib/debug-config';

export async function backendDownloadFile(
  deps: NetworkIODeps,
  cid: bigint,
  peerCid: bigint | null,
  virtualDir: string,
): Promise<RevfsIntentResult> {
  const requestId: string = crypto.randomUUID();
  const isServerStorage: boolean = peerCid === null;
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
    const timeout = setTimeout((): void => {
      eventEmitter.off('websocket-message', handleMessage);
      debugLog('RevfsIO', 'backendDownloadFile timed out');
      resolve({ type: 'backend-download-file', success: false });
    }, BACKEND_TIMEOUT_MS);

    // Where the file lands, learned from ReceptionBeginning and reported when
    // the transfer completes.
    let receivedPath: string | undefined;

    const settle = (result: RevfsIntentResult): void => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      resolve(result);
    };

    const handleMessage = (message: unknown): void => {
      const msg: Record<string, unknown> = message as Record<string, unknown>;

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
        const status: string | Record<string, unknown> | undefined = tick.status;

        // ReceptionBeginning carries the local path the bytes are written to.
        if (status !== null && typeof status === 'object' && 'ReceptionBeginning' in status) {
          const beginning = status.ReceptionBeginning as { path?: string } | [string, unknown];
          receivedPath = Array.isArray(beginning)
            ? String(beginning[0])
            : beginning?.path;
          return;
        }

        // Unit variants serialise as the bare string; a newtype carries a payload.
        const isComplete: boolean = status === 'ReceptionComplete' || status === 'TransferComplete';
        const isFailure: boolean =
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

    deps.sendInternalServiceRequest(request).catch((error: unknown) => {
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