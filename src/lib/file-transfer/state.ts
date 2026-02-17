/**
 * File Transfer State Manager
 *
 * Manages all transfer state without performing I/O.
 * Follows SBIO principle - pure state operations only.
 */

import type {
  FileTransfer,
  FileTransferSettings,
  TransferProgressEvent,
} from './types';
import {
  FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
  REVFS_DEFAULT_QUOTA_BYTES,
} from '@/types/messaging-layer';

export class FileTransferState {
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

  // Map to store received file blobs for retrieval
  private receivedFiles: Map<string, Blob> = new Map();

  // ============================================================================
  // Transfer Operations
  // ============================================================================

  getTransfer(transferId: string): FileTransfer | undefined {
    return this.transfers.get(transferId);
  }

  setTransfer(transfer: FileTransfer): void {
    this.transfers.set(transfer.id, transfer);
  }

  deleteTransfer(transferId: string): boolean {
    return this.transfers.delete(transferId);
  }

  getAllTransfers(): FileTransfer[] {
    return Array.from(this.transfers.values());
  }

  getTransfersForPeer(peerCid: string): FileTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => t.senderCid === peerCid || t.recipientCid === peerCid
    );
  }

  getPendingIncoming(): FileTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => t.isIncoming && (t.state === 'pending' || t.state === 'staged')
    );
  }

  getActiveTransfers(): FileTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => ['pending', 'uploading', 'staged', 'transferring'].includes(t.state)
    );
  }

  // ============================================================================
  // Settings Operations
  // ============================================================================

  getSettings(peerCid: string): FileTransferSettings {
    const stored = this.peerSettings.get(peerCid);
    if (stored) return stored;

    // Return defaults
    return {
      autoAccept: false,
      maxFileSize: FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
      transferMode: 'browser',
      allowRevfsStorage: true, // Default to true for RE-VFS file browser functionality
      revfsQuota: REVFS_DEFAULT_QUOTA_BYTES,
    };
  }

  setSettings(peerCid: string, settings: FileTransferSettings): void {
    this.peerSettings.set(peerCid, settings);
  }

  // ============================================================================
  // Progress Callbacks
  // ============================================================================

  addProgressCallback(
    transferId: string,
    callback: (progress: TransferProgressEvent) => void
  ): () => void {
    if (!this.progressCallbacks.has(transferId)) {
      this.progressCallbacks.set(transferId, []);
    }
    this.progressCallbacks.get(transferId)?.push(callback);

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

  getProgressCallbacks(transferId: string): ((progress: TransferProgressEvent) => void)[] {
    return this.progressCallbacks.get(transferId) || [];
  }

  notifyProgressCallbacks(transferId: string, event: TransferProgressEvent): void {
    const callbacks = this.progressCallbacks.get(transferId);
    if (callbacks) {
      callbacks.forEach(cb => cb(event));
    }
  }

  // ============================================================================
  // Pending Files (for P2P streaming)
  // ============================================================================

  getPendingFile(transferId: string): File | undefined {
    return this.pendingFiles.get(transferId);
  }

  setPendingFile(transferId: string, file: File): void {
    this.pendingFiles.set(transferId, file);
  }

  deletePendingFile(transferId: string): boolean {
    return this.pendingFiles.delete(transferId);
  }

  // ============================================================================
  // Received Chunks (for incoming P2P transfers)
  // ============================================================================

  getReceivedChunks(transferId: string): { data: string; index: number }[] | undefined {
    return this.receivedChunks.get(transferId);
  }

  initReceivedChunks(transferId: string): void {
    if (!this.receivedChunks.has(transferId)) {
      this.receivedChunks.set(transferId, []);
    }
  }

  addReceivedChunk(transferId: string, chunk: { data: string; index: number }): void {
    const chunks = this.receivedChunks.get(transferId);
    if (chunks) {
      chunks.push(chunk);
    }
  }

  getReceivedChunkCount(transferId: string): number {
    return this.receivedChunks.get(transferId)?.length ?? 0;
  }

  deleteReceivedChunks(transferId: string): boolean {
    return this.receivedChunks.delete(transferId);
  }

  // ============================================================================
  // Received Files (completed downloads)
  // ============================================================================

  getReceivedFile(transferId: string): Blob | undefined {
    return this.receivedFiles.get(transferId);
  }

  setReceivedFile(transferId: string, blob: Blob): void {
    this.receivedFiles.set(transferId, blob);
  }

  deleteReceivedFile(transferId: string): boolean {
    return this.receivedFiles.delete(transferId);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  cleanupTransfer(transferId: string): void {
    this.pendingFiles.delete(transferId);
    this.receivedChunks.delete(transferId);
    // Note: Don't delete receivedFiles - user may still want to download
  }
}
