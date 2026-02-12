/**
 * FileTransferService - Business Logic Coordinator
 *
 * Manages file transfers using SBIO pattern:
 * - Business logic determines what should happen (returns intents)
 * - IO router executes intents
 * - State manager handles all state
 *
 * Supports two transfer modes:
 * - "async" (Send File): Server-mediated, works when recipient is offline
 * - "p2p" (P2P Only Transfer): Direct peer-to-peer, requires both online
 *
 * State Machine:
 * PENDING → UPLOADING → STAGED → TRANSFERRING → COMPLETE
 *                           ↓
 *                    DECLINED/EXPIRED/CANCELLED/ERROR
 */

import { eventEmitter } from '../event-emitter';
import {
  type MessagingLayer,
  type FileTransferState as TransferState,
  type FileTransferMode,
  MessagingLayerType,
  type FileTransferRequestData,
  type FileTransferResponseData,
  type FileTransferProgressData,
  type FileTransferCompleteData,
  type FileTransferCancelData,
  type FileTransferChunkData,
  isFileTransferRequest,
  isFileTransferResponse,
  isFileTransferProgress,
  isFileTransferComplete,
  isFileTransferCancel,
  isFileTransferChunk,
  FILE_TRANSFER_REQUEST_TTL_MS,
  FILE_TRANSFER_CHUNK_SIZE_BYTES,
} from '@/types/messaging-layer';
import { FileTransferState } from './state';
import { FileTransferIO } from './io';
import { FILE_TRANSFER_EVENTS } from './events';
import type { IFileTransferIORouter } from './io-router';
import type {
  FileTransfer,
  FileTransferSettings,
  TransferProgressEvent,
  TransferModePreference,
  IncomingFileTransferMessage,
} from './types';
import { debugLog } from '@/lib/debug-config';

export class FileTransferService {
  private static instance: FileTransferService;

  private readonly state = new FileTransferState();
  /**
   * I/O router for file transfer operations.
   * Uses the RealProtocolIORouter (native SendFile command).
   */
  private io: FileTransferIO;
  private initialized = false;

  private constructor() {
    // Use FileTransferIO (RealProtocolIORouter with backward compatibility layer)
    this.io = new FileTransferIO();
  }

  static getInstance(): FileTransferService {
    if (!FileTransferService.instance) {
      FileTransferService.instance = new FileTransferService();
    }
    return FileTransferService.instance;
  }

  /**
   * Swap the I/O router implementation.
   *
   * @param router - New I/O router (must extend FileTransferIO)
   */
  setIORouter(router: FileTransferIO): void {
    // Dispose old router
    this.io.dispose();
    // Set new router
    this.io = router;
    debugLog('Service', 'FileTransferService: I/O router swapped', {
      routerType: router.constructor.name,
    });
  }

  /**
   * Get the current I/O router as IFileTransferIORouter interface.
   * Useful for testing and inspection.
   */
  getIORouter(): IFileTransferIORouter {
    return this.io;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.setupMessageHandlers();
    await this.loadFromStorage();

    this.initialized = true;
    debugLog('Service', 'FileTransferService: Initialized');
  }

  // ============================================================================
  // Send Flow
  // ============================================================================

  async sendFile(recipientCid: string, file: File, mode: FileTransferMode): Promise<string> {
    const senderCid = await this.io.getCurrentCid();
    if (!senderCid) {
      throw new Error('No active session');
    }

    // Validate file size
    const settings = this.state.getSettings(recipientCid);
    if (file.size > settings.maxFileSize) {
      throw new Error(
        `File size ${this.formatBytes(file.size)} exceeds max ${this.formatBytes(settings.maxFileSize)}`
      );
    }

    // Generate thumbnail for images (I/O operation)
    let thumbnail: string | undefined;
    if (file.type.startsWith('image/')) {
      thumbnail = await this.io.generateThumbnail(file);
    }

    const transferId = crypto.randomUUID();
    const expiresAt = Date.now() + FILE_TRANSFER_REQUEST_TTL_MS;

    // Create transfer record
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

    this.state.setTransfer(transfer);
    await this.saveTransfer(transfer);

    if (mode === 'async') {
      await this.handleAsyncSend(transfer, file);
    } else {
      // P2P mode: Store file for streaming after acceptance
      this.state.setPendingFile(transferId, file);
      await this.io.executeIntent({ type: 'send-transfer-request', transfer });
    }

    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);

    return transferId;
  }

  private async handleAsyncSend(transfer: FileTransfer, file: File): Promise<void> {
    try {
      const virtualPath = await this.io.executeIntent({
        type: 'upload-to-server',
        file,
        transferId: transfer.id,
        recipientCid: transfer.recipientCid,
      }) as string;

      transfer.virtualPath = virtualPath;
      transfer.state = 'staged';
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);

      await this.io.executeIntent({ type: 'send-transfer-request', transfer });
    } catch (error) {
      transfer.state = 'error';
      transfer.errorMessage = error instanceof Error ? error.message : 'Upload failed';
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      throw error;
    }
  }

  async cancelTransfer(transferId: string): Promise<void> {
    const transfer = this.state.getTransfer(transferId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.state === 'complete' || transfer.state === 'cancelled') {
      return;
    }

    await this.io.executeIntent({
      type: 'send-cancel',
      transferId,
      targetCid: transfer.recipientCid,
      reason: 'Sender cancelled transfer',
    });

    transfer.state = 'cancelled';
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
  }

  // ============================================================================
  // Receive Flow
  // ============================================================================

  async acceptTransfer(transferId: string): Promise<void> {
    const transfer = this.state.getTransfer(transferId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (!transfer.isIncoming) {
      throw new Error('Cannot accept outgoing transfer');
    }

    if (transfer.state !== 'pending' && transfer.state !== 'staged') {
      throw new Error(`Cannot accept transfer in state: ${transfer.state}`);
    }

    await this.io.executeIntent({
      type: 'send-response',
      transferId,
      targetCid: transfer.senderCid,
      accepted: true,
    });

    transfer.state = 'transferring';
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.emitStateChange(transfer);

    if (transfer.mode === 'async' && transfer.virtualPath) {
      await this.io.executeIntent({ type: 'download-from-server', transfer });
      // Simulate completion after download
      transfer.state = 'complete';
      transfer.progress = 100;
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);
    }
  }

  async declineTransfer(transferId: string, reason?: string): Promise<void> {
    const transfer = this.state.getTransfer(transferId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (!transfer.isIncoming) {
      throw new Error('Cannot decline outgoing transfer');
    }

    await this.io.executeIntent({
      type: 'send-response',
      transferId,
      targetCid: transfer.senderCid,
      accepted: false,
      reason,
    });

    transfer.state = 'declined';
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.emitStateChange(transfer);
  }

  // ============================================================================
  // Settings
  // ============================================================================

  getSettings(peerCid: string): FileTransferSettings {
    return this.state.getSettings(peerCid);
  }

  async setAutoAccept(peerCid: string, enabled: boolean): Promise<void> {
    const settings = this.state.getSettings(peerCid);
    settings.autoAccept = enabled;
    this.state.setSettings(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  getAutoAccept(peerCid: string): boolean {
    return this.state.getSettings(peerCid).autoAccept;
  }

  async setMaxFileSize(peerCid: string, maxBytes: number): Promise<void> {
    const settings = this.state.getSettings(peerCid);
    settings.maxFileSize = maxBytes;
    this.state.setSettings(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  async setTransferMode(peerCid: string, mode: TransferModePreference): Promise<void> {
    const settings = this.state.getSettings(peerCid);
    settings.transferMode = mode;
    this.state.setSettings(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  getTransferMode(peerCid: string): TransferModePreference {
    return this.state.getSettings(peerCid).transferMode;
  }

  async setAllowRevfsStorage(peerCid: string, allowed: boolean): Promise<void> {
    const settings = this.state.getSettings(peerCid);
    settings.allowRevfsStorage = allowed;
    this.state.setSettings(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  async setRevfsQuota(peerCid: string, quotaBytes: number): Promise<void> {
    const settings = this.state.getSettings(peerCid);
    settings.revfsQuota = quotaBytes;
    this.state.setSettings(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  onProgress(
    transferId: string,
    callback: (progress: TransferProgressEvent) => void
  ): () => void {
    return this.state.addProgressCallback(transferId, callback);
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  getTransfer(transferId: string): FileTransfer | undefined {
    return this.state.getTransfer(transferId);
  }

  getTransfersForPeer(peerCid: string): FileTransfer[] {
    return this.state.getTransfersForPeer(peerCid);
  }

  getPendingIncoming(): FileTransfer[] {
    return this.state.getPendingIncoming();
  }

  getActiveTransfers(): FileTransfer[] {
    return this.state.getActiveTransfers();
  }

  getAllTransfers(): FileTransfer[] {
    return this.state.getAllTransfers();
  }

  getReceivedFile(transferId: string): Blob | undefined {
    return this.state.getReceivedFile(transferId);
  }

  async getReceivedFileAsText(transferId: string): Promise<string | undefined> {
    const blob = this.state.getReceivedFile(transferId);
    if (!blob) return undefined;
    return blob.text();
  }

  // ============================================================================
  // Native File Picker
  // ============================================================================

  async sendFileWithNativePicker(
    recipientCid: string,
    title?: string,
    allowedExtensions?: string[]
  ): Promise<string> {
    const senderCid = await this.io.getCurrentCid();
    if (!senderCid) {
      throw new Error('No active session');
    }

    debugLog('Service', 'FileTransferService: Starting native file picker flow');

    const fileInfo = await this.io.executeIntent({
      type: 'pick-file',
      cid: senderCid,
      title,
      allowedExtensions,
    }) as { file_path: string; file_name: string; file_size: bigint };

    debugLog('Service', 'FileTransferService: File picked', {
      path: fileInfo.file_path,
      name: fileInfo.file_name,
      size: fileInfo.file_size.toString(),
    });

    const transferId = crypto.randomUUID();
    const transfer: FileTransfer = {
      id: transferId,
      fileName: fileInfo.file_name,
      fileSize: Number(fileInfo.file_size),
      fileType: this.getMimeType(fileInfo.file_name),
      mode: 'p2p',
      state: 'transferring',
      progress: 0,
      senderCid: senderCid.toString(),
      recipientCid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isIncoming: false,
    };

    this.state.setTransfer(transfer);
    await this.saveTransfer(transfer);
    this.emitStateChange(transfer);

    try {
      await this.io.executeIntent({
        type: 'send-file-via-protocol',
        cid: senderCid.toString(),
        peerCid: recipientCid,
        filePath: fileInfo.file_path,
        transferId,
      });

      debugLog('Service', 'FileTransferService: SendFile request submitted');
      eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);
      return transferId;
    } catch (error) {
      transfer.state = 'error';
      transfer.errorMessage = error instanceof Error ? error.message : 'SendFile failed';
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      throw error;
    }
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  private setupMessageHandlers(): void {
    eventEmitter.on('p2p:file-transfer-message', this.handleFileTransferMessage.bind(this));
  }

  private async handleFileTransferMessage(message: IncomingFileTransferMessage): Promise<void> {
    const { layer: rawLayer, senderCid, recipientCid } = message;
    debugLog('Service', 'FileTransferService: handleFileTransferMessage received', {
      type: (rawLayer as { type?: string })?.type,
      senderCid: senderCid?.slice(0, 12),
      recipientCid: recipientCid?.slice(0, 12),
    });

    // Cast to MessagingLayer for type guards - they will validate the actual type
    const layer = rawLayer as MessagingLayer;

    if (isFileTransferRequest(layer)) {
      await this.handleTransferRequest(layer, senderCid);
    } else if (isFileTransferResponse(layer)) {
      await this.handleTransferResponse(layer, senderCid);
    } else if (isFileTransferProgress(layer)) {
      await this.handleTransferProgress(layer, senderCid);
    } else if (isFileTransferComplete(layer)) {
      await this.handleTransferComplete(layer, senderCid);
    } else if (isFileTransferCancel(layer)) {
      await this.handleTransferCancel(layer, senderCid);
    } else if (isFileTransferChunk(layer)) {
      await this.handleTransferChunk(layer, senderCid);
    }
  }

  private async handleTransferRequest(
    data: FileTransferRequestData & { type: MessagingLayerType.FileTransferRequest },
    senderCid: string
  ): Promise<void> {
    const currentCid = await this.io.getCurrentCid();
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

    this.state.setTransfer(transfer);
    await this.saveTransfer(transfer);

    if (this.getAutoAccept(senderCid)) {
      await this.acceptTransfer(transfer.id);
    } else {
      eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_RECEIVED, transfer);
    }
  }

  private async handleTransferResponse(
    data: FileTransferResponseData & { type: MessagingLayerType.FileTransferResponse },
    _senderCid: string
  ): Promise<void> {
    const transfer = this.state.getTransfer(data.transfer_id);
    if (!transfer || transfer.isIncoming) return;

    if (data.accepted) {
      transfer.state = 'transferring';
      if (transfer.mode === 'p2p') {
        const file = this.state.getPendingFile(transfer.id);
        if (file) {
          await this.streamFileToRecipient(transfer, file);
        } else {
          transfer.state = 'error';
          transfer.errorMessage = 'File data not found';
        }
      }
    } else {
      transfer.state = 'declined';
      transfer.errorMessage = data.decline_reason;
      this.state.deletePendingFile(transfer.id);
    }

    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);
    this.emitStateChange(transfer);
  }

  private async handleTransferProgress(
    data: FileTransferProgressData & { type: MessagingLayerType.FileTransferProgress },
    _senderCid: string
  ): Promise<void> {
    const transfer = this.state.getTransfer(data.transfer_id);
    if (!transfer) return;

    transfer.progress = data.percentage;
    transfer.updatedAt = Date.now();

    const event: TransferProgressEvent = {
      transferId: data.transfer_id,
      bytesTransferred: data.bytes_transferred,
      totalBytes: data.total_bytes,
      percentage: data.percentage,
    };
    this.state.notifyProgressCallbacks(data.transfer_id, event);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.PROGRESS_UPDATED, { transfer, progress: data });
  }

  private async handleTransferComplete(
    data: FileTransferCompleteData & { type: MessagingLayerType.FileTransferComplete },
    _senderCid: string
  ): Promise<void> {
    const transfer = this.state.getTransfer(data.transfer_id);
    if (!transfer) return;

    if (data.success) {
      transfer.state = 'complete';
      transfer.downloadPath = data.download_path;
      transfer.progress = 100;
    } else {
      transfer.state = 'error';
      transfer.errorMessage = data.error_message;
    }

    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);
    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);
  }

  private async handleTransferCancel(
    data: FileTransferCancelData & { type: MessagingLayerType.FileTransferCancel },
    _senderCid: string
  ): Promise<void> {
    const transfer = this.state.getTransfer(data.transfer_id);
    if (!transfer) return;

    transfer.state = 'cancelled';
    transfer.errorMessage = data.reason;
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.state.cleanupTransfer(transfer.id);

    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
  }

  private async handleTransferChunk(
    data: FileTransferChunkData & { type: MessagingLayerType.FileTransferChunk },
    _senderCid: string
  ): Promise<void> {
    const transfer = this.state.getTransfer(data.transfer_id);
    if (!transfer || !transfer.isIncoming) return;

    debugLog('Service', 
      `FileTransferService: Received chunk ${data.chunk_index + 1}/${data.total_chunks} for transfer ${data.transfer_id}`
    );

    this.state.initReceivedChunks(data.transfer_id);
    this.state.addReceivedChunk(data.transfer_id, { data: data.data, index: data.chunk_index });

    const chunkCount = this.state.getReceivedChunkCount(data.transfer_id);
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
    this.state.notifyProgressCallbacks(data.transfer_id, event);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.PROGRESS_UPDATED, { transfer, progress: { percentage } });
    this.emitStateChange(transfer);

    if (chunkCount === data.total_chunks) {
      await this.reassembleFile(transfer, data.total_chunks);
    }
  }

  // ============================================================================
  // P2P Streaming
  // ============================================================================

  private async streamFileToRecipient(transfer: FileTransfer, file: File): Promise<void> {
    const chunkSize = FILE_TRANSFER_CHUNK_SIZE_BYTES;
    const totalChunks = Math.ceil(file.size / chunkSize);

    debugLog('Service', 
      `FileTransferService: Starting P2P stream of ${file.name} (${file.size} bytes) in ${totalChunks} chunks`
    );

    try {
      for (let i = 0; i < totalChunks; i++) {
        const currentTransfer = this.state.getTransfer(transfer.id);
        if (!currentTransfer || currentTransfer.state === 'cancelled') {
          debugLog('Service', 'FileTransferService: Transfer cancelled, stopping stream');
          break;
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const base64Data = await this.io.fileChunkToBase64(chunk);

        await this.io.executeIntent({
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
        this.emitStateChange(transfer);

        if (i < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      const finalTransfer = this.state.getTransfer(transfer.id);
      if (finalTransfer && finalTransfer.state !== 'cancelled') {
        await this.io.executeIntent({
          type: 'send-complete',
          transferId: transfer.id,
          targetCid: transfer.recipientCid,
          success: true,
        });

        finalTransfer.state = 'complete';
        finalTransfer.progress = 100;
        finalTransfer.updatedAt = Date.now();
        await this.saveTransfer(finalTransfer);
        this.emitStateChange(finalTransfer);
        eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, finalTransfer);
      }
    } catch (error) {
      console.error('FileTransferService: Error streaming file', error);
      transfer.state = 'error';
      transfer.errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.ERROR, { transfer, error });
    } finally {
      this.state.deletePendingFile(transfer.id);
    }
  }

  private async reassembleFile(transfer: FileTransfer, totalChunks: number): Promise<void> {
    const chunks = this.state.getReceivedChunks(transfer.id);
    if (!chunks) return;

    debugLog('Service', `FileTransferService: Reassembling file from ${chunks.length} chunks`);

    try {
      if (chunks.length !== totalChunks) {
        throw new Error(`Missing chunks: expected ${totalChunks}, got ${chunks.length}`);
      }

      const { blob, downloadUrl } = this.io.createBlobFromChunks(chunks, transfer.fileType);

      transfer.downloadPath = downloadUrl;
      transfer.state = 'complete';
      transfer.progress = 100;
      transfer.updatedAt = Date.now();

      this.state.setReceivedFile(transfer.id, blob);

      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);

      debugLog('Service', 
        `FileTransferService: File reassembled successfully: ${transfer.fileName} (${blob.size} bytes)`
      );
    } catch (error) {
      console.error('FileTransferService: Error reassembling file', error);
      transfer.state = 'error';
      transfer.errorMessage = error instanceof Error ? error.message : 'Reassembly failed';
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.ERROR, { transfer, error });
    } finally {
      this.state.deleteReceivedChunks(transfer.id);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private emitStateChange(transfer: FileTransfer): void {
    eventEmitter.emit(FILE_TRANSFER_EVENTS.STATE_CHANGED, transfer);
    this.io.notifyStateChange(transfer);
  }

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      zip: 'application/zip',
      json: 'application/json',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ============================================================================
  // @human-review Persistence requires LocalDB integration
  // ============================================================================

  private async loadFromStorage(): Promise<void> {
    debugLog('Service', 'FileTransferService: Loading from storage');
  }

  private async saveTransfer(_transfer: FileTransfer): Promise<void> {
    // @human-review Save to LocalDB
  }

  private async saveSettings(_peerCid: string, _settings: FileTransferSettings): Promise<void> {
    // @human-review Save to LocalDB
  }
}

// Export singleton instance
export const fileTransferService = FileTransferService.getInstance();

// Auto-initialize
fileTransferService.initialize().catch(err => {
  console.error('FileTransferService: Auto-initialization failed:', err);
});

// Expose for testing
if (typeof window !== 'undefined') {
  (window as unknown as { __fileTransferService: FileTransferService }).__fileTransferService =
    fileTransferService;
}
