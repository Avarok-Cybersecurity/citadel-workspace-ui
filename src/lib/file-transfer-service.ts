/**
 * FileTransferService - Manages file transfers in P2P messaging
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

import { eventEmitter } from './event-emitter';
import { websocketService } from './websocket-service';
import { p2pMessengerManager, type P2PMessage } from './p2p-messenger-manager';
import { getSelectedUser } from './tab-context';
import {
  MessagingLayerType,
  type FileTransferState,
  type FileTransferMode,
  type FileTransferRequestData,
  type FileTransferResponseData,
  type FileTransferProgressData,
  type FileTransferCompleteData,
  type FileTransferCancelData,
  type FileTransferChunkData,
  createFileTransferRequest,
  createFileTransferResponse,
  createFileTransferProgress,
  createFileTransferComplete,
  createFileTransferCancel,
  createFileTransferChunk,
  isFileTransferRequest,
  isFileTransferResponse,
  isFileTransferProgress,
  isFileTransferComplete,
  isFileTransferCancel,
  isFileTransferChunk,
  FILE_TRANSFER_REQUEST_TTL_MS,
  FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
  REVFS_DEFAULT_QUOTA_BYTES,
  FILE_TRANSFER_CHUNK_SIZE_BYTES,
} from '@/types/messaging-layer';

// ============================================================================
// Types
// ============================================================================

export interface FileTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  thumbnail?: string;
  mode: FileTransferMode;
  state: FileTransferState;
  progress: number; // 0-100
  senderCid: string;
  recipientCid: string;
  virtualPath?: string;
  downloadPath?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  isIncoming: boolean; // true if we are the recipient
}

export type TransferModePreference = 'browser' | 'protocol';

export interface FileTransferSettings {
  autoAccept: boolean;
  maxFileSize: number;
  // Transfer mode preference
  transferMode: TransferModePreference; // 'browser' = in-browser (default), 'protocol' = Citadel Protocol
  // RE-VFS settings
  allowRevfsStorage: boolean;
  revfsQuota: number;
}

export interface TransferProgressEvent {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

// ============================================================================
// Events
// ============================================================================

export const FILE_TRANSFER_EVENTS = {
  REQUEST_RECEIVED: 'file-transfer:request-received',
  REQUEST_SENT: 'file-transfer:request-sent',
  STATE_CHANGED: 'file-transfer:state-changed',
  PROGRESS_UPDATED: 'file-transfer:progress-updated',
  COMPLETED: 'file-transfer:completed',
  CANCELLED: 'file-transfer:cancelled',
  ERROR: 'file-transfer:error',
} as const;

// ============================================================================
// FileTransferService
// ============================================================================

export class FileTransferService {
  private static instance: FileTransferService;

  // Active transfers by ID
  private transfers: Map<string, FileTransfer> = new Map();

  // Per-peer settings
  private peerSettings: Map<string, FileTransferSettings> = new Map();

  // Progress callbacks by transfer ID
  private progressCallbacks: Map<string, ((progress: TransferProgressEvent) => void)[]> = new Map();

  // Pending files waiting to be sent after acceptance (transfer_id -> File)
  private pendingFiles: Map<string, File> = new Map();

  // Received chunks for incoming P2P transfers (transfer_id -> chunks[])
  private receivedChunks: Map<string, { data: string; index: number }[]> = new Map();

  // DB prefix for LocalDB storage
  private readonly dbPrefix = 'file_transfers';
  private readonly settingsPrefix = 'file_transfer_settings';

  private initialized = false;

  private constructor() {}

  static getInstance(): FileTransferService {
    if (!FileTransferService.instance) {
      FileTransferService.instance = new FileTransferService();
    }
    return FileTransferService.instance;
  }

  /**
   * Initialize the service and set up message handlers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to file transfer messages via P2PMessengerManager
    this.setupMessageHandlers();

    // Load persisted transfers and settings
    await this.loadFromStorage();

    this.initialized = true;
    console.log('FileTransferService: Initialized');
  }

  // ============================================================================
  // Send Flow
  // ============================================================================

  /**
   * Send a file to a recipient
   * @param recipientCid - CID of the recipient
   * @param file - File object to send
   * @param mode - Transfer mode: 'async' or 'p2p'
   * @returns Transfer ID
   */
  async sendFile(recipientCid: string, file: File, mode: FileTransferMode): Promise<string> {
    const senderCid = this.getCurrentCid();
    if (!senderCid) {
      throw new Error('No active session');
    }

    // Validate file size
    const settings = this.getSettings(recipientCid);
    if (file.size > settings.maxFileSize) {
      throw new Error(`File size ${this.formatBytes(file.size)} exceeds max ${this.formatBytes(settings.maxFileSize)}`);
    }

    // Generate thumbnail for images
    let thumbnail: string | undefined;
    if (file.type.startsWith('image/')) {
      thumbnail = await this.generateThumbnail(file);
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
      senderCid,
      recipientCid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt,
      isIncoming: false,
    };

    this.transfers.set(transferId, transfer);
    await this.saveTransfer(transfer);

    if (mode === 'async') {
      // Async mode: Upload to server first, then send request message
      try {
        const virtualPath = await this.uploadToServer(file, transferId, recipientCid);
        transfer.virtualPath = virtualPath;
        transfer.state = 'staged';
        transfer.updatedAt = Date.now();
        await this.saveTransfer(transfer);

        // Send transfer request via P2P messaging
        await this.sendTransferRequest(transfer);
      } catch (error) {
        transfer.state = 'error';
        transfer.errorMessage = error instanceof Error ? error.message : 'Upload failed';
        transfer.updatedAt = Date.now();
        await this.saveTransfer(transfer);
        this.emitStateChange(transfer);
        throw error;
      }
    } else {
      // P2P mode: Store file for later streaming after acceptance
      this.pendingFiles.set(transferId, file);
      // Send direct transfer request
      await this.sendTransferRequest(transfer);
    }

    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);

    return transferId;
  }

  /**
   * Cancel an outgoing or pending transfer
   */
  async cancelTransfer(transferId: string): Promise<void> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.state === 'complete' || transfer.state === 'cancelled') {
      return; // Already finished
    }

    // Send cancel message to peer
    const cancelMsg = createFileTransferCancel(transferId, 'Sender cancelled transfer');
    await p2pMessengerManager.sendRawMessage(transfer.recipientCid, cancelMsg);

    // Update local state
    transfer.state = 'cancelled';
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
  }

  // ============================================================================
  // Receive Flow
  // ============================================================================

  /**
   * Accept an incoming file transfer
   */
  async acceptTransfer(transferId: string): Promise<void> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (!transfer.isIncoming) {
      throw new Error('Cannot accept outgoing transfer');
    }

    if (transfer.state !== 'pending' && transfer.state !== 'staged') {
      throw new Error(`Cannot accept transfer in state: ${transfer.state}`);
    }

    // Send accept response
    const responseMsg = createFileTransferResponse(transferId, true);
    await p2pMessengerManager.sendRawMessage(transfer.senderCid, responseMsg);

    // Update state
    transfer.state = 'transferring';
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.emitStateChange(transfer);

    // For async mode, initiate download from server
    if (transfer.mode === 'async' && transfer.virtualPath) {
      this.downloadFromServer(transfer);
    }
    // For P2P mode, sender will start streaming after receiving accept
  }

  /**
   * Decline an incoming file transfer
   */
  async declineTransfer(transferId: string, reason?: string): Promise<void> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (!transfer.isIncoming) {
      throw new Error('Cannot decline outgoing transfer');
    }

    // Send decline response
    const responseMsg = createFileTransferResponse(transferId, false, reason);
    await p2pMessengerManager.sendRawMessage(transfer.senderCid, responseMsg);

    // Update state
    transfer.state = 'declined';
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    this.emitStateChange(transfer);
  }

  // ============================================================================
  // Settings
  // ============================================================================

  /**
   * Get settings for a specific peer (or defaults)
   */
  getSettings(peerCid: string): FileTransferSettings {
    const stored = this.peerSettings.get(peerCid);
    if (stored) return stored;

    // Return defaults
    return {
      autoAccept: false,
      maxFileSize: FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
      transferMode: 'browser', // Browser-based transfer is default
      allowRevfsStorage: false,
      revfsQuota: REVFS_DEFAULT_QUOTA_BYTES,
    };
  }

  /**
   * Set auto-accept for a peer
   */
  async setAutoAccept(peerCid: string, enabled: boolean): Promise<void> {
    const settings = this.getSettings(peerCid);
    settings.autoAccept = enabled;
    this.peerSettings.set(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  /**
   * Get auto-accept status for a peer
   */
  getAutoAccept(peerCid: string): boolean {
    return this.getSettings(peerCid).autoAccept;
  }

  /**
   * Update max file size for a peer
   */
  async setMaxFileSize(peerCid: string, maxBytes: number): Promise<void> {
    const settings = this.getSettings(peerCid);
    settings.maxFileSize = Math.min(maxBytes, FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES);
    this.peerSettings.set(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  /**
   * Set transfer mode preference for a peer
   */
  async setTransferMode(peerCid: string, mode: TransferModePreference): Promise<void> {
    const settings = this.getSettings(peerCid);
    settings.transferMode = mode;
    this.peerSettings.set(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  /**
   * Get transfer mode preference for a peer
   */
  getTransferMode(peerCid: string): TransferModePreference {
    return this.getSettings(peerCid).transferMode;
  }

  /**
   * Set RE-VFS storage permission for a peer
   */
  async setAllowRevfsStorage(peerCid: string, allowed: boolean): Promise<void> {
    const settings = this.getSettings(peerCid);
    settings.allowRevfsStorage = allowed;
    this.peerSettings.set(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  /**
   * Set RE-VFS quota for a peer
   */
  async setRevfsQuota(peerCid: string, quotaBytes: number): Promise<void> {
    const settings = this.getSettings(peerCid);
    settings.revfsQuota = Math.min(quotaBytes, REVFS_DEFAULT_QUOTA_BYTES);
    this.peerSettings.set(peerCid, settings);
    await this.saveSettings(peerCid, settings);
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Subscribe to progress updates for a transfer
   */
  onProgress(transferId: string, callback: (progress: TransferProgressEvent) => void): () => void {
    if (!this.progressCallbacks.has(transferId)) {
      this.progressCallbacks.set(transferId, []);
    }
    this.progressCallbacks.get(transferId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.progressCallbacks.get(transferId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get a transfer by ID
   */
  getTransfer(transferId: string): FileTransfer | undefined {
    return this.transfers.get(transferId);
  }

  /**
   * Get all transfers for a peer
   */
  getTransfersForPeer(peerCid: string): FileTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => t.senderCid === peerCid || t.recipientCid === peerCid
    );
  }

  /**
   * Get pending incoming transfers
   */
  getPendingIncoming(): FileTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => t.isIncoming && (t.state === 'pending' || t.state === 'staged')
    );
  }

  /**
   * Get active transfers (in progress)
   */
  getActiveTransfers(): FileTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => ['pending', 'uploading', 'staged', 'transferring'].includes(t.state)
    );
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  private setupMessageHandlers(): void {
    // Handle incoming file transfer messages from P2PMessengerManager
    eventEmitter.on('p2p:file-transfer-message', this.handleFileTransferMessage.bind(this));
  }

  private async handleFileTransferMessage(message: { layer: any; senderCid: string; recipientCid: string }): Promise<void> {
    const { layer, senderCid, recipientCid } = message;
    console.log('FileTransferService: handleFileTransferMessage received', {
      type: layer?.type,
      senderCid: senderCid?.slice(0, 12),
      recipientCid: recipientCid?.slice(0, 12)
    });

    if (isFileTransferRequest(layer)) {
      await this.handleTransferRequest(layer, senderCid);
    } else if (isFileTransferResponse(layer)) {
      console.log('FileTransferService: Routing to handleTransferResponse');
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

  private async handleTransferRequest(data: FileTransferRequestData & { type: MessagingLayerType.FileTransferRequest }, senderCid: string): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid) return;

    // Create incoming transfer record
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
      recipientCid: currentCid,
      virtualPath: data.virtual_path,
      createdAt: data.timestamp,
      updatedAt: Date.now(),
      expiresAt: data.expiry_timestamp,
      isIncoming: true,
    };

    this.transfers.set(transfer.id, transfer);
    await this.saveTransfer(transfer);

    // Check auto-accept
    if (this.getAutoAccept(senderCid)) {
      await this.acceptTransfer(transfer.id);
    } else {
      eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_RECEIVED, transfer);
    }
  }

  private async handleTransferResponse(data: FileTransferResponseData & { type: MessagingLayerType.FileTransferResponse }, senderCid: string): Promise<void> {
    console.log('FileTransferService: handleTransferResponse called', {
      transfer_id: data.transfer_id,
      accepted: data.accepted,
      senderCid: senderCid?.slice(0, 12),
      allTransferIds: Array.from(this.transfers.keys()).map(id => id.slice(0, 12)),
      pendingFileIds: Array.from(this.pendingFiles.keys()).map(id => id.slice(0, 12))
    });

    const transfer = this.transfers.get(data.transfer_id);
    if (!transfer) {
      console.error('FileTransferService: Transfer not found in handleTransferResponse', data.transfer_id);
      return;
    }
    if (transfer.isIncoming) {
      console.log('FileTransferService: Ignoring response for incoming transfer', data.transfer_id);
      return;
    }

    if (data.accepted) {
      console.log('FileTransferService: Transfer accepted, mode:', transfer.mode);
      transfer.state = 'transferring';
      if (transfer.mode === 'p2p') {
        // Start P2P chunk streaming
        const file = this.pendingFiles.get(transfer.id);
        console.log('FileTransferService: Looking for pending file', {
          transferId: transfer.id.slice(0, 12),
          fileFound: !!file,
          fileName: file?.name,
          fileSize: file?.size
        });
        if (file) {
          // Stream file in chunks
          console.log('FileTransferService: Starting streamFileToRecipient');
          this.streamFileToRecipient(transfer, file);
        } else {
          console.error('FileTransferService: File not found for transfer', transfer.id);
          transfer.state = 'error';
          transfer.errorMessage = 'File data not found';
        }
      }
    } else {
      transfer.state = 'declined';
      transfer.errorMessage = data.decline_reason;
      // Cleanup pending file
      this.pendingFiles.delete(transfer.id);
    }

    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);
    this.emitStateChange(transfer);
  }

  private async handleTransferProgress(data: FileTransferProgressData & { type: MessagingLayerType.FileTransferProgress }, senderCid: string): Promise<void> {
    const transfer = this.transfers.get(data.transfer_id);
    if (!transfer) return;

    transfer.progress = data.percentage;
    transfer.updatedAt = Date.now();

    // Notify progress callbacks
    const callbacks = this.progressCallbacks.get(data.transfer_id);
    if (callbacks) {
      const event: TransferProgressEvent = {
        transferId: data.transfer_id,
        bytesTransferred: data.bytes_transferred,
        totalBytes: data.total_bytes,
        percentage: data.percentage,
      };
      callbacks.forEach(cb => cb(event));
    }

    eventEmitter.emit(FILE_TRANSFER_EVENTS.PROGRESS_UPDATED, { transfer, progress: data });
  }

  private async handleTransferComplete(data: FileTransferCompleteData & { type: MessagingLayerType.FileTransferComplete }, senderCid: string): Promise<void> {
    const transfer = this.transfers.get(data.transfer_id);
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

  private async handleTransferCancel(data: FileTransferCancelData & { type: MessagingLayerType.FileTransferCancel }, senderCid: string): Promise<void> {
    const transfer = this.transfers.get(data.transfer_id);
    if (!transfer) return;

    transfer.state = 'cancelled';
    transfer.errorMessage = data.reason;
    transfer.updatedAt = Date.now();
    await this.saveTransfer(transfer);

    // Cleanup
    this.pendingFiles.delete(transfer.id);
    this.receivedChunks.delete(transfer.id);

    this.emitStateChange(transfer);
    eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
  }

  /**
   * Handle incoming file chunk from sender
   */
  private async handleTransferChunk(data: FileTransferChunkData & { type: MessagingLayerType.FileTransferChunk }, senderCid: string): Promise<void> {
    const transfer = this.transfers.get(data.transfer_id);
    if (!transfer || !transfer.isIncoming) return;

    console.log(`FileTransferService: Received chunk ${data.chunk_index + 1}/${data.total_chunks} for transfer ${data.transfer_id}`);

    // Store the chunk
    if (!this.receivedChunks.has(data.transfer_id)) {
      this.receivedChunks.set(data.transfer_id, []);
    }
    const chunks = this.receivedChunks.get(data.transfer_id)!;
    chunks.push({ data: data.data, index: data.chunk_index });

    // Update progress
    const bytesReceived = chunks.length * FILE_TRANSFER_CHUNK_SIZE_BYTES;
    const percentage = Math.min(100, Math.round((chunks.length / data.total_chunks) * 100));
    transfer.progress = percentage;
    transfer.updatedAt = Date.now();

    // Notify progress
    const callbacks = this.progressCallbacks.get(data.transfer_id);
    if (callbacks) {
      const event: TransferProgressEvent = {
        transferId: data.transfer_id,
        bytesTransferred: Math.min(bytesReceived, transfer.fileSize),
        totalBytes: transfer.fileSize,
        percentage,
      };
      callbacks.forEach(cb => cb(event));
    }
    eventEmitter.emit(FILE_TRANSFER_EVENTS.PROGRESS_UPDATED, { transfer, progress: { percentage } });
    this.emitStateChange(transfer);

    // Check if all chunks received
    if (chunks.length === data.total_chunks) {
      await this.reassembleFile(transfer, chunks, data.total_chunks);
    }
  }

  /**
   * Stream file to recipient in chunks
   */
  private async streamFileToRecipient(transfer: FileTransfer, file: File): Promise<void> {
    const chunkSize = FILE_TRANSFER_CHUNK_SIZE_BYTES;
    const totalChunks = Math.ceil(file.size / chunkSize);

    console.log(`FileTransferService: Starting P2P stream of ${file.name} (${file.size} bytes) in ${totalChunks} chunks`);

    try {
      for (let i = 0; i < totalChunks; i++) {
        // Check if transfer was cancelled
        const currentTransfer = this.transfers.get(transfer.id);
        if (!currentTransfer || currentTransfer.state === 'cancelled') {
          console.log('FileTransferService: Transfer cancelled, stopping stream');
          break;
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        // Convert chunk to base64
        const base64Data = await this.fileChunkToBase64(chunk);

        // Send chunk message
        const chunkMsg = createFileTransferChunk(
          transfer.id,
          i,
          totalChunks,
          base64Data
        );

        await p2pMessengerManager.sendRawMessage(transfer.recipientCid, chunkMsg);

        // Update progress
        const percentage = Math.round(((i + 1) / totalChunks) * 100);
        transfer.progress = percentage;
        transfer.updatedAt = Date.now();
        this.emitStateChange(transfer);

        // Small delay between chunks to prevent overwhelming the connection
        if (i < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Check final state
      const finalTransfer = this.transfers.get(transfer.id);
      if (finalTransfer && finalTransfer.state !== 'cancelled') {
        // Send completion message
        const completeMsg = createFileTransferComplete(transfer.id, true);
        await p2pMessengerManager.sendRawMessage(transfer.recipientCid, completeMsg);

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
      // Cleanup
      this.pendingFiles.delete(transfer.id);
    }
  }

  /**
   * Reassemble file from received chunks
   */
  private async reassembleFile(transfer: FileTransfer, chunks: { data: string; index: number }[], totalChunks: number): Promise<void> {
    console.log(`FileTransferService: Reassembling file from ${chunks.length} chunks`);

    try {
      // Sort chunks by index
      chunks.sort((a, b) => a.index - b.index);

      // Verify all chunks present
      if (chunks.length !== totalChunks) {
        throw new Error(`Missing chunks: expected ${totalChunks}, got ${chunks.length}`);
      }

      // Convert base64 chunks back to binary and concatenate
      const binaryChunks: Uint8Array[] = [];
      for (const chunk of chunks) {
        const binary = this.base64ToBinary(chunk.data);
        binaryChunks.push(binary);
      }

      // Create Blob from all chunks
      const fileBlob = new Blob(binaryChunks, { type: transfer.fileType });

      // Create download URL
      const downloadUrl = URL.createObjectURL(fileBlob);
      transfer.downloadPath = downloadUrl;
      transfer.state = 'complete';
      transfer.progress = 100;
      transfer.updatedAt = Date.now();

      // Store the blob for later retrieval
      this.storeReceivedFile(transfer.id, fileBlob);

      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);

      console.log(`FileTransferService: File reassembled successfully: ${transfer.fileName} (${fileBlob.size} bytes)`);
    } catch (error) {
      console.error('FileTransferService: Error reassembling file', error);
      transfer.state = 'error';
      transfer.errorMessage = error instanceof Error ? error.message : 'Reassembly failed';
      transfer.updatedAt = Date.now();
      await this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.ERROR, { transfer, error });
    } finally {
      // Cleanup chunks
      this.receivedChunks.delete(transfer.id);
    }
  }

  /**
   * Convert a file chunk (Blob) to base64 string
   */
  private fileChunkToBase64(chunk: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // reader.result is a data URL like "data:application/octet-stream;base64,..."
        // Extract just the base64 part
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read chunk'));
      reader.readAsDataURL(chunk);
    });
  }

  /**
   * Convert base64 string back to binary Uint8Array
   */
  private base64ToBinary(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Map to store received file blobs for retrieval
  private receivedFiles: Map<string, Blob> = new Map();

  /**
   * Store received file blob for later retrieval
   */
  private storeReceivedFile(transferId: string, blob: Blob): void {
    this.receivedFiles.set(transferId, blob);
  }

  /**
   * Get received file blob by transfer ID
   */
  getReceivedFile(transferId: string): Blob | undefined {
    return this.receivedFiles.get(transferId);
  }

  /**
   * Get received file content as text (useful for text files)
   */
  async getReceivedFileAsText(transferId: string): Promise<string | undefined> {
    const blob = this.receivedFiles.get(transferId);
    if (!blob) return undefined;
    return blob.text();
  }

  /**
   * Get all transfers (for testing/debugging)
   */
  getAllTransfers(): FileTransfer[] {
    return Array.from(this.transfers.values());
  }

  // ============================================================================
  // Native File Picker + Protocol SendFile (Real File Transfer)
  // ============================================================================

  /**
   * Send a file using native file picker and real SendFile protocol.
   * This method:
   * 1. Opens native file picker dialog (via internal-service running natively)
   * 2. Gets the full file path
   * 3. Uses the real SendFile InternalServiceRequest
   *
   * @param recipientCid - CID of the recipient (peer_cid for P2P, or null for server)
   * @param title - Optional title for file picker dialog
   * @param allowedExtensions - Optional file extension filter
   * @returns Transfer ID on success
   */
  async sendFileWithNativePicker(
    recipientCid: string,
    title?: string,
    allowedExtensions?: string[]
  ): Promise<string> {
    const senderCid = this.getCurrentCid();
    if (!senderCid) {
      throw new Error('No active session');
    }

    console.log('FileTransferService: Starting native file picker flow');

    // Step 1: Open native file picker
    let fileInfo: { file_path: string; file_name: string; file_size: bigint };
    try {
      fileInfo = await websocketService.pickFile(senderCid, title, allowedExtensions);
      console.log('FileTransferService: File picked', {
        path: fileInfo.file_path,
        name: fileInfo.file_name,
        size: fileInfo.file_size.toString()
      });
    } catch (error) {
      // User cancelled or picker failed
      console.log('FileTransferService: File picker cancelled or failed', error);
      throw error;
    }

    // Step 2: Create transfer record for tracking
    const transferId = crypto.randomUUID();
    const transfer: FileTransfer = {
      id: transferId,
      fileName: fileInfo.file_name,
      fileSize: Number(fileInfo.file_size),
      fileType: this.getMimeType(fileInfo.file_name),
      mode: 'p2p', // Protocol-level P2P transfer
      state: 'transferring',
      progress: 0,
      senderCid,
      recipientCid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isIncoming: false,
    };

    this.transfers.set(transferId, transfer);
    await this.saveTransfer(transfer);
    this.emitStateChange(transfer);

    // Step 3: Send file using real SendFile protocol
    try {
      await this.sendFileViaProtocol(
        senderCid,
        recipientCid,
        fileInfo.file_path,
        transferId
      );

      console.log('FileTransferService: SendFile request submitted');
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

  /**
   * Send file using the real SendFile InternalServiceRequest
   */
  private async sendFileViaProtocol(
    cid: string,
    peerCid: string | null,
    filePath: string,
    transferId: string
  ): Promise<void> {
    const requestId = crypto.randomUUID();

    const request = {
      SendFile: {
        request_id: requestId,
        source: filePath,
        cid: cid,
        peer_cid: peerCid,
        chunk_size: null, // Use default
        transfer_type: 'FileTransfer' // TransferType enum
      }
    };

    console.log('FileTransferService: Sending SendFile request', {
      requestId,
      filePath,
      cid,
      peerCid,
      transferId
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        reject(new Error('SendFile request timed out'));
      }, 30000);

      const handleMessage = (message: any) => {
        // Check for SendFileRequestSuccess
        if (message.SendFileRequestSuccess?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.log('FileTransferService: SendFile accepted by protocol');
          resolve();
        }
        // Check for SendFileRequestFailure
        else if (message.SendFileRequestFailure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          const errorMsg = message.SendFileRequestFailure.message || 'SendFile failed';
          console.error('FileTransferService: SendFile failed', errorMsg);
          reject(new Error(errorMsg));
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      // Send the request
      websocketService.sendMessage(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        reject(error);
      });
    });
  }

  /**
   * Get MIME type from file name
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'zip': 'application/zip',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // ============================================================================
  // Server Operations (Async Mode)
  // ============================================================================

  private async uploadToServer(file: File, transferId: string, recipientCid: string): Promise<string> {
    // Use existing SendFile InternalServiceRequest
    const cid = this.getCurrentCid();
    if (!cid) throw new Error('No active session');

    // TODO: Implement actual SendFile request via websocketService
    // For now, return a mock path
    console.log('FileTransferService: Uploading file to server', { transferId, fileName: file.name, size: file.size });

    // The virtual path where the file is stored
    return `/transfers/${transferId}/${file.name}`;
  }

  private async downloadFromServer(transfer: FileTransfer): Promise<void> {
    // Use existing DownloadFile InternalServiceRequest
    console.log('FileTransferService: Downloading file from server', {
      transferId: transfer.id,
      virtualPath: transfer.virtualPath
    });

    // TODO: Implement actual DownloadFile request via websocketService
    // When complete, update transfer state and notify

    // For now, simulate completion
    setTimeout(() => {
      transfer.state = 'complete';
      transfer.progress = 100;
      transfer.updatedAt = Date.now();
      this.saveTransfer(transfer);
      this.emitStateChange(transfer);
      eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);
    }, 1000);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async sendTransferRequest(transfer: FileTransfer): Promise<void> {
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

    await p2pMessengerManager.sendRawMessage(transfer.recipientCid, requestMsg);
  }

  private emitStateChange(transfer: FileTransfer): void {
    eventEmitter.emit(FILE_TRANSFER_EVENTS.STATE_CHANGED, transfer);

    // Directly update the message in P2PMessengerManager so UI can refresh
    // Determine the peer CID (the other party in the transfer)
    const peerCid = transfer.isIncoming ? transfer.senderCid : transfer.recipientCid;
    p2pMessengerManager.updateFileTransferState(peerCid, transfer.id, {
      transfer_state: transfer.state,
      transfer_progress: transfer.progress,
    });
  }

  private getCurrentCid(): string | null {
    const tabSelection = getSelectedUser();
    if (tabSelection?.selectedCid) {
      return tabSelection.selectedCid;
    }
    return null;
  }

  private async generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
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

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private async loadFromStorage(): Promise<void> {
    // Load from LocalDB via websocketService
    // For now, start fresh - transfers are ephemeral
    console.log('FileTransferService: Loading from storage');
  }

  private async saveTransfer(transfer: FileTransfer): Promise<void> {
    // Save to LocalDB
    // For now, just keep in memory
  }

  private async saveSettings(peerCid: string, settings: FileTransferSettings): Promise<void> {
    // Save to LocalDB
    // For now, just keep in memory
  }
}

// Export singleton instance
export const fileTransferService = FileTransferService.getInstance();

// Auto-initialize the service to set up message handlers
// This ensures file transfer messages are properly handled
fileTransferService.initialize().catch(err => {
  console.error('FileTransferService: Auto-initialization failed:', err);
});

// Expose on window for integration testing
if (typeof window !== 'undefined') {
  (window as any).__fileTransferService = fileTransferService;
}
