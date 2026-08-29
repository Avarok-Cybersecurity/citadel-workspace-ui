/**
 * In-band accept/decline and cancel signals.
 *
 * The protocol's RespondFileTransfer travels only between OUR browser and OUR
 * internal service; the sender's UI learns of an accept indirectly (its tick
 * stream starts) and of a DECLINE not at all — the SDK gives the declined
 * sender no notification whatsoever, so before these signals existed the
 * sender's bubble sat on "Waiting for acceptance" forever. Cancel has no
 * protocol command at all (cancellation is implicit in disconnect), so
 * without an in-band signal the recipient's bubble outlived the transfer.
 *
 * These are ordinary P2P messages carrying FileTransferResponse /
 * FileTransferCancel layers; the peer's message-handler routing forwards them
 * to its FileTransferService (async-transfers.handleTransferResponse and
 * p2p-transfers.handleTransferCancel), which moves the bubble to its terminal
 * state.
 */

import { websocketService } from '../websocket-service';
import {
  createFileTransferResponse,
  createFileTransferCancel,
} from '@/types/messaging-layer';
import type { P2PMessagingLayerPayload } from '@/types/p2p-commands';
import { P2PCommandType, serializeP2PCommand } from '@/types/p2p-types';
import { buildLayerPayload } from './transfer-announcement';
import { debugLog } from '@/lib/debug-config';

/** Serialize a layer payload and send it over the reliable P2P channel. */
export async function sendLayerPayload(payload: P2PMessagingLayerPayload): Promise<void> {
  const bytes: Uint8Array<ArrayBufferLike> = serializeP2PCommand({
    type: P2PCommandType.MessagingLayerCommand,
    payload,
  });
  await websocketService.sendP2PMessageReliable(
    payload.sender_cid,
    payload.recipient_cid,
    bytes
  );
}

/** Tell the sender we accepted or declined their offer. */
export async function sendTransferResponseSignal(
  ownCid: bigint,
  peerCid: bigint,
  transferId: string,
  accepted: boolean,
  declineReason?: string
): Promise<void> {
  debugLog('in-band-signals', 'sending transfer response', {
    transferId, accepted, peerCid: peerCid.toString(),
  });
  await sendLayerPayload(
    buildLayerPayload(
      createFileTransferResponse(transferId, accepted, declineReason),
      ownCid,
      peerCid
    )
  );
}

/** Tell the peer this transfer is cancelled. */
export async function sendTransferCancelSignal(
  ownCid: bigint,
  peerCid: bigint,
  transferId: string,
  reason?: string
): Promise<void> {
  debugLog('in-band-signals', 'sending transfer cancel', {
    transferId, peerCid: peerCid.toString(),
  });
  await sendLayerPayload(
    buildLayerPayload(createFileTransferCancel(transferId, reason), ownCid, peerCid)
  );
}
