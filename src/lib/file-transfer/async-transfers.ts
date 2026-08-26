/**
 * Async Transfer Logic
 *
 * Server-mediated async transfer operations:
 * - Upload file to server, get virtual path
 * - Handle incoming async transfer requests
 * - Handle transfer responses for async mode
 * - Download from server on acceptance
 */

import { eventEmitter } from '../event-emitter';
import { debugLog } from '@/lib/debug-config';
import {
  MessagingLayerType,
  type FileTransferRequestData,
  type FileTransferResponseData,
} from '@/types/messaging-layer';
import { FILE_TRANSFER_EVENTS } from './events';
import type { FileTransferState } from './state';
import type { FileTransferIO } from './io';
import type { FileTransfer } from './types';

/** Dependencies injected from the FileTransferService */
export interface AsyncTransferDeps {
  state: FileTransferState;
  io: FileTransferIO;
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
}

/**
 * Upload file to server, update transfer to 'staged', then send request to peer.
 */
export async function handleAsyncSend(
  deps: AsyncTransferDeps,
  transfer: FileTransfer,
  file: File
): Promise<void> {
  try {
    const virtualPath = (await deps.io.executeIntent({
      type: 'upload-to-server',
      file,
      transferId: transfer.id,
      recipientCid: transfer.recipientCid,
    })) as string;

    transfer.virtualPath = virtualPath;
    transfer.state = 'staged';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);

    await deps.io.executeIntent({ type: 'send-transfer-request', transfer });
  } catch (error) {
    transfer.state = 'error';
    transfer.errorMessage = error instanceof Error ? error.message : 'Upload failed';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    throw error;
  }
}

/**
 * Handle incoming FileTransferRequest - create transfer record, auto-accept if enabled.
 */
export async function handleTransferRequest(
  deps: AsyncTransferDeps,
  data: FileTransferRequestData & { type: MessagingLayerType.FileTransferRequest },
  senderCid: string,
  getAutoAccept: (cid: string) => boolean,
  acceptTransfer: (id: string) => Promise<void>
): Promise<void> {
  const currentCid = await deps.io.getCurrentCid();
  if (!currentCid) return;

  const transfer: FileTransfer = {
    id: data.transfer_id,
    fileName: data.file_name,
    fileSize: data.file_size,
    fileType: data.file_type,
    thumbnail: data.thumbnail,
    mode: data.transfer_mode,
    state: data.transfer_mode === 'async' ? 'staged' : 'pending',
    progress: 0,
    senderCid,
    recipientCid: currentCid.toString(),
    virtualPath: data.virtual_path,
    createdAt: data.timestamp,
    updatedAt: Date.now(),
    expiresAt: data.expiry_timestamp,
    isIncoming: true,
  };

  deps.state.setTransfer(transfer);
  await deps.saveTransfer(transfer);

  if (getAutoAccept(senderCid)) {
    try {
      await acceptTransfer(transfer.id);
      return;
    } catch (error) {
      // Auto-accept now has a reason to refuse: the receiver's size limit.
      // Falling through to the prompt rather than letting this throw, because
      // a throw here would leave the transfer pending with no notification at
      // all — the user would get neither the file nor the offer of it.
      debugLog('AsyncTransfers', 'Auto-accept declined, asking instead:', error);
    }
  }
  eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_RECEIVED, transfer);
}

/**
 * Handle FileTransferResponse - start P2P stream if accepted, mark declined otherwise.
 */
export async function handleTransferResponse(
  deps: AsyncTransferDeps,
  data: FileTransferResponseData & { type: MessagingLayerType.FileTransferResponse },
  _senderCid: string,
  streamFileToRecipient: (transfer: FileTransfer, file: File) => Promise<void>
): Promise<void> {
  const transfer = deps.state.getTransfer(data.transfer_id);
  if (!transfer || transfer.isIncoming) return;

  if (data.accepted) {
    transfer.state = 'transferring';
    if (transfer.mode === 'p2p') {
      const file = deps.state.getPendingFile(transfer.id);
      if (file) {
        await streamFileToRecipient(transfer, file);
      } else {
        transfer.state = 'error';
        transfer.errorMessage = 'File data not found';
      }
    }
  } else {
    transfer.state = 'declined';
    transfer.errorMessage = data.decline_reason;
    deps.state.deletePendingFile(transfer.id);
  }

  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
}
