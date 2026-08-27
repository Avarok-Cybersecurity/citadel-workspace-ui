/**
 * FileTransferService - Thin Orchestrator
 *
 * Delegates to: async-transfers, p2p-transfers, transfer-lifecycle.
 * State Machine: PENDING -> UPLOADING -> STAGED -> TRANSFERRING -> COMPLETE
 */

import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { eventEmitter } from '../event-emitter';
import {
  type MessagingLayer, type FileTransferMode,
  isFileTransferRequest, isFileTransferResponse, isFileTransferProgress,
  isFileTransferComplete, isFileTransferCancel, isFileTransferChunk,
} from '@/types/messaging-layer';
import { FileTransferState } from './state';
import { FileTransferIO } from './io';
import { FILE_TRANSFER_EVENTS } from './events';
import type { IFileTransferIORouter } from './io-router';
import type {
  FileTransfer, FileTransferSettings, TransferProgressEvent,
  TransferModePreference, IncomingFileTransferMessage,
} from './types';
import { debugLog } from '@/lib/debug-config';
import { handleAsyncSend, handleTransferRequest, handleTransferResponse } from './async-transfers';
import { ProtocolOfferCorrelator } from './protocol-offer-correlation';
import {
  streamFileToRecipient, handleTransferProgress,
  handleTransferCancel, handleTransferChunk,
} from './p2p-transfers';
import { handleTransferComplete } from './transfer-outcome';
import {
  sendFile, sendFileWithNativePicker, cancelTransfer, acceptTransfer, declineTransfer,
} from './transfer-lifecycle';

export class FileTransferService {
  private static instance: FileTransferService;

  private readonly state = new FileTransferState();
  private readonly correlator = new ProtocolOfferCorrelator((transferId, objectId) =>
    this.io.registerTransferMapping(transferId, objectId)
  );
  private io: FileTransferIO;
  private initialized = false;

  private constructor() {
    this.io = new FileTransferIO();
  }

  static getInstance(): FileTransferService {
    if (!FileTransferService.instance) {
      FileTransferService.instance = new FileTransferService();
    }
    return FileTransferService.instance;
  }

  setIORouter(router: FileTransferIO): void {
    this.io.dispose();
    this.io = router;
    debugLog('FileTransferService', 'I/O router swapped', {
      routerType: router.constructor.name,
    });
  }

  getIORouter(): IFileTransferIORouter {
    return this.io;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.setupMessageHandlers();
    await this.loadFromStorage();
    this.initialized = true;
    debugLog('FileTransferService', 'Initialized');
  }

  private get deps() {
    return {
      state: this.state,
      io: this.io,
      emitStateChange: this.emitStateChange.bind(this),
      saveTransfer: this.saveTransfer.bind(this),
      saveSettings: this.saveSettings.bind(this),
      handleAsyncSend: (t: FileTransfer, f: File) => handleAsyncSend(this.deps, t, f),
    };
  }

  async sendFile(recipientCid: string, file: File, mode: FileTransferMode): Promise<string> {
    return sendFile(this.deps, recipientCid, file, mode);
  }

  async sendFileWithNativePicker(
    recipientCid: string,
    title?: string,
    allowedExtensions?: string[]
  ): Promise<string> {
    return sendFileWithNativePicker(this.deps, recipientCid, title, allowedExtensions);
  }

  async cancelTransfer(transferId: string): Promise<void> {
    return cancelTransfer(this.deps, transferId);
  }

  async acceptTransfer(transferId: string): Promise<void> {
    return acceptTransfer(this.deps, transferId);
  }

  async declineTransfer(transferId: string, reason?: string): Promise<void> {
    return declineTransfer(this.deps, transferId, reason);
  }

  // Settings
  /**
   * Per-peer settings are scoped to the ACCOUNT that set them.
   *
   * They were keyed by peer CID alone, and this browser holds several sessions
   * at once — so one account enabling "auto-accept files from X" made every
   * other account in the same browser auto-accept from X too. A security
   * setting inherited by an account that never agreed to it.
   *
   * A missing own-CID falls back to the bare peer key rather than inventing a
   * scope: settings written before a session is established belong to no
   * account, and silently filing them under one would be worse.
   */
  private scopedKey(peerCid: string): string {
    const own = instanceManager.cid;
    return own ? `${own.toString()}:${peerCid}` : peerCid;
  }

  getSettings(peerCid: string): FileTransferSettings { return this.state.getSettings(this.scopedKey(peerCid)); }
  getAutoAccept(peerCid: string): boolean { return this.state.getSettings(this.scopedKey(peerCid)).autoAccept; }
  getTransferMode(peerCid: string): TransferModePreference { return this.state.getSettings(this.scopedKey(peerCid)).transferMode; }

  private async updateSetting<K extends keyof FileTransferSettings>(
    peerCid: string, key: K, value: FileTransferSettings[K]
  ): Promise<void> {
    const key_ = this.scopedKey(peerCid);
    const settings = this.state.getSettings(key_);
    settings[key] = value;
    this.state.setSettings(key_, settings);
    await this.saveSettings(key_, settings);
  }

  async setAutoAccept(peerCid: string, enabled: boolean): Promise<void> { return this.updateSetting(peerCid, 'autoAccept', enabled); }
  async setMaxFileSize(peerCid: string, maxBytes: number): Promise<void> { return this.updateSetting(peerCid, 'maxFileSize', maxBytes); }
  async setTransferMode(peerCid: string, mode: TransferModePreference): Promise<void> { return this.updateSetting(peerCid, 'transferMode', mode); }
  async setAllowRevfsStorage(peerCid: string, allowed: boolean): Promise<void> { return this.updateSetting(peerCid, 'allowRevfsStorage', allowed); }
  async setRevfsQuota(peerCid: string, quotaBytes: number): Promise<void> { return this.updateSetting(peerCid, 'revfsQuota', quotaBytes); }

  // Query / Retrieval

  onProgress(transferId: string, callback: (p: TransferProgressEvent) => void): () => void {
    return this.state.addProgressCallback(transferId, callback);
  }

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

  private setupMessageHandlers(): void {
    eventEmitter.on('p2p:file-transfer-message', this.handleFileTransferMessage.bind(this));

    // The protocol half of every incoming transfer. Without this subscription
    // nothing ever learned the object_id, so accept could not name the transfer
    // the bytes arrive under — `onTransferRequest` existed with no callers, and
    // `registerTransferMapping` was written for this join and never invoked.
    this.io.onTransferRequest((event) => {
      // name and size are optional on the event type, but the protocol
      // notification always carries both (`metadata.name` / `metadata.file_size`).
      // Without them there is nothing to join on, so say so rather than
      // correlating against undefined and matching the wrong transfer.
      if (event.fileName === undefined || event.fileSize === undefined) {
        debugLog('FileTransferService', 'protocol offer without name/size; cannot correlate', {
          protocolId: event.protocolId,
        });
        return;
      }
      this.correlator.noteProtocolOffer(
        event.protocolId,
        event.peerCid.toString(),
        event.fileName,
        event.fileSize
      );
    });
  }

  private async handleFileTransferMessage(message: IncomingFileTransferMessage): Promise<void> {
    const { layer: rawLayer, senderCid } = message;
    const layer = rawLayer as MessagingLayer;
    const deps = this.deps;

    if (isFileTransferRequest(layer)) {
      // Join the two halves BEFORE handleTransferRequest, because auto-accept
      // fires from inside it — and an accept that cannot name the object_id is
      // exactly the failure this correlation exists to prevent.
      this.correlator.noteMessageOffer(
        layer.transfer_id,
        senderCid,
        layer.file_name,
        layer.file_size
      );
      await handleTransferRequest(
        deps, layer, senderCid,
        (cid) => this.getAutoAccept(cid),
        (id) => this.acceptTransfer(id)
      );
    } else if (isFileTransferResponse(layer)) {
      await handleTransferResponse(
        deps, layer, senderCid,
        (t, f) => streamFileToRecipient(deps, t, f)
      );
    } else if (isFileTransferProgress(layer)) {
      await handleTransferProgress(deps, layer, senderCid);
    } else if (isFileTransferComplete(layer)) {
      await handleTransferComplete(deps, layer, senderCid);
    } else if (isFileTransferCancel(layer)) {
      await handleTransferCancel(deps, layer, senderCid);
    } else if (isFileTransferChunk(layer)) {
      await handleTransferChunk(deps, layer, senderCid);
    }
  }

  private emitStateChange(transfer: FileTransfer): void {
    eventEmitter.emit(FILE_TRANSFER_EVENTS.STATE_CHANGED, transfer);
    this.io.notifyStateChange(transfer);
  }

  private static readonly STORAGE_KEY_TRANSFERS = 'citadel:file-transfers';
  private static readonly STORAGE_KEY_SETTINGS = 'citadel:file-transfer-settings';

  private async loadFromStorage(): Promise<void> {
    try {
      const settingsRaw = localStorage.getItem(FileTransferService.STORAGE_KEY_SETTINGS);
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw) as Record<string, FileTransferSettings>;
        for (const [peerCid, settings] of Object.entries(parsed)) {
          this.state.setSettings(peerCid, settings);
        }
      }
      debugLog('FileTransferService', 'Loaded settings from storage');
    } catch (error) {
      debugLog('FileTransferService', 'Failed to load from storage:', error);
    }
  }

  private async saveTransfer(transfer: FileTransfer): Promise<void> {
    try {
      const raw = localStorage.getItem(FileTransferService.STORAGE_KEY_TRANSFERS);
      const transfers: Record<string, Partial<FileTransfer>> = raw ? JSON.parse(raw) : {};
      // Store only serializable metadata (no Blob/File)
      transfers[transfer.id] = {
        id: transfer.id,
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        fileType: transfer.fileType,
        senderCid: transfer.senderCid,
        recipientCid: transfer.recipientCid,
        state: transfer.state,
        isIncoming: transfer.isIncoming,
        mode: transfer.mode,
        createdAt: transfer.createdAt,
        updatedAt: transfer.updatedAt,
      };
      localStorage.setItem(FileTransferService.STORAGE_KEY_TRANSFERS, JSON.stringify(transfers));
    } catch {
      // Silently fail — localStorage may be full
    }
  }

  private async saveSettings(peerCid: string, settings: FileTransferSettings): Promise<void> {
    try {
      const raw = localStorage.getItem(FileTransferService.STORAGE_KEY_SETTINGS);
      const all: Record<string, FileTransferSettings> = raw ? JSON.parse(raw) : {};
      all[peerCid] = settings;
      localStorage.setItem(FileTransferService.STORAGE_KEY_SETTINGS, JSON.stringify(all));
    } catch {
      // Silently fail
    }
  }
}

// Export singleton instance
export const fileTransferService = FileTransferService.getInstance();

// Auto-initialize
fileTransferService.initialize().catch(err => {
  debugLog('FileTransferService', 'Auto-initialization failed:', err);
});

// Expose for testing
if (typeof window !== 'undefined') {
  window.__fileTransferService = fileTransferService;
}
