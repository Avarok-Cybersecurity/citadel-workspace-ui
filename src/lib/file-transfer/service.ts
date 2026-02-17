/**
 * FileTransferService - Thin Orchestrator
 *
 * Delegates to: async-transfers, p2p-transfers, transfer-lifecycle.
 * State Machine: PENDING -> UPLOADING -> STAGED -> TRANSFERRING -> COMPLETE
 */

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
import {
  streamFileToRecipient, handleTransferProgress, handleTransferComplete,
  handleTransferCancel, handleTransferChunk,
} from './p2p-transfers';
import {
  sendFile, sendFileWithNativePicker, cancelTransfer, acceptTransfer, declineTransfer,
} from './transfer-lifecycle';

export class FileTransferService {
  private static instance: FileTransferService;

  private readonly state = new FileTransferState();
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
  getSettings(peerCid: string): FileTransferSettings { return this.state.getSettings(peerCid); }
  getAutoAccept(peerCid: string): boolean { return this.state.getSettings(peerCid).autoAccept; }
  getTransferMode(peerCid: string): TransferModePreference { return this.state.getSettings(peerCid).transferMode; }

  private async updateSetting<K extends keyof FileTransferSettings>(
    peerCid: string, key: K, value: FileTransferSettings[K]
  ): Promise<void> {
    const settings = this.state.getSettings(peerCid);
    settings[key] = value;
    this.state.setSettings(peerCid, settings);
    await this.saveSettings(peerCid, settings);
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
  }

  private async handleFileTransferMessage(message: IncomingFileTransferMessage): Promise<void> {
    const { layer: rawLayer, senderCid } = message;
    const layer = rawLayer as MessagingLayer;
    const deps = this.deps;

    if (isFileTransferRequest(layer)) {
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

  // @human-review Persistence requires LocalDB integration
  private async loadFromStorage(): Promise<void> {
    debugLog('FileTransferService', 'Loading from storage');
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
  debugLog('FileTransferService', 'Auto-initialization failed:', err);
});

// Expose for testing
if (typeof window !== 'undefined') {
  window.__fileTransferService = fileTransferService;
}
