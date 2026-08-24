/**
 * The send-transfer-request path: announcing a transfer to the recipient's
 * conversation and dispatching its bytes.
 *
 * Owns the async/sync mode split — an async transfer's bytes are already on
 * the workspace server, so only the announcement goes out; a sync/P2P transfer
 * must carry a real File through the protocol router. Split from io.ts so the
 * intent-compatibility router stays a thin adapter and this policy lives in
 * one place.
 */

import { websocketService } from '../websocket-service';
import type { RealProtocolIORouter } from './real-protocol-io-router';
import type { FileTransfer, SendTransferRequestIntent } from './types';
import { debugLog } from '@/lib/debug-config';
import { P2PCommandType, serializeP2PCommand } from '@/types/p2p-types';
import { buildTransferAnnouncement } from './transfer-announcement';

export async function executeSendTransferRequest(
  router: RealProtocolIORouter,
  intent: SendTransferRequestIntent,
): Promise<void> {
  const { transfer, file } = intent;

  // Async transfers upload the file to the workspace server first
  // (see `async-transfers.ts#executeUploadAndSend`), then emit this
  // intent to notify the recipient that a staged transfer exists.
  // The recipient discovers the transfer via the message-protocol
  // path and fetches the bytes from the server using
  // `transfer.virtualPath` — there's no actual file body to send
  // through the real protocol router here. Falling through to
  // `sendFile` with a synthesised empty File previously resulted in
  // either a silent empty-payload send or a "RealProtocolIORouter
  // requires … a non-empty browser File object" throw, depending on
  // which code path the router took. Skip the protocol send
  // explicitly so async mode degrades to a clean no-op.
  if (!file && transfer.mode === 'async') {
    // Async mode: the file body was uploaded to the workspace server
    // before this intent was dispatched, and the recipient discovers
    // the staged bytes via `transfer.virtualPath`. If `virtualPath`
    // is missing here, something stripped both the File AND the
    // upload metadata — most likely an accidental JSON-roundtrip of
    // the intent (see `SendTransferRequestIntent` contract).
    // Fail loudly so the recipient never silently hangs on a
    // never-uploaded transfer.
    if (!transfer.virtualPath) {
      throw new Error(
        `executeSendTransferRequest: async transfer ${transfer.id} has no file AND no virtualPath — ` +
        `the intent likely crossed a serialization boundary that stripped both fields. ` +
        `Intents must be dispatched in-memory; see SendTransferRequestIntent docs.`,
      );
    }
    debugLog(
      'FileTransferIO',
      'send-transfer-request without file in async mode — skipping protocol send (recipient discovers via the announcement below)',
      { transferId: transfer.id, virtualPath: transfer.virtualPath },
    );
    // The bytes are already on the server; this is the ONLY thing that tells
    // the recipient the transfer exists.
    await announceTransfer(transfer);
    return;
  }

  // Sync / P2P mode: a real File must be present. transfer-lifecycle
  // always passes one. Falling back to an empty placeholder would
  // make the protocol router throw "non-empty browser File object"
  // — fail fast with a clearer message instead of letting the
  // synthesised empty File flow through to the router.
  if (!file) {
    throw new Error(
      `executeSendTransferRequest requires a File for non-async transfers (transferId=${transfer.id}, mode=${transfer.mode})`,
    );
  }

  // Announce before sending the bytes, so the conversation shows the transfer
  // by the time the protocol notification and progress ticks arrive.
  await announceTransfer(transfer);

  await router.sendFile({
    source: file,
    cid: BigInt(transfer.senderCid),
    peerCid: BigInt(transfer.recipientCid),
    mode: transfer.mode,
    transferId: transfer.id,
    metadata: {
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      fileType: transfer.fileType,
      thumbnail: transfer.thumbnail,
      expiresAt: transfer.expiresAt,
    },
  });
}

/**
 * Send the in-band message that makes a transfer appear in the recipient's
 * conversation. Without it they receive bytes with nothing to show for them.
 */
export async function announceTransfer(transfer: FileTransfer): Promise<void> {
  const payload = buildTransferAnnouncement(transfer);
  const bytes = serializeP2PCommand({
    type: P2PCommandType.MessagingLayerCommand,
    payload,
  });

  debugLog('FileTransferIO', `announceTransfer: ${transfer.fileName} -> ${transfer.recipientCid}`, {
    transferId: transfer.id,
    mode: transfer.mode,
  });

  await websocketService.sendP2PMessageReliable(
    BigInt(transfer.senderCid),
    BigInt(transfer.recipientCid),
    bytes,
  );
}
