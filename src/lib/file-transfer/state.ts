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

  /** The shape a peer gets when nothing has been saved for them. */
  static readonly DEFAULT_SETTINGS: FileTransferSettings = {
    autoAccept: false,
    maxFileSize: FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
    transferMode: 'browser',
    allowRevfsStorage: true, // Default to true for RE-VFS file browser functionality
    revfsQuota: REVFS_DEFAULT_QUOTA_BYTES,
  };

  getSettings(peerCid: string): FileTransferSettings {
    const stored = this.peerSettings.get(peerCid);

    // Merge OVER the defaults rather than returning the stored object as-is.
    //
    // These come from localStorage, written by whatever version of the app the
    // user last ran. Returning the blob verbatim means every field added after
    // they saved arrives `undefined`: `allowRevfsStorage` reads as off, silently
    // disabling RE-VFS for that peer, and `revfsQuota` shows as `NaN` MB in the
    // settings UI. Nothing has shipped in that state yet — this closes the class
    // before the next field does it.
    return { ...FileTransferState.DEFAULT_SETTINGS, ...stored };
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

}

// The pending-file stash, received-chunk buffers and received-file blobs that
// used to live here served the message-plane chunk transfer — a second
// implementation nothing ever emitted (its chunk messages had no producers).
// The bytes of a real transfer never pass through browser state at all: they
// leave inside the SendFile request and arrive on disk at the path the
// ReceptionBeginning tick names.
