/** Transfer Lifecycle - state machine transitions and core operations. */

import { eventEmitter } from '../event-emitter';
import { scopedSettingsKey } from './settings-key';
import { getMimeType, formatBytes } from './transfer-format';
import { type FileTransferMode, FILE_TRANSFER_REQUEST_TTL_MS } from '@/types/messaging-layer';
import { FILE_TRANSFER_EVENTS } from './events';
import { completeStagedDownload } from './server-download';
import type { FileTransferState } from './state';
import type { FileTransferIO } from './io';
import type { FileTransfer, FileTransferSettings } from './types';
import { wrapInMemory } from './types';

export interface LifecycleDeps {
  state: FileTransferState;
  io: FileTransferIO;
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
  saveSettings: (peerCid: string, settings: FileTransferSettings) => Promise<void>;
  handleAsyncSend: (transfer: FileTransfer, file: File) => Promise<void>;
}

export async function sendFile(
  deps: LifecycleDeps,
  recipientCid: string,
  file: File,
  mode: FileTransferMode
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

  const settings: FileTransferSettings = deps.state.getSettings(scopedSettingsKey(recipientCid));
  if (file.size > settings.maxFileSize) {
    throw new Error(
      `File size ${formatBytes(file.size)} exceeds max ${formatBytes(settings.maxFileSize)}`
    );
  }

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
    mode,
    state: mode === 'async' ? 'uploading' : 'pending',
    progress: 0,
    senderCid: senderCid.toString(),
    recipientCid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt,
    isIncoming: false,
  };

  deps.state.setTransfer(transfer);
  await deps.saveTransfer(transfer);

  if (mode === 'async') {
    await deps.handleAsyncSend(transfer, file);
  } else {
    // `wrapInMemory` brands the File for the intent's `file?: InMemoryOnly<File>`
    // contract — see `types.ts` for why a raw `File` would be a TS error here.
    // The bytes leave inside this call (SendFile ByteContents); there is no
    // stashed copy to stream later — the chunk-streaming plane that once
    // consumed one is gone.
    await deps.io.executeIntent({ type: 'send-transfer-request', transfer, file: wrapInMemory(file) });
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

  if (transfer.state === 'complete' || transfer.state === 'cancelled') return;

  await deps.io.executeIntent({
    type: 'send-cancel',
    transferId,
    targetCid: transfer.recipientCid,
    reason: 'Sender cancelled transfer',
  });

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
  if (transfer.state !== 'pending' && transfer.state !== 'staged') {
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

  // An async transfer has nothing to respond TO.
  //
  // `send-response` needs the protocol `object_id`, which the correlator only
  // learns from a `FileTransferRequestNotification` whose
  // `metadata.transfer_type === 'FileTransfer'`. Async mode stages through
  // RE-VFS, which the internal service auto-accepts and never announces that
  // way -- so `resolveObjectId` returned undefined and this threw "has not been
  // announced over the protocol yet" for EVERY async transfer.
  //
  // It threw here, above the staged-download branch below, which is why
  // `completeStagedDownload` was unreachable. Async is the mode the UI labels
  // "Recommended", so the default way to send a file could not be accepted at
  // all: both buttons threw, the decline signal was never sent, and the
  // recipient's bubble sat waiting for ever.
  const isStaged: boolean = transfer.mode === 'async';
  if (isStaged && !transfer.virtualPath) {
    // Fail loudly rather than silently doing neither half.
    throw new Error(
      'This staged transfer carries no server path, so it cannot be downloaded. ' +
        'Ask the sender to resend it.'
    );
  }

  if (!isStaged) {
    await deps.io.executeIntent({
      type: 'send-response',
      transferId,
      targetCid: transfer.senderCid,
      accepted: true,
    });
  }

  transfer.state = 'transferring';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);

  if (isStaged) {
    await completeStagedDownload(deps, transfer);
  }
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

  // Same reason as accept: a staged transfer has no protocol object_id to
  // name, so issuing the response threw and the decline was never recorded
  // either. Declining a staged file is local -- the bytes sit on the server
  // until they expire, and the sender's own transfer completed at staging.
  if (transfer.mode !== 'async') {
    await deps.io.executeIntent({
      type: 'send-response',
      transferId,
      targetCid: transfer.senderCid,
      accepted: false,
      reason,
    });
  }

  transfer.state = 'declined';
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
}

// Re-exported so existing importers keep working; see transfer-format.
export { getMimeType, formatBytes };

export { sendFileWithNativePicker } from './send-with-native-picker';
