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
import { awaitPullCompletion, type PullOutcome } from '../websocket/pull-completion';
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
const DOWNLOAD_SECURITY_LEVEL: "Standard" = 'Standard';

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
  const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();

  const request: { DownloadFile: { request_id: `${string}-${string}-${string}-${string}-${string}`; virtual_directory: string; cid: bigint; peer_cid: bigint; security_level: string; delete_on_pull: boolean; }; } = {
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

  // Correlation, the terminal tick variants and the local path all come from
  // `awaitPullCompletion`, shared with the RE-VFS pull. This route used to have
  // its own copy, which waited on a notification a pull never emits, correlated
  // on the session cid so a concurrent transfer could settle it, and resolved a
  // `download_path` field that does not exist on the wire. The RE-VFS copy was
  // corrected long ago; this one was not, which is the whole argument for there
  // being one copy.
  const pull: Promise<PullOutcome> = awaitPullCompletion(
    requestId,
    TIMEOUT.FILE_SEND_MS,
    'FileTransferIO',
  );

  return failOnSocketLoss('ServerDownload', (async (): Promise<string | undefined> => {
    await websocketService.sendMessage(request as unknown as Record<string, unknown>);

    const outcome: PullOutcome = await pull;
    if (!outcome.success) {
      // Rejects rather than resolving, so the caller marks the transfer errored.
      // Resolving here is what let a failed download be reported as complete.
      throw new Error(
        `Download of "${transfer.fileName}" failed: ${outcome.message ?? 'no reason given'}.`
      );
    }
    return outcome.downloadPath;
  })());
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
