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
import { debugLog } from '@/lib/debug-config';
import { P2PCommandType, serializeP2PCommand } from '@/types/p2p-types';
import { buildTransferAnnouncement } from './transfer-announcement';
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
        return this.executeSendTransferRequest(intent);
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

  private async executeSendTransferRequest(intent: SendTransferRequestIntent): Promise<void> {
    const { transfer, file } = intent;

    // Async transfers upload the file to the workspace server first
    // (see `async-transfers.ts#executeUploadAndSend`), then emit this
    // intent to notify the recipient that a staged transfer exists.
    // The recipient discovers the transfer via the message-protocol
    // path and fetches the bytes from the server using
    // `transfer.virtualPath` — there's no actual file body to send
    // through the real protocol router here. Falling through to
    // `sendFile` with a synthesised empty File previously resulted in
    // either a silent empty-payload send or a "RealProtocolIORouter
    // requires … a non-empty browser File object" throw, depending on
    // which code path the router took. Skip the protocol send
    // explicitly so async mode degrades to a clean no-op.
    if (!file && transfer.mode === 'async') {
      // Async mode: the file body was uploaded to the workspace server
      // before this intent was dispatched, and the recipient discovers
      // the staged bytes via `transfer.virtualPath`. If `virtualPath`
      // is missing here, something stripped both the File AND the
      // upload metadata — most likely an accidental JSON-roundtrip of
      // the intent (see `SendTransferRequestIntent` contract).
      // Fail loudly so the recipient never silently hangs on a
      // never-uploaded transfer.
      if (!transfer.virtualPath) {
        throw new Error(
          `executeSendTransferRequest: async transfer ${transfer.id} has no file AND no virtualPath — ` +
          `the intent likely crossed a serialization boundary that stripped both fields. ` +
          `Intents must be dispatched in-memory; see SendTransferRequestIntent docs.`,
        );
      }
      debugLog(
        'FileTransferIO',
        'send-transfer-request without file in async mode — skipping protocol send (recipient discovers via the announcement below)',
        { transferId: transfer.id, virtualPath: transfer.virtualPath },
      );
      // The bytes are already on the server; this is the ONLY thing that tells
      // the recipient the transfer exists.
      await this.announceTransfer(transfer);
      return;
    }

    // Sync / P2P mode: a real File must be present. transfer-lifecycle
    // always passes one. Falling back to an empty placeholder would
    // make the protocol router throw "non-empty browser File object"
    // — fail fast with a clearer message instead of letting the
    // synthesised empty File flow through to the router.
    if (!file) {
      throw new Error(
        `executeSendTransferRequest requires a File for non-async transfers (transferId=${transfer.id}, mode=${transfer.mode})`,
      );
    }

    // Announce before sending the bytes, so the conversation shows the transfer
    // by the time the protocol notification and progress ticks arrive.
    await this.announceTransfer(transfer);

    await this.sendFile({
      source: file,
      cid: BigInt(transfer.senderCid),
      peerCid: BigInt(transfer.recipientCid),
      mode: transfer.mode,
      transferId: transfer.id,
      metadata: {
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        fileType: transfer.fileType,
        thumbnail: transfer.thumbnail,
        expiresAt: transfer.expiresAt,
      },
    });
  }

  /**
   * Send the in-band message that makes a transfer appear in the recipient's
   * conversation. Without it they receive bytes with nothing to show for them.
   */
  private async announceTransfer(transfer: FileTransfer): Promise<void> {
    const payload = buildTransferAnnouncement(transfer);
    const bytes = serializeP2PCommand({
      type: P2PCommandType.MessagingLayerCommand,
      payload,
    });

    debugLog('FileTransferIO', `announceTransfer: ${transfer.fileName} -> ${transfer.recipientCid}`, {
      transferId: transfer.id,
      mode: transfer.mode,
    });

    await websocketService.sendP2PMessageReliable(
      BigInt(transfer.senderCid),
      BigInt(transfer.recipientCid),
      bytes,
    );
  }

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
    await this.respondToTransfer({
      protocolId: intent.transferId,
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
