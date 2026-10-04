/**
 * The send-transfer-request path: announcing a transfer to the recipient's
 * conversation and dispatching its bytes.
 *
 * Every browser-File transfer, in either mode, carries its File through the
 * protocol router. Split from io.ts so the intent-compatibility router stays a
 * thin adapter and this policy lives in one place.
 */

import type { RealProtocolIORouter } from './real-protocol-io-router';
import type { FileTransfer, SendTransferRequestIntent } from './types';
import { debugLog } from '@/lib/debug-config';
import { buildTransferAnnouncement } from './transfer-announcement';
import { sendLayerPayload } from './in-band-signals';
import { assertInlineSendable } from './send-operations';
import type { P2PMessagingLayerPayload } from '@/types/p2p-commands';
import { eventEmitter } from '../event-emitter';
import { FILE_TRANSFER_EVENTS, type OfferAnnounced } from './events';

export async function executeSendTransferRequest(
  router: RealProtocolIORouter,
  intent: SendTransferRequestIntent,
): Promise<void> {
  const { transfer, file } = intent;

  // A real File must be present. transfer-lifecycle always passes one. Falling back to an empty placeholder would
  // make the protocol router throw "non-empty browser File object"
  // — fail fast with a clearer message instead of letting the
  // synthesised empty File flow through to the router.
  if (!file) {
    throw new Error(
      `executeSendTransferRequest requires a File (transferId=${transfer.id}, mode=${transfer.mode})`,
    );
  }

  // The inline cap, BEFORE the announcement. The router enforces the same cap
  // (pre-allocation, in executeSendFile), but that throw lands after
  // `announceTransfer` below has already told the recipient the file is
  // coming: they were left a live-looking 7-day offer for bytes that would
  // never arrive, and the sender a 'pending' record nothing ever errored.
  // The empty-file case had the identical shape and was moved ahead of the
  // announcement; this is the size guard's turn.
  assertInlineSendable(file);

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
 *
 * Then say so, so the SENDER's conversation shows the same offer (see
 * p2p/record-outgoing-file-transfer.ts). Every send path -- inline, staged and
 * native-picker -- announces through here, which is why the event is raised
 * here and not in one of them.
 */
export async function announceTransfer(transfer: FileTransfer): Promise<void> {
  debugLog('FileTransferIO', `announceTransfer: ${transfer.fileName} -> ${transfer.recipientCid}`, {
    transferId: transfer.id,
    mode: transfer.mode,
  });
  const announcement: P2PMessagingLayerPayload = buildTransferAnnouncement(transfer);
  await sendLayerPayload(announcement);
  const announced: OfferAnnounced = { announcement, transferState: transfer.state };
  eventEmitter.emit(FILE_TRANSFER_EVENTS.OFFER_ANNOUNCED, announced);
}
