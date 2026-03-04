/**
 * Send Operations
 *
 * Outbound file transfer operations for the real protocol I/O router:
 * - SendFile: Initiate file transfer via InternalServiceRequest
 * - CancelTransfer: Clean up local state (protocol cancels implicitly)
 * - sendChunk / sendComplete: Stubs (SDK handles these automatically)
 */

import { eventEmitter } from '../event-emitter';
import { websocketService } from '../websocket-service';
import type { FileSource } from './io-router-types';
import type { SendFileParams, SendFileResult, CancelTransferParams } from './io-router-types';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';

interface SendFileSuccessResponse {
  cid: bigint;
  request_id?: string;
}

interface SendFileFailureResponse {
  cid: bigint;
  message: string;
  request_id?: string;
}

/**
 * Send a file via the real Citadel protocol (SendFile InternalServiceRequest).
 */
export async function executeSendFile(
  params: SendFileParams
): Promise<SendFileResult> {
  let source: FileSource;

  if (typeof params.source === 'string') {
    source = { Path: params.source };
  } else if (params.pickFileRequestId) {
    source = { PickFileRef: { pick_file_request_id: params.pickFileRequestId } };
  } else if (params.source instanceof File && params.source.size > 0) {
    // Read browser File as bytes and send as ByteContents
    const buffer = await params.source.arrayBuffer();
    source = {
      ByteContents: {
        file_name: params.source.name,
        data: Array.from(new Uint8Array(buffer)),
      },
    };
    debugLog('send-operations', 'Converted browser File to ByteContents', {
      fileName: params.source.name,
      size: params.source.size,
    });
  } else {
    throw new Error(
      'RealProtocolIORouter requires file path (string), pickFileRequestId, or a non-empty browser File object.'
    );
  }

  const requestId = crypto.randomUUID();
  const request = {
    SendFile: {
      request_id: requestId,
      source,
      cid: params.cid,
      peer_cid: params.peerCid,
      chunk_size: params.chunkSize ?? null,
      transfer_type: 'FileTransfer',
    },
  };

  debugLog('send-operations', 'Sending SendFile request', {
    requestId,
    source,
    cid: params.cid.toString(),
    peerCid: params.peerCid?.toString(),
    transferId: params.transferId,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      eventEmitter.off('websocket-message', handleMessage);
      reject(new Error('SendFile request timed out'));
    }, TIMEOUT.FILE_SEND_MS);

    const handleMessage = (message: Record<string, unknown>) => {
      const success = message.SendFileRequestSuccess as SendFileSuccessResponse | undefined;
      const failure = message.SendFileRequestFailure as SendFileFailureResponse | undefined;

      if (success?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        debugLog('send-operations', 'SendFile accepted');
        resolve({
          protocolId: params.transferId,
          transferId: params.transferId,
        });
      }

      if (failure?.request_id === requestId) {
        clearTimeout(timeout);
        eventEmitter.off('websocket-message', handleMessage);
        const errorMsg = failure.message || 'SendFile failed';
        debugLog('send-operations', 'SendFile failed', errorMsg);
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

/**
 * Cancel a transfer - cleans up local correlation maps.
 * The real protocol cancels implicitly when either side disconnects.
 */
export function executeCancelTransfer(
  params: CancelTransferParams,
  transferIdToObjectId: Map<string, string>,
  objectIdToTransferId: Map<string, string>
): void {
  debugLog('send-operations', 'cancelTransfer called', {
    transferId: params.transferId,
    targetCid: params.targetCid.toString(),
    reason: params.reason,
  });

  const objectId = transferIdToObjectId.get(params.transferId);
  if (objectId) {
    objectIdToTransferId.delete(objectId);
    transferIdToObjectId.delete(params.transferId);
  }
}

/**
 * sendChunk is not supported - the Citadel SDK handles chunking internally.
 */
export function throwChunkNotSupported(): never {
  throw new Error(
    'sendChunk not supported by RealProtocolIORouter. ' +
    'Chunking is handled automatically by the Citadel SDK.'
  );
}

/**
 * sendComplete is not supported - the Citadel SDK signals completion automatically.
 */
export function throwCompleteNotSupported(): never {
  throw new Error(
    'sendComplete not supported by RealProtocolIORouter. ' +
    'Completion is signaled automatically by the Citadel SDK.'
  );
}
