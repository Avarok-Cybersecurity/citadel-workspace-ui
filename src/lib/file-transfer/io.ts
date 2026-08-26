/**
 * File Transfer I/O Router - Real Protocol Implementation
 *
 * This file provides backward compatibility during the migration to IFileTransferIORouter.
 * It wraps RealProtocolIORouter with the intent-based pattern for existing code.
 *
 * Uses the native SendFile/RespondFileTransfer commands instead of P2P messaging.
 * Requires file paths (from PickFile) rather than browser File objects.
 *
 * @deprecated Use IFileTransferIORouter and RealProtocolIORouter directly.
 */

import { websocketService } from '../websocket-service';
import { RealProtocolIORouter } from './real-protocol-io-router';
import type { FileSource } from './io-router-types';
import type {
  FileTransferIntent,
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
import { debugLog } from '@/lib/debug-config';
import { executeSendTransferRequest } from './send-transfer-request';
import { awaitSendFileAck, uploadFileToServer } from './server-upload';
import { downloadFileFromServer } from './server-download';

/**
 * @deprecated Use RealProtocolIORouter with IFileTransferIORouter interface instead.
 * This class maintains backward compatibility with the intent-based pattern.
 */
export class FileTransferIO extends RealProtocolIORouter {
  // ============================================================================
  // Intent Execution (backward compatibility)
  // ============================================================================

  async executeIntent(intent: FileTransferIntent): Promise<unknown> {
    switch (intent.type) {
      case 'send-transfer-request':
        return executeSendTransferRequest(this, intent);
      case 'send-chunk':
        return this.executeSendChunk(intent);
      case 'send-response':
        return this.executeSendResponse(intent);
      case 'send-cancel':
        return this.executeSendCancel(intent);
      case 'send-complete':
        return this.executeSendComplete(intent);
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
  // Intent Adapters (convert old intent pattern to new interface)
  // ============================================================================

  private async executeSendChunk(intent: SendChunkIntent): Promise<void> {
    await this.sendChunk(
      intent.transferId,
      BigInt(intent.recipientCid),
      intent.chunkIndex,
      intent.totalChunks,
      intent.data
    );
  }

  private async executeSendResponse(intent: SendResponseIntent): Promise<void> {
    // The protocol names a transfer by its numeric object_id; the in-band
    // announcement names it by a UUID. Accept/decline go back over the PROTOCOL,
    // so the UUID has to be translated. Passing it through reached
    // `BigInt(<uuid>)`, which throws SyntaxError synchronously while the request
    // literal is built — before anything is sent — so RespondFileTransfer was
    // never issued for any incoming transfer and the bytes never landed.
    const objectId = this.resolveObjectId(intent.transferId);
    if (objectId === undefined) {
      throw new Error(
        'This transfer has not been announced over the protocol yet. ' +
          'Wait a moment and try again.'
      );
    }
    await this.respondToTransfer({
      protocolId: objectId,
      cid: BigInt(0), // Not used for message-based
      peerCid: BigInt(intent.targetCid),
      accept: intent.accepted,
      downloadLocation: intent.reason, // Using reason as download location in old API
    });
  }

  private async executeSendCancel(intent: SendCancelIntent): Promise<void> {
    await this.cancelTransfer({
      transferId: intent.transferId,
      targetCid: BigInt(intent.targetCid),
      reason: intent.reason,
    });
  }

  private async executeSendComplete(intent: SendCompleteIntent): Promise<void> {
    await this.sendComplete(
      intent.transferId,
      BigInt(intent.targetCid),
      intent.success,
      intent.errorMessage
    );
  }

  // ============================================================================
  // Server Operations (keep original implementation)
  // ============================================================================

  private async uploadToServer(intent: UploadToServerIntent): Promise<string> {
    const { file, transferId, recipientCid } = intent;
    return uploadFileToServer(file, transferId, recipientCid);
  }

  private async downloadFromServer(
    intent: DownloadFromServerIntent
  ): Promise<string | undefined> {
    return downloadFileFromServer(intent.transfer);
  }

  // ============================================================================
  // Native File Picker
  // ============================================================================

  private async pickFile(intent: PickFileIntent): Promise<FilePickerResult> {
    return websocketService.pickFile(intent.cid, intent.title, intent.allowedExtensions);
  }

  // ============================================================================
  // Protocol-Level File Send (for native file picker flow)
  // ============================================================================

  private async sendFileViaProtocol(intent: SendFileViaProtocolIntent): Promise<void> {
    const requestId = crypto.randomUUID();

    // Build FileSource - support both direct path and PickFileRef
    let source: FileSource;
    if (intent.pickFileRequestId) {
      source = { PickFileRef: { pick_file_request_id: intent.pickFileRequestId } };
    } else {
      source = { Path: intent.filePath };
    }

    const request = {
      SendFile: {
        request_id: requestId,
        source,
        cid: intent.cid,
        peer_cid: intent.peerCid,
        chunk_size: null, // Use default
        transfer_type: 'FileTransfer',
      },
    };

    debugLog('FileTransferIO', 'FileTransferIO: Sending SendFile request', {
      requestId,
      source,
      cid: intent.cid,
      peerCid: intent.peerCid,
      transferId: intent.transferId,
    });

    const ack = awaitSendFileAck(requestId);
    await websocketService.sendMessage(request);
    return ack;
  }
}
