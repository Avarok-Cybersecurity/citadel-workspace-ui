/**
 * File Transfer - Server Download
 *
 * Pulling a file a peer previously staged on the server ("async" mode).
 *
 * The request shape here is the protocol's, not an approximation of it. The
 * previous implementation sent `{ virtual_path, transfer_id }`, but
 * `InternalServiceRequest::DownloadFile` takes `request_id`, `virtual_directory`,
 * `cid`, `peer_cid`, `security_level` and `delete_on_pull` — so every field name
 * was wrong and four were missing. It then swallowed any send failure, and the
 * caller marked the transfer `complete` with `progress = 100` the moment the
 * intent was dispatched. The net effect was that async downloads never worked
 * and always reported success.
 */

import { eventEmitter } from '../event-emitter';
import { failOnSocketLoss } from '../websocket/request-response';
import { websocketService } from '../websocket-service';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';
import type { FileTransfer } from './types';
import { FILE_TRANSFER_EVENTS } from './events';

/**
 * Security level requested for the pull. `Standard` matches the level the RE-VFS
 * download path uses (`revfs-io-network.ts`), so both routes negotiate identically;
 * a mismatch here would be a silent per-feature difference in transport hardening.
 */
const DOWNLOAD_SECURITY_LEVEL = 'Standard';

/**
 * Whether the server discards its staged copy once pulled.
 *
 * `false` preserves the existing contract: a staged transfer stays retrievable
 * until it hits its own `expiresAt`, so a failed write on the recipient's side is
 * recoverable by retrying. Flipping this to a one-shot pull would silently turn a
 * retryable download into an unrecoverable one, so it is stated explicitly rather
 * than left to a default.
 */
const DELETE_ON_PULL: boolean = false;

/**
 * Pull a staged file for `transfer`, resolving with the local download path.
 *
 * Rejects if the service reports failure or nothing arrives before the timeout,
 * so the caller can mark the transfer errored instead of falsely completing it.
 */
export function downloadFileFromServer(transfer: FileTransfer): Promise<string | undefined> {
  const virtualDirectory: string | undefined = transfer.virtualPath;
  if (!virtualDirectory) {
    return Promise.reject(
      new Error(`Transfer ${transfer.id} has no staged path on the server to download from.`)
    );
  }

  // We are the recipient pulling from the sender: our own CID is `cid`, theirs is `peer_cid`.
  const cid: bigint = BigInt(transfer.recipientCid);
  const peerCid: bigint = BigInt(transfer.senderCid);
  const requestId = crypto.randomUUID();

  const request = {
    DownloadFile: {
      request_id: requestId,
      virtual_directory: virtualDirectory,
      cid,
      peer_cid: peerCid,
      security_level: DOWNLOAD_SECURITY_LEVEL,
      delete_on_pull: DELETE_ON_PULL,
    },
  };

  debugLog('FileTransferIO', 'Downloading staged file from server', {
    transferId: transfer.id,
    virtualDirectory,
    requestId,
  });

  return failOnSocketLoss('ServerDownload', new Promise<string | undefined>((resolve, reject) => {
    const timeout = setTimeout((): void => {
      eventEmitter.off('websocket-message', handleMessage);
      reject(new Error(`Download of "${transfer.fileName}" timed out.`));
    }, TIMEOUT.FILE_SEND_MS);

    const settle = (fn: () => void): void => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      fn();
    };

    const handleMessage = (message: unknown): void => {
      const msg: Record<string, unknown> = message as Record<string, unknown>;

      // The transfer itself completing (or failing) arrives as a status notification,
      // matched on our own CID — the same correlation the RE-VFS path uses.
      const status = msg.FileTransferStatusNotification as
        | { cid?: bigint; success?: boolean; response?: { download_path?: string } }
        | undefined;
      if (status && status.cid === cid) {
        settle(() => {
          if (status.success) {
            resolve(status.response?.download_path);
          } else {
            reject(new Error(`Transfer of "${transfer.fileName}" failed on the server.`));
          }
        });
        return;
      }

      // The request being rejected outright is correlated by request_id.
      const failure = msg.DownloadFileFailure as
        | { request_id?: string; message?: string }
        | undefined;
      if (failure?.request_id === requestId) {
        settle(() => reject(new Error(failure.message || 'DownloadFile was rejected.')));
      }
    };

    eventEmitter.on('websocket-message', handleMessage);

    websocketService.sendMessage(request as unknown as Record<string, unknown>).catch(error => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  }));
}

/** Minimal surface `completeStagedDownload` needs from the transfer service. */
export interface StagedDownloadDeps {
  io: { executeIntent: (intent: { type: 'download-from-server'; transfer: FileTransfer }) => Promise<unknown> };
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
}

/**
 * Pull a staged transfer and move it to its terminal state.
 *
 * Completion is reported only after the download actually resolves; a failure
 * marks the transfer errored and rethrows, so callers cannot mistake "dispatched"
 * for "delivered".
 */
export async function completeStagedDownload(
  deps: StagedDownloadDeps,
  transfer: FileTransfer
): Promise<void> {
  try {
    const downloadPath: string | undefined = (await deps.io.executeIntent({
      type: 'download-from-server',
      transfer,
    })) as string | undefined;

    transfer.downloadPath = downloadPath;
    transfer.state = 'complete';
    transfer.progress = 100;
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);
  } catch (error) {
    transfer.state = 'error';
    transfer.errorMessage = error instanceof Error ? error.message : 'Download failed';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.ERROR, transfer);
    throw error;
  }
}
