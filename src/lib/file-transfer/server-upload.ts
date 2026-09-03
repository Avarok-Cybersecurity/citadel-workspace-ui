/**
 * File Transfer - Server Upload
 *
 * Staging a browser-selected file on the server so a peer can fetch it later
 * ("async" mode, as opposed to a live P2P transfer).
 *
 * The browser holds a `File` — bytes in memory, with no filesystem path the
 * internal service could open. `FileSource::ByteContents` exists precisely for
 * this case: it carries the payload inline and the service materialises it to a
 * temp file on the far side. The native-picker flow uses `FileSource::Path` /
 * `PickFileRef` instead, because there the service can read the file directly.
 */

import { eventEmitter } from '../event-emitter';
import { failOnSocketLoss } from '../websocket/request-response';
import { websocketService } from '../websocket-service';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '../timeout-constants';

/**
 * Largest inline payload the internal service will accept for one
 * `FileSource::ByteContents` request.
 *
 * Mirrors `MAX_BYTE_CONTENTS_BYTES` in
 * `citadel-internal-service/src/kernel/requests/file/upload.rs`. The service is
 * the authority — this constant exists so an oversized file fails here, with a
 * message naming the limit and the alternative, instead of being serialised into
 * a WebSocket frame only to be rejected on arrival.
 *
 * Keep the two in lockstep. Files above this must use the native PickFile flow,
 * which streams from disk and bypasses both this cap and the JSON expansion.
 */
export const MAX_BYTE_CONTENTS_BYTES: number = 16 * 1024 * 1024; // 16 MiB

/**
 * Must match the level the recipient's `DownloadFile` asks for
 * (`DOWNLOAD_SECURITY_LEVEL` in server-download.ts) and the level the RE-VFS
 * route uses, or the two halves of one transfer negotiate differently.
 */
const UPLOAD_SECURITY_LEVEL: 'Standard' = 'Standard';

/**
 * Send a `SendFile` request via `send` and resolve once the internal service
 * acknowledges it, or reject with the service's own failure message.
 *
 * Shared by both SendFile paths (inline byte upload and native-picker send) so
 * the correlation-by-request_id, the listener teardown and the timeout are
 * defined once rather than reimplemented per call site.
 *
 * `send` runs INSIDE this promise, after the listener is registered, so a send
 * failure settles the same promise the caller awaits. The call sites used to
 * create this promise first and `await sendMessage(...)` beside it; when the
 * send threw, the orphaned promise kept its listener for the full timeout and
 * then rejected with nobody listening — an unhandled rejection 30s after the
 * caller had already reported the real error. The other request/response sites
 * (send-operations.ts, receive-operations.ts) already wire the send's .catch
 * into their promise; this adopts the same shape.
 */
export function awaitSendFileAck(requestId: string, send: () => Promise<void>): Promise<void> {
  return failOnSocketLoss('ServerUpload', new Promise<void>((resolve, reject) => {
    const timeout: NodeJS.Timeout = setTimeout((): void => {
      eventEmitter.off('websocket-message', handleMessage);
      reject(new Error('SendFile request timed out'));
    }, TIMEOUT.FILE_SEND_MS);

    const settle = (fn: () => void): void => {
      clearTimeout(timeout);
      eventEmitter.off('websocket-message', handleMessage);
      fn();
    };

    const handleMessage = (message: unknown): void => {
      const msg: Record<string, unknown> = message as Record<string, unknown>;

      const success: { request_id?: string; } | undefined = msg.SendFileRequestSuccess as { request_id?: string } | undefined;
      if (success?.request_id === requestId) {
        settle(() => {
          debugLog('FileTransferIO', 'SendFile accepted by protocol', { requestId });
          resolve();
        });
        return;
      }

      const failure: { request_id?: string; message?: string; } | undefined = msg.SendFileRequestFailure as
        | { request_id?: string; message?: string }
        | undefined;
      if (failure?.request_id === requestId) {
        settle(() => {
          const errorMsg: string = failure.message || 'SendFile failed';
          debugLog('FileTransferIO', 'SendFile failed', { requestId, errorMsg });
          reject(new Error(errorMsg));
        });
      }
    };

    eventEmitter.on('websocket-message', handleMessage);

    send().catch((error: unknown): void => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  }));
}

/**
 * The virtual path a staged transfer is written to, and later read back from.
 *
 * This IS a server path, and it has to be: the sender chooses it in
 * `TransferType::RemoteEncryptedVirtualFilesystem`, ships it to the peer in the
 * transfer announcement, and the peer passes it straight back as
 * `DownloadFile.virtual_directory`. Nothing else supplies one — the earlier
 * comment here claimed "the recipient learns the real virtual_path from the
 * transfer notification", but the announcement carries exactly this value and
 * there was no other source.
 *
 * It previously returned `staged:{id}/{name}`, documented as NOT a path, which
 * was then shipped and used as one. The prefix is gone because a value used as
 * a path must be a path.
 */
export function stagedTransferPath(transferId: string, fileName: string): string {
  return `/transfers/${transferId}/${fileName}`;
}

/**
 * Upload a browser `File` to the server for later peer retrieval.
 *
 * Resolves only once the internal service has accepted the request, and throws
 * otherwise. It previously returned a synthesised `/transfers/{id}/{name}` path
 * for a `FileSource::Path` that existed on no filesystem, and — worse — returned
 * that same path from its `catch`, so a failed upload was indistinguishable from
 * a successful one and the transfer was marked "staged" with nothing staged.
 */
export async function uploadFileToServer(
  file: File,
  transferId: string,
  recipientCid: string,
  ownCid: bigint,
  /**
   * Registers the minted SendFile request_id as a foreign OUTGOING tick
   * stream (RealProtocolIORouter.markForeignOutgoingStream). The internal
   * service stamps a revfs push's sender-side ticks with exactly this id, and
   * those ticks describe the STAGING of the bytes, not the chat transfer —
   * unregistered, the stream's TransferComplete fell back to the oldest live
   * transfer for the peer pair and marked the chat transfer 'complete' while
   * the file was only staged. Called before the request is sent so no tick
   * can precede the registration.
   */
  markForeignStream: (requestId: string) => void
): Promise<string> {
  if (file.size > MAX_BYTE_CONTENTS_BYTES) {
    const mib = (n: number): string => `${(n / (1024 * 1024)).toFixed(1)} MiB`;
    throw new Error(
      `"${file.name}" is ${mib(file.size)}, above the ${mib(MAX_BYTE_CONTENTS_BYTES)} limit ` +
        `for browser uploads. Send it while both peers are online, or use the native file picker.`
    );
  }

  debugLog('FileTransferIO', 'Uploading file to server', {
    transferId,
    fileName: file.name,
    size: file.size,
  });

  // ByteContents.data is a Rust Vec<u8>, which serialises as a JSON number array.
  const data: number[] = Array.from(new Uint8Array(await file.arrayBuffer()));

  const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
  const virtualPath: string = stagedTransferPath(transferId, file.name);
  const request: { SendFile: { request_id: `${string}-${string}-${string}-${string}-${string}`; source: { ByteContents: { file_name: string; data: number[]; }; }; cid: bigint; peer_cid: bigint; chunk_size: null; transfer_type: { RemoteEncryptedVirtualFilesystem: { virtual_path: string; security_level: string; }; }; }; } = {
    SendFile: {
      request_id: requestId,
      source: { ByteContents: { file_name: file.name, data } },
      // `SendFile.cid` is a non-nullable u64 on the wire. `null` failed
      // deserialization in the WASM client, so the request never left the
      // browser at all -- every send in the default, "Recommended" async mode
      // landed in its caller's catch. Nothing about it reached the network, so
      // there was nothing to debug on either side.
      cid: ownCid,
      peer_cid: BigInt(recipientCid),
      chunk_size: null,
      // RemoteEncryptedVirtualFilesystem, not FileTransfer. `FileTransfer` is a
      // LIVE peer-to-peer send that requires the recipient online to accept it,
      // so "async" mode was not staging anything: it opened a live transfer,
      // returned a made-up reference, and the recipient later asked the service
      // to read a virtual directory named `staged:...`. This variant is what
      // creates the virtual_path key that DownloadFile addresses -- the same
      // correction already made in revfs-io-network.ts and never carried here.
      transfer_type: {
        RemoteEncryptedVirtualFilesystem: {
          virtual_path: virtualPath,
          security_level: UPLOAD_SECURITY_LEVEL,
        },
      },
    },
  };

  markForeignStream(requestId);
  await awaitSendFileAck(requestId, () =>
    websocketService.sendMessage(request as unknown as Record<string, unknown>)
  );

  return virtualPath;
}
