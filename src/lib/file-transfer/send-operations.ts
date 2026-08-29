/**
 * Send Operations
 *
 * Outbound file transfer operations for the real protocol I/O router:
 * - SendFile: Initiate file transfer via InternalServiceRequest
 * - CancelTransfer: Clean up local state (protocol cancels implicitly)
 */

import { eventEmitter } from '../event-emitter';
import { failOnSocketLoss } from '../websocket/request-response';
import { formatBytes } from '../format-bytes';
import { websocketService } from '../websocket-service';
import type { FileSource, SendFileParams, SendFileResult, CancelTransferParams } from './io-router-types';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';

/**
 * Hard ceiling on `FileSource.ByteContents` payloads.
 *
 * `Array.from(new Uint8Array(buffer))` materialises the entire file as a
 * boxed-number JavaScript array, which uses roughly 4-8 bytes per byte of
 * file data on V8. The subsequent CBOR / WebSocket-frame serialisation
 * allocates roughly the same volume again. A 100 MB file therefore lands
 * north of half a gigabyte of transient heap and reliably crashes the tab.
 *
 * Larger uploads must go through the native PickFile flow which streams
 * from disk. This constant is intentionally conservative; raise it only
 * alongside memory-usage measurements.
 */
export const MAX_BYTE_CONTENTS_SIZE_BYTES: number = 2 * 1024 * 1024; // 2 MiB


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
    // Size guard: refuse payloads that would OOM the tab when converted
    // to a boxed-number JS array. Check BEFORE calling arrayBuffer() so
    // we fail fast without allocating the buffer at all.
    if (params.source.size > MAX_BYTE_CONTENTS_SIZE_BYTES) {
      throw new Error(
        `File "${params.source.name}" is ${formatBytes(params.source.size)}; ` +
          `inline browser uploads are capped at ${formatBytes(MAX_BYTE_CONTENTS_SIZE_BYTES)}. ` +
          `Use the native file picker for larger files.`
      );
    }

    // Read browser File as bytes and send as ByteContents
    const buffer: ArrayBuffer = await params.source.arrayBuffer();
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

  // Never log `source` verbatim: for a browser `File` it carries the entire
  // file as a `data: number[]`, which would dump (potentially secret) file
  // contents into dev logs and allocate/format a huge array on every inline
  // transfer. Log a redacted summary instead.
  const sourceSummary =
    'ByteContents' in source
      ? {
          kind: 'ByteContents' as const,
          fileName: source.ByteContents.file_name,
          byteLength: source.ByteContents.data.length,
        }
      : source;
  debugLog('send-operations', 'Sending SendFile request', {
    requestId,
    source: sourceSummary,
    cid: params.cid.toString(),
    peerCid: params.peerCid?.toString(),
    transferId: params.transferId,
  });

  return failOnSocketLoss('SendFile', new Promise((resolve, reject) => {
    const timeout: NodeJS.Timeout = setTimeout((): void => {
      eventEmitter.off('websocket-message', handleMessage);
      reject(new Error('SendFile request timed out'));
    }, TIMEOUT.FILE_SEND_MS);

    const handleMessage = (message: Record<string, unknown>): void => {
      const success: SendFileSuccessResponse | undefined = message.SendFileRequestSuccess as SendFileSuccessResponse | undefined;
      const failure: SendFileFailureResponse | undefined = message.SendFileRequestFailure as SendFileFailureResponse | undefined;

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
        const errorMsg: string = failure.message || 'SendFile failed';
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
  }));
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

  const objectId: string | undefined = transferIdToObjectId.get(params.transferId);
  if (objectId) {
    objectIdToTransferId.delete(objectId);
    transferIdToObjectId.delete(params.transferId);
  }
}

