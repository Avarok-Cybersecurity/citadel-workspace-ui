/**
 * Holding a send for an offline peer, and releasing it when they are back.
 * The decisions are send-queue.ts; this applies them to the transfer record.
 */
import { eventEmitter } from '../event-emitter';
import { debugLog } from '@/lib/debug-config';
import { FILE_TRANSFER_EVENTS } from './events';
import { buildTransferAnnouncement } from './transfer-announcement';
import { showOwnOffer } from './send-transfer-request';
import { queueRefusal, queuedFor } from './send-queue';
import { wrapInMemory, type FileTransfer } from './types';
import type { FileTransferState } from './state';
import type { FileTransferIO } from './io';

/** Where held Files live, and what is known about the peer. */
export interface SendQueuePort {
  /** True / false from the presence poll; null before one has landed. */
  peerOnlineStatus: (peerCid: bigint) => boolean | null;
  peerName: (peerCid: string) => string;
  hold: (transferId: string, file: File) => Promise<void>;
  /** The held File, or undefined when it was not kept (e.g. storage refused it before a reload). */
  take: (transferId: string) => Promise<File | undefined>;
  release: (transferId: string) => Promise<void>;
}

export interface HoldDeps {
  state: FileTransferState;
  io: FileTransferIO;
  queue: SendQueuePort;
  emitStateChange: (transfer: FileTransfer) => void;
  saveTransfer: (transfer: FileTransfer) => Promise<void>;
}

/** Hold `transfer` (not yet recorded) until its recipient is online. */
export async function holdUntilOnline(deps: HoldDeps, transfer: FileTransfer, file: File): Promise<string> {
  const refusal: string | null = queueRefusal(deps.state.getAllTransfers(), file.size);
  if (refusal !== null) throw new Error(refusal);
  transfer.state = 'queued';
  transfer.waitingFor = deps.queue.peerName(transfer.recipientCid);
  deps.state.setTransfer(transfer);
  await deps.saveTransfer(transfer);
  await deps.queue.hold(transfer.id, file);
  showOwnOffer(buildTransferAnnouncement(transfer), transfer);
  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.REQUEST_SENT, transfer);
  return transfer.id;
}

async function fail(deps: HoldDeps, transfer: FileTransfer, message: string): Promise<void> {
  transfer.state = 'error';
  transfer.errorMessage = message;
  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
}

/** Send every send held for `peerCid` by `ownCid`, oldest first. */
export async function releaseHeldSends(deps: HoldDeps, ownCid: string, peerCid: string): Promise<void> {
  for (const transfer of queuedFor(deps.state.getAllTransfers(), ownCid, peerCid)) {
    const file: File | undefined = await deps.queue.take(transfer.id);
    if (file === undefined) {
      await fail(deps, transfer, 'The file was not kept while it waited (this browser did not store it); send it again.');
      continue;
    }
    transfer.state = 'pending';
    transfer.updatedAt = Date.now();
    await deps.saveTransfer(transfer);
    deps.emitStateChange(transfer);
    try {
      await deps.io.executeIntent({ type: 'send-transfer-request', transfer, file: wrapInMemory(file), offerAlreadyShown: true });
      await deps.queue.release(transfer.id);
    } catch (error) {
      debugLog('SendQueue', 'held send failed when released', error);
      await fail(deps, transfer, error instanceof Error ? error.message : 'SendFile failed');
      await deps.queue.release(transfer.id);
    }
  }
}
