/**
 * Real Protocol File Transfer I/O Router
 *
 * Implements IFileTransferIORouter using dedicated InternalServiceRequest commands
 * (SendFile, RespondFileTransfer, DownloadFile) instead of P2P messaging.
 *
 * This implementation uses the Citadel SDK's native file transfer protocol,
 * which handles chunking, encryption, and progress tracking automatically.
 */

import { eventEmitter } from '../event-emitter';
import { websocketService } from '../websocket-service';
import { p2pMessengerManager } from '../p2p';
import { getSelectedUser } from '../tab-context';
import { isVariant } from 'citadel-workspace-client-ts';
import type { IFileTransferIORouter } from './io-router';
import type {
  SendFileParams,
  SendFileResult,
  CancelTransferParams,
  RespondTransferParams,
  DownloadFileParams,
  TransferRequestEvent,
  TransferProgressEvent,
  TransferCompleteEvent,
  TransferStatusEvent,
  ChunkData,
  BlobResult,
  FileSource,
} from './io-router-types';
import type { FileTransfer } from './types';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';

// Response/notification types from internal service
interface FileTransferRequestNotification {
  cid: bigint;
  peer_cid: bigint;
  metadata: {
    object_id: bigint;
    name: string;
    file_size: bigint;
    mime_type?: string;
  };
  request_id?: string;
}

interface FileTransferStatusNotification {
  cid: bigint;
  object_id: bigint;
  success: boolean;
  response: boolean; // true if this is a response to our request
  message?: string;
  request_id?: string;
}

interface FileTransferTickNotification {
  cid: bigint;
  peer_cid?: bigint;
  status: ObjectTransferStatus;
  request_id?: string;
}

// ObjectTransferStatus from Citadel SDK
type ObjectTransferStatus =
  | { ReceptionBeginning: { object_id: bigint; total_length: bigint; metadata?: unknown } }
  | { ReceptionTick: { object_id: bigint; received: bigint; total: bigint } }
  | { ReceptionComplete: { object_id: bigint } }
  | { TransferTick: { object_id: bigint; sent: bigint; total: bigint } }
  | { TransferComplete: { object_id: bigint } }
  | { Fail: { object_id: bigint; message: string } };

interface SendFileSuccessResponse {
  cid: bigint;
  request_id?: string;
}

interface SendFileFailureResponse {
  cid: bigint;
  message: string;
  request_id?: string;
}

/**
 * Real protocol I/O router using InternalServiceRequest commands.
 *
 * Uses the Citadel SDK's native file transfer capabilities via:
 * - SendFile: Initiate file transfer (with FileSource enum)
 * - RespondFileTransfer: Accept/decline incoming transfers
 * - DownloadFile: Pull files from virtual storage
 *
 * Notifications:
 * - FileTransferRequestNotification: Incoming transfer request
 * - FileTransferTickNotification: Progress updates
 * - FileTransferStatusNotification: Accept/decline confirmations
 */
export class RealProtocolIORouter implements IFileTransferIORouter {
  private subscriptions = new Map<string, () => void>();
  private disposed = false;

  // Map client transferId to protocol objectId for correlation
  private transferIdToObjectId = new Map<string, string>();
  private objectIdToTransferId = new Map<string, string>();

  // ============================================================================
  // Send Operations
  // ============================================================================

  async sendFile(params: SendFileParams): Promise<SendFileResult> {
    // Real protocol requires file path or PickFileRef, not File object
    let source: FileSource;

    if (typeof params.source === 'string') {
      // Direct path
      source = { Path: params.source };
    } else if (params.pickFileRequestId) {
      // Reference to PickFile result
      source = { PickFileRef: { pick_file_request_id: params.pickFileRequestId } };
    } else {
      throw new Error(
        'RealProtocolIORouter requires file path (string) or pickFileRequestId. ' +
          'For browser File objects, call pickFile first to get a file path.'
      );
    }

    const requestId = crypto.randomUUID();
    const request = {
      SendFile: {
        request_id: requestId,
        source,
        cid: params.cid,
        peer_cid: params.peerCid,
        chunk_size: params.chunkSize ?? null,
        transfer_type: 'FileTransfer',
      },
    };

    debugLog('RealProtocolIoRouter', 'RealProtocolIORouter: Sending SendFile request', {
      requestId,
      source,
      cid: params.cid.toString(),
      peerCid: params.peerCid?.toString(),
      transferId: params.transferId,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('SendFile request timed out'));
      }, TIMEOUT.FILE_SEND_MS);

      const handleMessage = (message: Record<string, unknown>) => {
        const success = message.SendFileRequestSuccess as SendFileSuccessResponse | undefined;
        const failure = message.SendFileRequestFailure as SendFileFailureResponse | undefined;

        if (success?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);

          debugLog('RealProtocolIoRouter', 'RealProtocolIORouter: SendFile accepted');

          // Note: We don't know the object_id yet - it comes in FileTransferRequestNotification
          // For now, use the client transferId as both
          resolve({
            protocolId: params.transferId,
            transferId: params.transferId,
          });
        }

        if (failure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);

          const errorMsg = failure.message || 'SendFile failed';
          debugLog('RealProtocolIORouter', 'SendFile failed', errorMsg);
          reject(new Error(errorMsg));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      websocketService.sendRequest(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  async cancelTransfer(params: CancelTransferParams): Promise<void> {
    // The real protocol doesn't have an explicit cancel command for in-progress transfers.
    // Cancellation happens implicitly when either side disconnects or the handler is dropped.
    // For now, we just log and clean up local state.
    debugLog('RealProtocolIoRouter', 'RealProtocolIORouter: cancelTransfer called', {
      transferId: params.transferId,
      targetCid: params.targetCid.toString(),
      reason: params.reason,
    });

    // Clean up correlation maps
    const objectId = this.transferIdToObjectId.get(params.transferId);
    if (objectId) {
      this.objectIdToTransferId.delete(objectId);
      this.transferIdToObjectId.delete(params.transferId);
    }
  }

  async sendChunk(
    _transferId: string,
    _recipientCid: bigint,
    _chunkIndex: number,
    _totalChunks: number,
    _data: string
  ): Promise<void> {
    // Real protocol handles chunking internally via SDK
    throw new Error(
      'sendChunk not supported by RealProtocolIORouter. ' +
        'Chunking is handled automatically by the Citadel SDK.'
    );
  }

  async sendComplete(
    _transferId: string,
    _targetCid: bigint,
    _success: boolean,
    _errorMessage?: string
  ): Promise<void> {
    // Real protocol handles completion internally via SDK
    throw new Error(
      'sendComplete not supported by RealProtocolIORouter. ' +
        'Completion is signaled automatically by the Citadel SDK.'
    );
  }

  // ============================================================================
  // Receive Operations
  // ============================================================================

  async respondToTransfer(params: RespondTransferParams): Promise<void> {
    const requestId = crypto.randomUUID();
    const request = {
      RespondFileTransfer: {
        request_id: requestId,
        cid: params.cid,
        peer_cid: params.peerCid,
        object_id: BigInt(params.protocolId), // object_id is bigint
        accept: params.accept,
        download_location: params.downloadLocation ?? null,
      },
    };

    debugLog('RealProtocolIoRouter', 'RealProtocolIORouter: Sending RespondFileTransfer', {
      requestId,
      cid: params.cid.toString(),
      peerCid: params.peerCid.toString(),
      objectId: params.protocolId,
      accept: params.accept,
    });

    // RespondFileTransfer doesn't have a dedicated success/failure response
    // The result comes via FileTransferStatusNotification
    await websocketService.sendRequest(request);
  }

  async downloadFile(params: DownloadFileParams): Promise<void> {
    const requestId = crypto.randomUUID();
    const request = {
      DownloadFile: {
        request_id: requestId,
        virtual_directory: params.virtualDirectory,
        cid: params.cid,
        peer_cid: params.peerCid,
        security_level: params.securityLevel ?? null,
        delete_on_pull: params.deleteOnPull ?? false,
      },
    };

    debugLog('RealProtocolIoRouter', 'RealProtocolIORouter: Sending DownloadFile', {
      requestId,
      virtualDirectory: params.virtualDirectory,
      cid: params.cid.toString(),
      peerCid: params.peerCid?.toString(),
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('DownloadFile request timed out'));
      }, TIMEOUT.FILE_DOWNLOAD_MS); // 60s timeout for downloads

      const handleMessage = (message: Record<string, unknown>) => {
        const success = message.DownloadFileSuccess as { request_id?: string } | undefined;
        const failure = message.DownloadFileFailure as
          | { request_id?: string; message?: string }
          | undefined;

        if (success?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          debugLog('RealProtocolIoRouter', 'RealProtocolIORouter: DownloadFile success');
          resolve();
        }

        if (failure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          const errorMsg = failure.message || 'DownloadFile failed';
          debugLog('RealProtocolIORouter', 'DownloadFile failed', errorMsg);
          reject(new Error(errorMsg));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      websocketService.sendRequest(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  onTransferRequest(callback: (event: TransferRequestEvent) => void): () => void {
    const handler = (message: Record<string, unknown>) => {
      const notification = message.FileTransferRequestNotification as
        | FileTransferRequestNotification
        | undefined;

      if (notification) {
        const objectId = notification.metadata.object_id.toString();

        callback({
          cid: notification.cid,
          peerCid: notification.peer_cid,
          protocolId: objectId,
          fileName: notification.metadata.name,
          fileSize: Number(notification.metadata.file_size),
          fileType: notification.metadata.mime_type,
          // Real protocol doesn't have these fields
          transferMode: undefined,
          thumbnail: undefined,
          expiresAt: undefined,
          virtualPath: undefined,
        });
      }
    };

    eventEmitter.on('websocket-message', handler);
    const unsubscribe = () => eventEmitter.off('websocket-message', handler);
    this.subscriptions.set(`request-${Date.now()}`, unsubscribe);
    return unsubscribe;
  }

  onProgress(callback: (event: TransferProgressEvent) => void): () => void {
    const handler = (message: Record<string, unknown>) => {
      const notification = message.FileTransferTickNotification as
        | FileTransferTickNotification
        | undefined;

      if (notification) {
        const progressEvent = this.parseTickStatus(notification.status);
        if (progressEvent) {
          // Try to get client transferId from objectId
          const transferId =
            this.objectIdToTransferId.get(progressEvent.protocolId) || progressEvent.protocolId;

          callback({
            transferId,
            protocolId: progressEvent.protocolId,
            bytesTransferred: progressEvent.bytesTransferred,
            totalBytes: progressEvent.totalBytes,
            percentage: progressEvent.percentage,
            status: progressEvent.status,
          });
        }
      }
    };

    eventEmitter.on('websocket-message', handler);
    const unsubscribe = () => eventEmitter.off('websocket-message', handler);
    this.subscriptions.set(`progress-${Date.now()}`, unsubscribe);
    return unsubscribe;
  }

  onComplete(callback: (event: TransferCompleteEvent) => void): () => void {
    const handler = (message: Record<string, unknown>) => {
      const notification = message.FileTransferTickNotification as
        | FileTransferTickNotification
        | undefined;

      if (notification) {
        const status = notification.status;
        let objectId: string | undefined;
        let success = false;
        let errorMessage: string | undefined;

        // Check for completion statuses
        if (isVariant(status, 'TransferComplete')) {
          objectId = status.TransferComplete.object_id.toString();
          success = true;
        } else if (isVariant(status, 'ReceptionComplete')) {
          objectId = status.ReceptionComplete.object_id.toString();
          success = true;
        } else if (isVariant(status, 'Fail')) {
          objectId = status.Fail.object_id.toString();
          success = false;
          errorMessage = status.Fail.message;
        }

        if (objectId !== undefined) {
          const transferId = this.objectIdToTransferId.get(objectId) || objectId;

          callback({
            transferId,
            protocolId: objectId,
            success,
            errorMessage,
          });
        }
      }
    };

    eventEmitter.on('websocket-message', handler);
    const unsubscribe = () => eventEmitter.off('websocket-message', handler);
    this.subscriptions.set(`complete-${Date.now()}`, unsubscribe);
    return unsubscribe;
  }

  onStatusChange(callback: (event: TransferStatusEvent) => void): () => void {
    const handler = (message: Record<string, unknown>) => {
      const notification = message.FileTransferStatusNotification as
        | FileTransferStatusNotification
        | undefined;

      if (notification) {
        const objectId = notification.object_id.toString();
        const transferId = this.objectIdToTransferId.get(objectId) || objectId;

        callback({
          protocolId: objectId,
          cid: notification.cid,
          success: notification.success,
          accepted: notification.response && notification.success,
          message: notification.message,
        });
      }
    };

    eventEmitter.on('websocket-message', handler);
    const unsubscribe = () => eventEmitter.off('websocket-message', handler);
    this.subscriptions.set(`status-${Date.now()}`, unsubscribe);
    return unsubscribe;
  }

  // ============================================================================
  // File Utilities
  // ============================================================================

  async fileChunkToBase64(chunk: Blob): Promise<string> {
    // Real protocol doesn't use base64 chunks, but provide implementation for interface
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read chunk'));
      reader.readAsDataURL(chunk);
    });
  }

  base64ToBinary(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  createBlobFromChunks(chunks: ChunkData[], fileType: string): BlobResult {
    // Sort chunks by index
    const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

    // Convert base64 chunks to binary
    const binaryChunks: Uint8Array[] = [];
    for (const chunk of sortedChunks) {
      const binary = this.base64ToBinary(chunk.data);
      binaryChunks.push(binary);
    }

    // Create blob - Uint8Array[] is compatible with BlobPart[] at runtime
    const blob = new Blob(binaryChunks as BlobPart[], { type: fileType });
    const downloadUrl = URL.createObjectURL(blob);

    return { blob, downloadUrl };
  }

  async generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 100;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          } else {
            reject(new Error('Could not get canvas context'));
          }
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  // ============================================================================
  // Context
  // ============================================================================

  async getCurrentCid(): Promise<bigint | null> {
    const tabSelection = await getSelectedUser();
    if (tabSelection?.selectedCid) {
      return tabSelection.selectedCid;
    }
    return null;
  }

  notifyStateChange(transfer: FileTransfer): void {
    const peerCid = transfer.isIncoming ? transfer.senderCid : transfer.recipientCid;
    p2pMessengerManager.updateFileTransferState(BigInt(peerCid), transfer.id, {
      transfer_state: transfer.state,
      transfer_progress: transfer.progress,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Register a mapping between client transferId and protocol objectId.
   * Call this when receiving a FileTransferRequestNotification.
   */
  registerTransferMapping(transferId: string, objectId: string): void {
    this.transferIdToObjectId.set(transferId, objectId);
    this.objectIdToTransferId.set(objectId, transferId);
  }

  private parseTickStatus(
    status: ObjectTransferStatus
  ): {
    protocolId: string;
    bytesTransferred: number;
    totalBytes: number;
    percentage: number;
    status: 'uploading' | 'downloading' | 'complete' | 'failed';
  } | null {
    if (isVariant(status, 'TransferTick')) {
      const tick = status.TransferTick;
      const sent = Number(tick.sent);
      const total = Number(tick.total);
      return {
        protocolId: tick.object_id.toString(),
        bytesTransferred: sent,
        totalBytes: total,
        percentage: total > 0 ? Math.round((sent / total) * 100) : 0,
        status: 'uploading',
      };
    }

    if (isVariant(status, 'ReceptionTick')) {
      const tick = status.ReceptionTick;
      const received = Number(tick.received);
      const total = Number(tick.total);
      return {
        protocolId: tick.object_id.toString(),
        bytesTransferred: received,
        totalBytes: total,
        percentage: total > 0 ? Math.round((received / total) * 100) : 0,
        status: 'downloading',
      };
    }

    if (isVariant(status, 'ReceptionBeginning')) {
      const tick = status.ReceptionBeginning;
      return {
        protocolId: tick.object_id.toString(),
        bytesTransferred: 0,
        totalBytes: Number(tick.total_length),
        percentage: 0,
        status: 'downloading',
      };
    }

    // TransferComplete, ReceptionComplete, and Fail are handled in onComplete
    return null;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Unsubscribe from all events
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();

    // Clear correlation maps
    this.transferIdToObjectId.clear();
    this.objectIdToTransferId.clear();
  }
}
