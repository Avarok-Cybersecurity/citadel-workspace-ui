/**
 * Building the in-band message that tells the recipient a transfer exists.
 *
 * A transfer has two halves. The bytes go over the protocol's own file transfer
 * (SendFile), which raises a FileTransferRequestNotification on the recipient's
 * internal service. The BUBBLE in the conversation comes from somewhere else
 * entirely: an ordinary P2P message carrying a FileTransferRequest messaging
 * layer, which the recipient's FileTransferMessageHandler turns into a
 * `message_type: 'file_transfer'` entry in the conversation.
 *
 * Only the first half was ever sent. `createFileTransferRequest` — the builder
 * for the second — had no caller, so recipients got bytes and no bubble, and in
 * async mode no indication at all: the code there notes the recipient "discovers
 * the transfer via the message-protocol path", which is precisely the message
 * that was never sent.
 *
 * Kept separate from io.ts so the decision of what to announce can be tested
 * without a socket.
 */

import { createFileTransferRequest } from '@/types/messaging-layer';
import type { P2PMessagingLayerPayload } from '@/types/p2p-commands';
import type { FileTransfer } from './types';

/**
 * The in-band announcement for `transfer`.
 *
 * `transfer_id` is carried through deliberately: the recipient's accept/decline
 * has to name the same transfer the bytes arrive under, so a fresh id here would
 * produce a bubble that can never be matched to its transfer.
 */
export function buildTransferAnnouncement(transfer: FileTransfer): P2PMessagingLayerPayload {
  const layer = createFileTransferRequest(
    transfer.fileName,
    transfer.fileSize,
    transfer.fileType,
    transfer.mode,
    {
      transfer_id: transfer.id,
      thumbnail: transfer.thumbnail,
      virtual_path: transfer.virtualPath,
      expiry_timestamp: transfer.expiresAt,
    },
  );

  return {
    layer,
    sender_cid: BigInt(transfer.senderCid),
    recipient_cid: BigInt(transfer.recipientCid),
    // Distinct from transfer_id: this identifies the chat message, and reusing
    // the transfer id would collide with any later message about the same
    // transfer (progress, completion) in the conversation's message map.
    message_id: crypto.randomUUID(),
    index: 0,
    message_type: 'file_transfer',
  };
}
