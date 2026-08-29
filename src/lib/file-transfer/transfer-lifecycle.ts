/** Transfer Lifecycle - state machine transitions and core operations. */

import { eventEmitter } from '../event-emitter';
import { scopedSettingsKey } from './settings-key';
import { getMimeType, formatBytes } from './transfer-format';
import { type FileTransferMode, FILE_TRANSFER_REQUEST_TTL_MS } from '@/types/messaging-layer';
import { FILE_TRANSFER_EVENTS } from './events';
import { completeStagedDownload } from './server-download';
import type { FileTransferState } from './state';
import type { FileTransferIO } from './io';
import type { FileTransfer, FileTransferSettings } from './types';
import { wrapInMemory } from './types';
import { debugLog } from '@/lib/debug-config';

export interface LifecycleDeps {
  state: FileTransferState;
  io: FileTransferIO;
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
  saveSettings: (peerCid: string, settings: FileTransferSettings) => Promise<void>;
  handleAsyncSend: (transfer: FileTransfer, file: File) => Promise<void>;
}

export async function sendFile(
  deps: LifecycleDeps,
  recipientCid: string,
  file: File,
  mode: FileTransferMode
): Promise<string> {
  const senderCid: bigint | null = await deps.io.getCurrentCid();
  if (!senderCid) {
    throw new Error('No active session');
  }

  const settings: FileTransferSettings = deps.state.getSettings(scopedSettingsKey(recipientCid));
  if (file.size > settings.maxFileSize) {
    throw new Error(
      `File size ${formatBytes(file.size)} exceeds max ${formatBytes(settings.maxFileSize)}`
    );
  }

  let thumbnail: string | undefined;
  if (file.type.startsWith('image/')) {
    thumbnail = await deps.io.generateThumbnail(file);
  }

  const transferId = crypto.randomUUID();
  const expiresAt: number = Date.now() + FILE_TRANSFER_REQUEST_TTL_MS;

  const transfer: FileTransfer = {
    id: transferId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    thumbnail,
    mode,
    state: mode === 'async' ? 'uploading' : 'pending',
    progress: 0,
    senderCid: senderCid.toString(),
    recipientCid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt,
    isIncoming: false,
  };

  deps.state.setTransfer(transfer);
  await deps.saveTransfer(transfer);

  if (mode === 'async') {
    await deps.handleAsyncSend(transfer, file);
  } else {
    // `wrapInMemory` brands the File for the intent's `file?: InMemoryOnly<File>`
    // contract — see `types.ts` for why a raw `File` would be a TS error here.
    // The bytes leave inside this call (SendFile ByteContents); there is no
    // stashed copy to stream later — the chunk-streaming plane that once
    // consumed one is gone.
    await deps.io.executeIntent({ type: 'send-transfer-request', transfer, file: wrapInMemory(file) });
  }

  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);

  return transferId;
}

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

  const fileInfo = (await deps.io.executeIntent({
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

  const transferId = crypto.randomUUID();
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

export async function cancelTransfer(deps: LifecycleDeps, transferId: string): Promise<void> {
  const transfer: FileTransfer | undefined = deps.state.getTransfer(transferId);
  if (!transfer) {
    throw new Error('Transfer not found');
  }

  if (transfer.state === 'complete' || transfer.state === 'cancelled') return;

  await deps.io.executeIntent({
    type: 'send-cancel',
    transferId,
    targetCid: transfer.recipientCid,
    reason: 'Sender cancelled transfer',
  });

  transfer.state = 'cancelled';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
}

export async function acceptTransfer(deps: LifecycleDeps, transferId: string): Promise<void> {
  const transfer: FileTransfer | undefined = deps.state.getTransfer(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (!transfer.isIncoming) throw new Error('Cannot accept outgoing transfer');
  if (transfer.state !== 'pending' && transfer.state !== 'staged') {
    throw new Error(`Cannot accept transfer in state: ${transfer.state}`);
  }

  // Labelled "Max file size to accept" but read only on the SEND path above,
  // so lowering the slider never limited what arrived. Size is on the offer.
  const settings: FileTransferSettings = deps.state.getSettings(scopedSettingsKey(transfer.senderCid));
  if (transfer.fileSize > settings.maxFileSize) {
    throw new Error(
      `File size ${formatBytes(transfer.fileSize)} exceeds your limit of ` +
        `${formatBytes(settings.maxFileSize)}. Raise it in Chat Settings to accept this file.`
    );
  }

  await deps.io.executeIntent({
    type: 'send-response',
    transferId,
    targetCid: transfer.senderCid,
    accepted: true,
  });

  transfer.state = 'transferring';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);

  if (transfer.mode === 'async' && transfer.virtualPath) {
    await completeStagedDownload(deps, transfer);
  }
}

export async function declineTransfer(
  deps: LifecycleDeps,
  transferId: string,
  reason?: string
): Promise<void> {
  const transfer: FileTransfer | undefined = deps.state.getTransfer(transferId);
  if (!transfer) {
    throw new Error('Transfer not found');
  }

  if (!transfer.isIncoming) {
    throw new Error('Cannot decline outgoing transfer');
  }

  await deps.io.executeIntent({
    type: 'send-response',
    transferId,
    targetCid: transfer.senderCid,
    accepted: false,
    reason,
  });

  transfer.state = 'declined';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
}

// Re-exported so existing importers keep working; see transfer-format.
export { getMimeType, formatBytes };
