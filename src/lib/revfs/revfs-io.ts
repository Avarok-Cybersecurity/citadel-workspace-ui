/**
 * RE-VFS I/O Router
 *
 * Executes RevfsIntents by calling the appropriate external services.
 * This is the ONLY module that performs side effects for RE-VFS.
 */

import type { RevfsIntent, RevfsIntentResult } from '@/types/revfs-intents';
import type { RevfsNode, RevfsPendingOp, RevfsOperation } from '@/types/revfs-types';
import { MessagingLayerType } from '@/types/messaging-layer';
import { P2PCommandType, serializeP2PCommand } from '@/types/p2p-types';
import type { P2PCommand, P2PMessagingLayerPayload } from '@/types/p2p-types';
import { RevfsOpfsStorage } from './opfs-storage';
import { eventEmitter } from '../event-emitter';

/** Timeout for backend file operations (30 seconds) */
const BACKEND_TIMEOUT_MS = 30000;

export interface RevfsIODeps {
  sendP2PMessageReliable: (localCid: bigint, peerCid: bigint, message: Uint8Array) => Promise<void>;
  getCurrentCid: () => Promise<bigint | null>;
  /** Send an internal service request (SendFile, DownloadFile, DeleteVirtualFile) */
  sendInternalServiceRequest: (request: unknown) => Promise<void>;
}

export class RevfsIO {
  private readonly storage = new RevfsOpfsStorage();
  private readonly deps: RevfsIODeps;

  constructor(deps: RevfsIODeps) {
    this.deps = deps;
  }

  async execute(intent: RevfsIntent): Promise<RevfsIntentResult> {
    switch (intent.type) {
      case 'send-revfs-op':
        return this.sendRevfsOp(intent.peerCid, intent.operation);
      case 'persist-tree':
        return this.persistTree(intent.treeKey, intent.tree);
      case 'load-tree':
        return this.loadTree(intent.treeKey);
      case 'persist-pending-ops':
        return this.persistPendingOps(intent.treeKey, intent.ops);
      case 'load-pending-ops':
        return this.loadPendingOps(intent.treeKey);
      case 'backend-send-file':
        return this.backendSendFile(intent.cid, intent.peerCid, intent.source, intent.virtualDir);
      case 'backend-download-file':
        return this.backendDownloadFile(intent.cid, intent.peerCid, intent.virtualDir);
      case 'backend-delete-file':
        return this.backendDeleteFile(intent.cid, intent.peerCid, intent.virtualDir);
    }
  }

  private async sendRevfsOp(peerCid: bigint, operation: RevfsOperation): Promise<RevfsIntentResult> {
    try {
      console.log(`[revfs] sendRevfsOp: op=${operation.op_type} path=${operation.path} peerCid=${peerCid}`);
      const localCid = await this.deps.getCurrentCid();
      if (!localCid) throw new Error('No local CID available');
      console.log(`[revfs] sendRevfsOp: localCid=${localCid}`);

      const payload: P2PMessagingLayerPayload = {
        layer: {
          type: MessagingLayerType.RevfsOperation,
          operation,
        },
        sender_cid: localCid,
        recipient_cid: peerCid,
        message_id: operation.op_id,
        index: 0,
      };

      const command: P2PCommand = {
        type: P2PCommandType.MessagingLayerCommand,
        payload,
      };

      const bytes = serializeP2PCommand(command);
      console.log(`[revfs] sendRevfsOp: sending ${bytes.length} bytes to peer ${peerCid}`);
      await this.deps.sendP2PMessageReliable(localCid, peerCid, bytes);
      console.log(`[revfs] sendRevfsOp: sent successfully`);
      return { type: 'send-revfs-op', success: true };
    } catch (err) {
      console.error('[RevfsIO] sendRevfsOp failed:', err);
      return { type: 'send-revfs-op', success: false };
    }
  }

  private async persistTree(key: string, tree: RevfsNode): Promise<RevfsIntentResult> {
    try {
      await this.storage.saveTree(key, tree);
      return { type: 'persist-tree', success: true };
    } catch (err) {
      console.error('[RevfsIO] persistTree failed:', err);
      return { type: 'persist-tree', success: false };
    }
  }

  private async loadTree(key: string): Promise<RevfsIntentResult> {
    const tree = await this.storage.loadTree(key);
    return { type: 'load-tree', tree };
  }

  private async persistPendingOps(key: string, ops: RevfsPendingOp[]): Promise<RevfsIntentResult> {
    try {
      await this.storage.savePendingOps(key, ops);
      return { type: 'persist-pending-ops', success: true };
    } catch (err) {
      console.error('[RevfsIO] persistPendingOps failed:', err);
      return { type: 'persist-pending-ops', success: false };
    }
  }

  private async loadPendingOps(key: string): Promise<RevfsIntentResult> {
    const ops = await this.storage.loadPendingOps(key);
    return { type: 'load-pending-ops', ops };
  }

  // ============================================================================
  // Backend File Operations (wired to WASM client)
  // ============================================================================

  /**
   * Send a file via the Citadel protocol.
   * - If peerCid is bigint: file is stored in peer's virtual file system (P2P)
   * - If peerCid is null: file is stored on server (server storage)
   */
  private async backendSendFile(
    cid: bigint, peerCid: bigint | null, source: string, virtualDir: string,
  ): Promise<RevfsIntentResult> {
    const requestId = crypto.randomUUID();
    const isServerStorage = peerCid === null;
    console.log(`[RevfsIO] backendSendFile: source=${source} virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

    const request = {
      SendFile: {
        request_id: requestId,
        source,
        cid,
        peer_cid: peerCid, // null for server storage
        chunk_size: null, // Use default
        transfer_type: 'FileTransfer',
      },
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        console.error('[RevfsIO] backendSendFile timed out');
        resolve({ type: 'backend-send-file', success: false });
      }, BACKEND_TIMEOUT_MS);

      const handleMessage = (message: unknown) => {
        const msg = message as Record<string, unknown>;

        // Check for SendFileRequestSuccess
        const success = msg.SendFileRequestSuccess as { request_id?: string } | undefined;
        if (success?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.log('[RevfsIO] backendSendFile success');
          resolve({ type: 'backend-send-file', success: true, virtualDir });
        }

        // Check for SendFileRequestFailure
        const failure = msg.SendFileRequestFailure as { request_id?: string; message?: string } | undefined;
        if (failure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.error('[RevfsIO] backendSendFile failed:', failure.message);
          resolve({ type: 'backend-send-file', success: false });
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.deps.sendInternalServiceRequest(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        console.error('[RevfsIO] backendSendFile request error:', error);
        resolve({ type: 'backend-send-file', success: false });
      });
    });
  }

  /**
   * Download a file via the Citadel protocol.
   * - If peerCid is bigint: download from peer's virtual file system (P2P)
   * - If peerCid is null: download from server storage
   * Returns the local download path on success.
   */
  private async backendDownloadFile(
    cid: bigint, peerCid: bigint | null, virtualDir: string,
  ): Promise<RevfsIntentResult> {
    const requestId = crypto.randomUUID();
    const isServerStorage = peerCid === null;
    console.log(`[RevfsIO] backendDownloadFile: virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

    const request = {
      DownloadFile: {
        request_id: requestId,
        virtual_directory: virtualDir,
        cid,
        peer_cid: peerCid, // null for server storage
        security_level: 'Standard',
        delete_on_pull: false,
      },
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        console.error('[RevfsIO] backendDownloadFile timed out');
        resolve({ type: 'backend-download-file', success: false });
      }, BACKEND_TIMEOUT_MS);

      const handleMessage = (message: unknown) => {
        const msg = message as Record<string, unknown>;

        // Check for FileTransferStatusNotification with download completion
        const status = msg.FileTransferStatusNotification as {
          cid?: bigint;
          peer_cid?: bigint;
          success?: boolean;
          response?: { download_path?: string };
        } | undefined;

        if (status && status.cid === cid) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          if (status.success) {
            const downloadPath = status.response?.download_path;
            console.log('[RevfsIO] backendDownloadFile success:', downloadPath);
            resolve({ type: 'backend-download-file', success: true, downloadPath });
          } else {
            console.error('[RevfsIO] backendDownloadFile transfer failed');
            resolve({ type: 'backend-download-file', success: false });
          }
        }

        // Check for DownloadFileFailure
        const failure = msg.DownloadFileFailure as { request_id?: string; message?: string } | undefined;
        if (failure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.error('[RevfsIO] backendDownloadFile failed:', failure.message);
          resolve({ type: 'backend-download-file', success: false });
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.deps.sendInternalServiceRequest(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        console.error('[RevfsIO] backendDownloadFile request error:', error);
        resolve({ type: 'backend-download-file', success: false });
      });
    });
  }

  /**
   * Delete a file via the Citadel protocol.
   * - If peerCid is bigint: delete from peer's virtual file system (P2P)
   * - If peerCid is null: delete from server storage
   */
  private async backendDeleteFile(
    cid: bigint, peerCid: bigint | null, virtualDir: string,
  ): Promise<RevfsIntentResult> {
    const requestId = crypto.randomUUID();
    const isServerStorage = peerCid === null;
    console.log(`[RevfsIO] backendDeleteFile: virtualDir=${virtualDir} requestId=${requestId} scope=${isServerStorage ? 'server' : 'peer'}`);

    const request = {
      DeleteVirtualFile: {
        request_id: requestId,
        virtual_directory: virtualDir,
        cid,
        peer_cid: peerCid, // null for server storage
      },
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        eventEmitter.off('websocket-message', handleMessage);
        console.error('[RevfsIO] backendDeleteFile timed out');
        resolve({ type: 'backend-delete-file', success: false });
      }, BACKEND_TIMEOUT_MS);

      const handleMessage = (message: unknown) => {
        const msg = message as Record<string, unknown>;

        // Check for DeleteVirtualFileSuccess
        const success = msg.DeleteVirtualFileSuccess as { request_id?: string } | undefined;
        if (success?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.log('[RevfsIO] backendDeleteFile success');
          resolve({ type: 'backend-delete-file', success: true });
        }

        // Check for DeleteVirtualFileFailure
        const failure = msg.DeleteVirtualFileFailure as { request_id?: string; message?: string } | undefined;
        if (failure?.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          console.error('[RevfsIO] backendDeleteFile failed:', failure.message);
          resolve({ type: 'backend-delete-file', success: false });
        }
      };

      eventEmitter.on('websocket-message', handleMessage);

      this.deps.sendInternalServiceRequest(request).catch(error => {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        console.error('[RevfsIO] backendDeleteFile request error:', error);
        resolve({ type: 'backend-delete-file', success: false });
      });
    });
  }
}
