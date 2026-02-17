/** Receive Operations - RespondFileTransfer, DownloadFile, subscription factories, tick parser. */

import { eventEmitter } from '../event-emitter';
import { websocketService } from '../websocket-service';
import { isVariant } from 'citadel-workspace-client-ts';
import type {
  RespondTransferParams, DownloadFileParams, TransferRequestEvent,
  TransferProgressEvent, TransferCompleteEvent, TransferStatusEvent,
} from './io-router-types';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';
import type {
  FileTransferRequestNotification, FileTransferStatusNotification,
  FileTransferTickNotification, ObjectTransferStatus,
} from './protocol-types';

export async function executeRespondToTransfer(params: RespondTransferParams): Promise<void> {
  const requestId = crypto.randomUUID();
  const request = {
    RespondFileTransfer: {
      request_id: requestId,
      cid: params.cid,
      peer_cid: params.peerCid,
      object_id: BigInt(params.protocolId),
      accept: params.accept,
      download_location: params.downloadLocation ?? null,
    },
  };

  debugLog('receive-operations', 'Sending RespondFileTransfer', {
    requestId,
    cid: params.cid.toString(),
    peerCid: params.peerCid.toString(),
    objectId: params.protocolId,
    accept: params.accept,
  });

  await websocketService.sendRequest(request);
}

export async function executeDownloadFile(params: DownloadFileParams): Promise<void> {
  const requestId = crypto.randomUUID();
  const request = {
    DownloadFile: {
      request_id: requestId,
      virtual_directory: params.virtualDirectory,
      cid: params.cid,
      peer_cid: params.peerCid,
      security_level: params.securityLevel ?? null,
      delete_on_pull: params.deleteOnPull ?? false,
    },
  };

  debugLog('receive-operations', 'Sending DownloadFile', {
    requestId,
    virtualDirectory: params.virtualDirectory,
    cid: params.cid.toString(),
    peerCid: params.peerCid?.toString(),
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      eventEmitter.off('websocket-message', handleMessage);
      reject(new Error('DownloadFile request timed out'));
    }, TIMEOUT.FILE_DOWNLOAD_MS);

    const handleMessage = (message: Record<string, unknown>) => {
      const success = message.DownloadFileSuccess as { request_id?: string } | undefined;
      const failure = message.DownloadFileFailure as
        | { request_id?: string; message?: string }
        | undefined;

      if (success?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('receive-operations', 'DownloadFile success');
        resolve();
      }

      if (failure?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        const errorMsg = failure.message || 'DownloadFile failed';
        debugLog('receive-operations', 'DownloadFile failed', errorMsg);
        reject(new Error(errorMsg));
      }
    };

    eventEmitter.on('websocket-message', handleMessage);

    websocketService.sendRequest(request).catch(error => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      reject(error);
    });
  });
}

export function createTransferRequestHandler(
  callback: (event: TransferRequestEvent) => void
): (message: Record<string, unknown>) => void {
  return (message: Record<string, unknown>) => {
    const notification = message.FileTransferRequestNotification as
      | FileTransferRequestNotification
      | undefined;

    if (notification) {
      const objectId = notification.metadata.object_id.toString();
      callback({
        cid: notification.cid, peerCid: notification.peer_cid, protocolId: objectId,
        fileName: notification.metadata.name, fileSize: Number(notification.metadata.file_size),
        fileType: notification.metadata.mime_type,
        transferMode: undefined, thumbnail: undefined, expiresAt: undefined, virtualPath: undefined,
      });
    }
  };
}

export function createProgressHandler(
  callback: (event: TransferProgressEvent) => void,
  objectIdToTransferId: Map<string, string>
): (message: Record<string, unknown>) => void {
  return (message: Record<string, unknown>) => {
    const notification = message.FileTransferTickNotification as
      | FileTransferTickNotification
      | undefined;

    if (notification) {
      const progressEvent = parseTickStatus(notification.status);
      if (progressEvent) {
        const transferId =
          objectIdToTransferId.get(progressEvent.protocolId) || progressEvent.protocolId;
        callback({
          transferId,
          protocolId: progressEvent.protocolId,
          bytesTransferred: progressEvent.bytesTransferred,
          totalBytes: progressEvent.totalBytes,
          percentage: progressEvent.percentage,
          status: progressEvent.status,
        });
      }
    }
  };
}

export function createCompleteHandler(
  callback: (event: TransferCompleteEvent) => void,
  objectIdToTransferId: Map<string, string>
): (message: Record<string, unknown>) => void {
  return (message: Record<string, unknown>) => {
    const notification = message.FileTransferTickNotification as
      | FileTransferTickNotification
      | undefined;

    if (notification) {
      const status = notification.status;
      let objectId: string | undefined;
      let success = false;
      let errorMessage: string | undefined;

      if (isVariant(status, 'TransferComplete')) {
        objectId = status.TransferComplete.object_id.toString();
        success = true;
      } else if (isVariant(status, 'ReceptionComplete')) {
        objectId = status.ReceptionComplete.object_id.toString();
        success = true;
      } else if (isVariant(status, 'Fail')) {
        objectId = status.Fail.object_id.toString();
        success = false;
        errorMessage = status.Fail.message;
      }

      if (objectId !== undefined) {
        const transferId = objectIdToTransferId.get(objectId) || objectId;
        callback({ transferId, protocolId: objectId, success, errorMessage });
      }
    }
  };
}

export function createStatusChangeHandler(
  callback: (event: TransferStatusEvent) => void,
  objectIdToTransferId: Map<string, string>
): (message: Record<string, unknown>) => void {
  return (message: Record<string, unknown>) => {
    const notification = message.FileTransferStatusNotification as
      | FileTransferStatusNotification
      | undefined;

    if (notification) {
      const objectId = notification.object_id.toString();
      callback({
        protocolId: objectId,
        cid: notification.cid,
        success: notification.success,
        accepted: notification.response && notification.success,
        message: notification.message,
      });
    }
  };
}

export function parseTickStatus(
  status: ObjectTransferStatus
): {
  protocolId: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: 'uploading' | 'downloading' | 'complete' | 'failed';
} | null {
  if (isVariant(status, 'TransferTick')) {
    const tick = status.TransferTick;
    const sent = Number(tick.sent);
    const total = Number(tick.total);
    return {
      protocolId: tick.object_id.toString(),
      bytesTransferred: sent,
      totalBytes: total,
      percentage: total > 0 ? Math.round((sent / total) * 100) : 0,
      status: 'uploading',
    };
  }
  if (isVariant(status, 'ReceptionTick')) {
    const tick = status.ReceptionTick;
    const received = Number(tick.received);
    const total = Number(tick.total);
    return {
      protocolId: tick.object_id.toString(),
      bytesTransferred: received,
      totalBytes: total,
      percentage: total > 0 ? Math.round((received / total) * 100) : 0,
      status: 'downloading',
    };
  }
  if (isVariant(status, 'ReceptionBeginning')) {
    const tick = status.ReceptionBeginning;
    return {
      protocolId: tick.object_id.toString(),
      bytesTransferred: 0,
      totalBytes: Number(tick.total_length),
      percentage: 0,
      status: 'downloading',
    };
  }

  return null;
}
