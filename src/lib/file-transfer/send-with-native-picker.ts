/**
 * Sending a file the user picked through the NATIVE picker.
 *
 * Distinct enough from `sendFile` to live apart: the browser never holds these
 * bytes. The service reads the file from disk itself and the browser only ever
 * sees a path and a size, so none of the in-memory reasoning that governs
 * `sendFile` — the inline-payload cap, the empty-File refusal, the
 * `InMemoryOnly` brand — applies here.
 */
import { eventEmitter } from '../event-emitter';
import { getMimeType } from './transfer-format';
import { FILE_TRANSFER_EVENTS } from './events';
import type { FileTransfer } from './types';
import { debugLog } from '@/lib/debug-config';
import type { LifecycleDeps } from './transfer-lifecycle';

export async function sendFileWithNativePicker(
  deps: LifecycleDeps,
  recipientCid: string,
  title?: string,
  allowedExtensions?: string[]
): Promise<string> {
  const senderCid: bigint | null = await deps.io.getCurrentCid();
  if (!senderCid) {
    throw new Error('No active session');
  }

  debugLog('transfer-lifecycle', 'Starting native file picker flow');

  const fileInfo: { file_path: string; file_name: string; file_size: bigint; } = (await deps.io.executeIntent({
    type: 'pick-file',
    cid: senderCid,
    title,
    allowedExtensions,
  })) as { file_path: string; file_name: string; file_size: bigint };

  debugLog('transfer-lifecycle', 'File picked', {
    path: fileInfo.file_path,
    name: fileInfo.file_name,
    size: fileInfo.file_size.toString(),
  });

  const transferId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
  const transfer: FileTransfer = {
    id: transferId,
    fileName: fileInfo.file_name,
    fileSize: Number(fileInfo.file_size),
    fileType: getMimeType(fileInfo.file_name),
    mode: 'p2p',
    // 'pending' — nothing is moving yet. The recipient has not accepted, and
    // the protocol tick stream (which is what moves this to 'transferring')
    // only starts once they do. Starting at 'transferring' showed a busy
    // progress bar for an offer the peer had not even seen.
    state: 'pending',
    progress: 0,
    senderCid: senderCid.toString(),
    recipientCid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isIncoming: false,
  };

  deps.state.setTransfer(transfer);
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);

  try {
    await deps.io.executeIntent({
      type: 'send-file-via-protocol',
      cid: senderCid.toString(),
      peerCid: recipientCid,
      filePath: fileInfo.file_path,
      transferId,
      // Carries the record the executor announces to the recipient — the
      // in-band bubble is built from these fields.
      transfer,
    });

    debugLog('transfer-lifecycle', 'SendFile request submitted');
    eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);
    return transferId;
  } catch (error) {
    transfer.state = 'error';
    transfer.errorMessage = error instanceof Error ? error.message : 'SendFile failed';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    throw error;
  }
}
