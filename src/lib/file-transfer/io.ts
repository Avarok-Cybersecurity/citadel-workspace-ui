/**
 * File Transfer I/O Router
 *
 * Handles all I/O operations for file transfers.
 * Follows SBIO principle - only performs I/O, no business logic.
 */

import { eventEmitter } from '../event-emitter';
import { websocketService } from '../websocket-service';
import { p2pMessengerManager } from '../p2p';
import { getSelectedUser } from '../tab-context';
import {
  createFileTransferRequest,
  createFileTransferResponse,
  createFileTransferCancel,
  createFileTransferChunk,
  createFileTransferComplete,
} from '@/types/messaging-layer';
import type {
  FileTransfer,
  FileTransferIntent,
  SendTransferRequestIntent,
  SendChunkIntent,
  SendResponseIntent,
  SendCancelIntent,
  SendCompleteIntent,
  UploadToServerIntent,
  DownloadFromServerIntent,
  PickFileIntent,
  SendFileViaProtocolIntent,
  FilePickerResult,
} from './types';

export class FileTransferIO {
  // ============================================================================
  // Intent Execution
  // ============================================================================

  async executeIntent(intent: FileTransferIntent): Promise<unknown> {
    switch (intent.type) {
      case 'send-transfer-request':
        return this.sendTransferRequest(intent);
      case 'send-chunk':
        return this.sendChunk(intent);
      case 'send-response':
        return this.sendResponse(intent);
      case 'send-cancel':
        return this.sendCancel(intent);
      case 'send-complete':
        return this.sendComplete(intent);
      case 'upload-to-server':
        return this.uploadToServer(intent);
      case 'download-from-server':
        return this.downloadFromServer(intent);
      case 'pick-file':
        return this.pickFile(intent);
      case 'send-file-via-protocol':
        return this.sendFileViaProtocol(intent);
      default: {
        const exhaustiveCheck: never = intent;
        throw new Error(`Unknown intent type: ${(exhaustiveCheck as FileTransferIntent).type}`);
      }
    }
  }

  // ============================================================================
  // P2P Message Operations
  // ============================================================================

  private async sendTransferRequest(intent: SendTransferRequestIntent): Promise<void> {
    const { transfer } = intent;
    const requestMsg = createFileTransferRequest(
      transfer.fileName,
      transfer.fileSize,
      transfer.fileType,
      transfer.mode,
      {
        transfer_id: transfer.id,
        thumbnail: transfer.thumbnail,
        virtual_path: transfer.virtualPath,
        expiry_timestamp: transfer.expiresAt,
      }
    );

    await p2pMessengerManager.sendRawMessage(BigInt(transfer.recipientCid), requestMsg);
  }

  private async sendChunk(intent: SendChunkIntent): Promise<void> {
    const chunkMsg = createFileTransferChunk(
      intent.transferId,
      intent.chunkIndex,
      intent.totalChunks,
      intent.data
    );
    await p2pMessengerManager.sendRawMessage(BigInt(intent.recipientCid), chunkMsg);
  }

  private async sendResponse(intent: SendResponseIntent): Promise<void> {
    const responseMsg = createFileTransferResponse(
      intent.transferId,
      intent.accepted,
      intent.reason
    );
    await p2pMessengerManager.sendRawMessage(BigInt(intent.targetCid), responseMsg);
  }

  private async sendCancel(intent: SendCancelIntent): Promise<void> {
    const cancelMsg = createFileTransferCancel(intent.transferId, intent.reason);
    await p2pMessengerManager.sendRawMessage(BigInt(intent.targetCid), cancelMsg);
  }

  private async sendComplete(intent: SendCompleteIntent): Promise<void> {
    const completeMsg = createFileTransferComplete(
      intent.transferId,
      intent.success,
      undefined, // download_path
      intent.errorMessage
    );
    await p2pMessengerManager.sendRawMessage(BigInt(intent.targetCid), completeMsg);
  }

  // ============================================================================
  // Server Operations
  // ============================================================================

  private async uploadToServer(intent: UploadToServerIntent): Promise<string> {
    const { file, transferId } = intent;
    // TODO: Implement actual SendFile request via websocketService
    console.log('FileTransferIO: Uploading file to server', {
      transferId,
      fileName: file.name,
      size: file.size,
    });

    // Return mock virtual path
    return `/transfers/${transferId}/${file.name}`;
  }

  private async downloadFromServer(intent: DownloadFromServerIntent): Promise<void> {
    const { transfer } = intent;
    console.log('FileTransferIO: Downloading file from server', {
      transferId: transfer.id,
      virtualPath: transfer.virtualPath,
    });

    // TODO: Implement actual DownloadFile request via websocketService
    // For now, simulate with delay - caller will handle state update
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // ============================================================================
  // Native File Picker
  // ============================================================================

  private async pickFile(intent: PickFileIntent): Promise<FilePickerResult> {
    return websocketService.pickFile(intent.cid, intent.title, intent.allowedExtensions);
  }

  // ============================================================================
  // Protocol-Level File Send
  // ============================================================================

  private async sendFileViaProtocol(intent: SendFileViaProtocolIntent): Promise<void> {
    const requestId = crypto.randomUUID();

    const request = {
      SendFile: {
        request_id: requestId,
        source: intent.filePath,
        cid: intent.cid,
        peer_cid: intent.peerCid,
        chunk_size: null, // Use default
        transfer_type: 'FileTransfer',
      },
    };

    console.log('FileTransferIO: Sending SendFile request', {
      requestId,
      filePath: intent.filePath,
      cid: intent.cid,
      peerCid: intent.peerCid,
      transferId: intent.transferId,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('SendFile request timed out'));
      }, 30000);

      const handleMessage = (message: unknown) => {
        const msg = message as Record<string, unknown>;
        // Check for SendFileRequestSuccess
        const success = msg.SendFileRequestSuccess as { request_id?: string } | undefined;
        if (success?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.log('FileTransferIO: SendFile accepted by protocol');
          resolve();
        }
        // Check for SendFileRequestFailure
        const failure = msg.SendFileRequestFailure as { request_id?: string; message?: string } | undefined;
        if (failure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          const errorMsg = failure.message || 'SendFile failed';
          console.error('FileTransferIO: SendFile failed', errorMsg);
          reject(new Error(errorMsg));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      websocketService.sendMessage(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  // ============================================================================
  // File Reading/Writing Utilities
  // ============================================================================

  /**
   * Read a file chunk as base64
   */
  async fileChunkToBase64(chunk: Blob): Promise<string> {
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

  /**
   * Convert base64 string back to binary
   */
  base64ToBinary(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Generate thumbnail for an image file
   */
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

  /**
   * Create blob from chunks and get object URL
   */
  createBlobFromChunks(
    chunks: { data: string; index: number }[],
    fileType: string
  ): { blob: Blob; downloadUrl: string } {
    // Sort chunks by index
    const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

    // Convert base64 chunks to binary
    const binaryChunks: BlobPart[] = [];
    for (const chunk of sortedChunks) {
      const binary = this.base64ToBinary(chunk.data);
      binaryChunks.push(binary);
    }

    // Create blob
    const blob = new Blob(binaryChunks, { type: fileType });
    const downloadUrl = URL.createObjectURL(blob);

    return { blob, downloadUrl };
  }

  // ============================================================================
  // State Change Notification
  // ============================================================================

  /**
   * Update file transfer state in P2PMessengerManager (for UI refresh)
   */
  notifyStateChange(transfer: FileTransfer): void {
    const peerCid = transfer.isIncoming ? transfer.senderCid : transfer.recipientCid;
    p2pMessengerManager.updateFileTransferState(BigInt(peerCid), transfer.id, {
      transfer_state: transfer.state,
      transfer_progress: transfer.progress,
    });
  }

  // ============================================================================
  // Context Retrieval
  // ============================================================================

  async getCurrentCid(): Promise<bigint | null> {
    const tabSelection = await getSelectedUser();
    if (tabSelection?.selectedCid) {
      return tabSelection.selectedCid;
    }
    return null;
  }
}
