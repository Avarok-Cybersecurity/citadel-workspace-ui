/** P2P Transfer Logic - streaming, chunking, reassembly, progress/complete/cancel handlers. */

import { eventEmitter } from '../event-emitter';
import {
  type MessagingLayerType, type FileTransferProgressData,
  type FileTransferCancelData, type FileTransferChunkData, FILE_TRANSFER_CHUNK_SIZE_BYTES,
} from '@/types/messaging-layer';
import { FILE_TRANSFER_EVENTS } from './events';
import type { FileTransferState } from './state';
import type { FileTransferIO } from './io';
import type { FileTransfer, TransferProgressEvent } from './types';
import { debugLog } from '@/lib/debug-config';
import { yieldToEventLoop } from '@/lib/utils/scheduling';

export interface P2PTransferDeps {
  state: FileTransferState;
  io: FileTransferIO;
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
}

export async function streamFileToRecipient(
  deps: P2PTransferDeps,
  transfer: FileTransfer,
  file: File
): Promise<void> {
  const chunkSize = FILE_TRANSFER_CHUNK_SIZE_BYTES;
  const totalChunks = Math.ceil(file.size / chunkSize);

  debugLog(
    'p2p-transfers',
    `Starting P2P stream of ${file.name} (${file.size} bytes) in ${totalChunks} chunks`
  );

  try {
    for (let i = 0; i < totalChunks; i++) {
      const currentTransfer = deps.state.getTransfer(transfer.id);
      if (!currentTransfer || currentTransfer.state === 'cancelled') {
        debugLog('p2p-transfers', 'Transfer cancelled, stopping stream');
        break;
      }

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const base64Data = await deps.io.fileChunkToBase64(chunk);

      await deps.io.executeIntent({
        type: 'send-chunk',
        transferId: transfer.id,
        recipientCid: transfer.recipientCid,
        chunkIndex: i,
        totalChunks,
        data: base64Data,
      });

      const percentage = Math.round(((i + 1) / totalChunks) * 100);
      transfer.progress = percentage;
      transfer.updatedAt = Date.now();
      deps.emitStateChange(transfer);

      if (i < totalChunks - 1) {
        // Yield so the progress bar above can paint. The send itself is already
        // fully awaited down to the WebSocket write, so it needs no pacing of its
        // own; this was a flat 10ms per chunk, which on a 5 MB file at 64 KB
        // chunks added roughly 0.8s of pure sleep to every transfer.
        await yieldToEventLoop();
      }
    }

    const finalTransfer = deps.state.getTransfer(transfer.id);
    if (finalTransfer && finalTransfer.state !== 'cancelled') {
      await deps.io.executeIntent({
        type: 'send-complete',
        transferId: transfer.id,
        targetCid: transfer.recipientCid,
        success: true,
      });

      finalTransfer.state = 'complete';
      finalTransfer.progress = 100;
      finalTransfer.updatedAt = Date.now();
      await deps.saveTransfer(finalTransfer);
      deps.emitStateChange(finalTransfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, finalTransfer);
    }
  } catch (error) {
    debugLog('p2p-transfers', 'Error streaming file', error);
    transfer.state = 'error';
    transfer.errorMessage = error instanceof Error ? error.message : 'Streaming failed';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.ERROR, { transfer, error });
  } finally {
    deps.state.deletePendingFile(transfer.id);
  }
}

export async function reassembleFile(
  deps: P2PTransferDeps,
  transfer: FileTransfer,
  totalChunks: number
): Promise<void> {
  const chunks = deps.state.getReceivedChunks(transfer.id);
  if (!chunks) return;

  debugLog('p2p-transfers', `Reassembling file from ${chunks.length} chunks`);

  try {
    if (chunks.length !== totalChunks) {
      throw new Error(`Missing chunks: expected ${totalChunks}, got ${chunks.length}`);
    }

    const { blob, downloadUrl } = deps.io.createBlobFromChunks(chunks, transfer.fileType);

    transfer.downloadPath = downloadUrl;
    transfer.state = 'complete';
    transfer.progress = 100;
    transfer.updatedAt = Date.now();

    deps.state.setReceivedFile(transfer.id, blob);

    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);

    debugLog(
      'p2p-transfers',
      `File reassembled successfully: ${transfer.fileName} (${blob.size} bytes)`
    );
  } catch (error) {
    debugLog('p2p-transfers', 'Error reassembling file', error);
    transfer.state = 'error';
    transfer.errorMessage = error instanceof Error ? error.message : 'Reassembly failed';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.ERROR, { transfer, error });
  } finally {
    deps.state.deleteReceivedChunks(transfer.id);
  }
}

export async function handleTransferProgress(
  deps: P2PTransferDeps,
  data: FileTransferProgressData & { type: MessagingLayerType.FileTransferProgress },
  _senderCid: string
): Promise<void> {
  const transfer = deps.state.getTransfer(data.transfer_id);
  if (!transfer) return;

  transfer.progress = data.percentage;
  transfer.updatedAt = Date.now();

  const event: TransferProgressEvent = {
    transferId: data.transfer_id,
    bytesTransferred: data.bytes_transferred,
    totalBytes: data.total_bytes,
    percentage: data.percentage,
  };
  deps.state.notifyProgressCallbacks(data.transfer_id, event);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.PROGRESS_UPDATED, { transfer, progress: data });
}

export async function handleTransferCancel(
  deps: P2PTransferDeps,
  data: FileTransferCancelData & { type: MessagingLayerType.FileTransferCancel },
  _senderCid: string
): Promise<void> {
  const transfer = deps.state.getTransfer(data.transfer_id);
  if (!transfer) return;

  transfer.state = 'cancelled';
  transfer.errorMessage = data.reason;
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);

  deps.state.cleanupTransfer(transfer.id);

  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
}

export async function handleTransferChunk(
  deps: P2PTransferDeps,
  data: FileTransferChunkData & { type: MessagingLayerType.FileTransferChunk },
  _senderCid: string
): Promise<void> {
  const transfer = deps.state.getTransfer(data.transfer_id);
  if (!transfer || !transfer.isIncoming) return;

  debugLog(
    'p2p-transfers',
    `Received chunk ${data.chunk_index + 1}/${data.total_chunks} for transfer ${data.transfer_id}`
  );

  deps.state.initReceivedChunks(data.transfer_id);
  deps.state.addReceivedChunk(data.transfer_id, { data: data.data, index: data.chunk_index });

  const chunkCount = deps.state.getReceivedChunkCount(data.transfer_id);
  const bytesReceived = chunkCount * FILE_TRANSFER_CHUNK_SIZE_BYTES;
  const percentage = Math.min(100, Math.round((chunkCount / data.total_chunks) * 100));

  transfer.progress = percentage;
  transfer.updatedAt = Date.now();

  const event: TransferProgressEvent = {
    transferId: data.transfer_id,
    bytesTransferred: Math.min(bytesReceived, transfer.fileSize),
    totalBytes: transfer.fileSize,
    percentage,
  };
  deps.state.notifyProgressCallbacks(data.transfer_id, event);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.PROGRESS_UPDATED, {
    transfer,
    progress: { percentage },
  });
  deps.emitStateChange(transfer);

  if (chunkCount === data.total_chunks) {
    await reassembleFile(deps, transfer, data.total_chunks);
  }
}
