/** Transfer Lifecycle - state machine transitions and core operations. */

import { eventEmitter } from '../event-emitter';
import { scopedSettingsKey } from './settings-key';
import { getMimeType, formatBytes } from './transfer-format';
import { FILE_TRANSFER_REQUEST_TTL_MS } from '@/types/messaging-layer';
import { FILE_TRANSFER_EVENTS } from './events';
import { isTerminalTransferState, isStillOpen } from './transfer-outcome';
import type { FileTransferState } from './state';
import type { FileTransferIO } from './io';
import type { FileTransfer, FileTransferSettings } from './types';
import { wrapInMemory } from './types';
import { openChannelBeforeSending } from './open-peer-channel';
import { shouldQueue } from './send-queue';
import { holdUntilOnline, type SendQueuePort } from './send-queue-hold';

export interface LifecycleDeps {
  state: FileTransferState;
  io: FileTransferIO;
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
  saveSettings: (peerCid: string, settings: FileTransferSettings) => Promise<void>;
  /** Opens the peer's P2P channel if needed; resolves whether it opened. See open-peer-channel. */
  openPeerChannel: (peerCid: bigint) => Promise<boolean>;
  /** Holds a send for an offline peer; see send-queue.ts. */
  queue: SendQueuePort;
}

export async function sendFile(
  deps: LifecycleDeps,
  recipientCid: string,
  file: File,
): Promise<string> {
  const senderCid: bigint | null = await deps.io.getCurrentCid();
  if (!senderCid) {
    throw new Error('No active session');
  }

  // Before the transfer record exists, and long before anything is announced.
  //
  // The inline send path refuses a zero-byte File -- `send-operations` gates on
  // `size > 0` and otherwise throws "requires ... a non-empty browser File
  // object". That throw landed AFTER `announceTransfer`, so the recipient had an
  // offer for bytes that would never arrive: a bubble they could neither accept
  // nor decline, while the sender's transfer sat on 'pending' until its TTL.
  //
  // Refused here with a reason the user can act on. An empty file is a
  // reasonable thing to want to send, and supporting it means confirming the
  // service accepts an empty ByteContents payload -- which is a backend question,
  // not one this guard should answer by guessing.
  if (file.size === 0) {
    throw new Error(
      `"${file.name}" is empty. Files with no contents cannot be sent; ` +
        `add some content and try again.`
    );
  }

  // No size check here beyond the browser ceiling (send-transfer-request): the
  // per-peer "Maximum file size" is what THIS account accepts, applied on accept.
  // Applied here too, it capped every send at the receiving default.

  // A peer known to be offline is not waited for: the send is held at once.
  const peerOnline: boolean | null = deps.queue.peerOnlineStatus(BigInt(recipientCid));
  const channelOpened: boolean = peerOnline === false ? false : await openChannelBeforeSending(deps, recipientCid);
  let thumbnail: string | undefined;
  if (file.type.startsWith('image/')) {
    thumbnail = await deps.io.generateThumbnail(file);
  }

  const transferId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
  const expiresAt: number = Date.now() + FILE_TRANSFER_REQUEST_TTL_MS;

  const transfer: FileTransfer = {
    id: transferId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    thumbnail,
    state: 'pending',
    progress: 0,
    senderCid: senderCid.toString(),
    recipientCid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt,
    isIncoming: false,
  };

  if (shouldQueue(peerOnline, channelOpened)) return holdUntilOnline(deps, transfer, file);

  deps.state.setTransfer(transfer);
  await deps.saveTransfer(transfer);

  // The bytes go over the protocol's FileTransfer -- the one route whose
  // result the recipient can open. A "standard" mode once staged them as a
  // RE-VFS push into the recipient's node and have the recipient pull them
  // back; a RE-VFS object is retrievable only by the node that pushed it, so
  // that pull read the SENDER's disk and failed with its "file not found".
  //
  // `wrapInMemory` brands the File for the intent's `file?: InMemoryOnly<File>`
  // contract — see `types.ts` for why a raw `File` would be a TS error here.
  // Marked failed on a throw: the record was saved above, and a refused send
  // must not sit on 'pending' with nothing shown to the user.
  try {
    await deps.io.executeIntent({ type: 'send-transfer-request', transfer, file: wrapInMemory(file), offerAlreadyShown: false });
  } catch (error) {
    transfer.state = 'error';
    transfer.errorMessage = error instanceof Error ? error.message : 'SendFile failed';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    throw error;
  }

  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);

  return transferId;
}

export async function cancelTransfer(deps: LifecycleDeps, transferId: string): Promise<void> {
  const transfer: FileTransfer | undefined = deps.state.getTransfer(transferId);
  if (!transfer) {
    throw new Error('Transfer not found');
  }

  // The exported set, not a third hand-rolled copy of it. This one omitted
  // 'error', 'declined' and 'expired', so a cancel could rewrite a transfer
  // that had already failed, been refused, or timed out -- turning a real
  // outcome into "cancelled" in the history.
  if (isTerminalTransferState(transfer.state)) return;

  // A held send was never offered, so there is nobody to tell; drop its File.
  if (transfer.state === 'queued') {
    await deps.queue.release(transferId);
  } else {
    await deps.io.executeIntent({
      type: 'send-cancel',
      transferId,
      targetCid: transfer.recipientCid,
      reason: 'Sender cancelled transfer',
      failed: false,
    });
  }
  if (!isStillOpen(deps.state, transfer)) return;

  transfer.state = 'cancelled';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.CANCELLED, transfer);
}

export async function acceptTransfer(deps: LifecycleDeps, transferId: string): Promise<void> {
  const transfer: FileTransfer | undefined = deps.state.getTransfer(transferId);
  if (!transfer) throw new Error('Transfer not found');
  if (!transfer.isIncoming) throw new Error('Cannot accept outgoing transfer');
  if (transfer.state !== 'pending') {
    throw new Error(`Cannot accept transfer in state: ${transfer.state}`);
  }

  // Labelled "Max file size to accept" but read only on the SEND path above,
  // so lowering the slider never limited what arrived. Size is on the offer.
  const settings: FileTransferSettings = deps.state.getSettings(scopedSettingsKey(transfer.senderCid));
  if (transfer.fileSize > settings.maxFileSize) {
    throw new Error(
      `File size ${formatBytes(transfer.fileSize)} exceeds your limit of ` +
        `${formatBytes(settings.maxFileSize)}. Raise it in Chat Settings to accept this file.`
    );
  }

  await deps.io.executeIntent({
    type: 'send-response',
    transferId,
    targetCid: transfer.senderCid,
    accepted: true,
  });
  if (!isStillOpen(deps.state, transfer)) return;

  transfer.state = 'transferring';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
}

export async function declineTransfer(
  deps: LifecycleDeps,
  transferId: string,
  reason?: string
): Promise<void> {
  const transfer: FileTransfer | undefined = deps.state.getTransfer(transferId);
  if (!transfer) {
    throw new Error('Transfer not found');
  }

  if (!transfer.isIncoming) {
    throw new Error('Cannot decline outgoing transfer');
  }

  await deps.io.executeIntent({
    type: 'send-response',
    transferId,
    targetCid: transfer.senderCid,
    accepted: false,
    reason,
  });

  transfer.state = 'declined';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
}

// Re-exported so existing importers keep working; see transfer-format.
export { getMimeType, formatBytes };

export { sendFileWithNativePicker } from './send-with-native-picker';
