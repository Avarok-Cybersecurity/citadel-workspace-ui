/** Transfer Lifecycle - state machine transitions and core operations. */

import { eventEmitter } from '../event-emitter';
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
  const senderCid = await deps.io.getCurrentCid();
  if (!senderCid) {
    throw new Error('No active session');
  }

  const settings = deps.state.getSettings(recipientCid);
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
  const expiresAt = Date.now() + FILE_TRANSFER_REQUEST_TTL_MS;

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
    deps.state.setPendingFile(transferId, file);
    // `wrapInMemory` brands the File for the intent's `file?: InMemoryOnly<File>`
    // contract — see `types.ts` for why a raw `File` would be a TS error here.
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
  const senderCid = await deps.io.getCurrentCid();
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
    state: 'transferring',
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
  const transfer = deps.state.getTransfer(transferId);
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
  const transfer = deps.state.getTransfer(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (!transfer.isIncoming) throw new Error('Cannot accept outgoing transfer');
  if (transfer.state !== 'pending' && transfer.state !== 'staged') {
    throw new Error(`Cannot accept transfer in state: ${transfer.state}`);
  }

  // The setting is labelled "Max file size to accept" and, until now, was read
  // at exactly one site: the SEND path above. So a user who lowered the slider
  // to protect themselves carried on receiving files of any size — and with
  // auto-accept on, without being asked. A receiver had no way to limit what
  // arrived. The size is already on the transfer we were offered.
  const settings = deps.state.getSettings(transfer.senderCid);
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
  const transfer = deps.state.getTransfer(transferId);
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

export function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf', txt: 'text/plain',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
    json: 'application/json', html: 'text/html', css: 'text/css', js: 'application/javascript',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
