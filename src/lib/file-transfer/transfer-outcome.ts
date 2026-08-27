/**
 * Terminal-state transitions for a file transfer, shared by both planes: the
 * in-band FileTransferComplete message and the SDK's own ticks.
 *
 * Extracted from p2p-transfers to keep that module under the file cap.
 */
import { eventEmitter } from '../event-emitter';
import { FILE_TRANSFER_EVENTS } from './events';
import type { MessagingLayerType, FileTransferCompleteData } from '@/types/messaging-layer';
import type { P2PTransferDeps } from './p2p-transfers';

/**
 * The one place a transfer becomes terminal, shared by both planes: the in-band
 * FileTransferComplete message and the SDK's own TransferComplete/ReceptionComplete/
 * Fail ticks. Two planes reporting the same outcome must not produce two
 * COMPLETED events or two saves, so an already-terminal transfer is a no-op —
 * whichever plane arrives first wins and the other is ignored.
 */
export async function applyTransferOutcome(
  deps: P2PTransferDeps,
  transferId: string,
  outcome: { success: boolean; downloadPath?: string; errorMessage?: string }
): Promise<void> {
  const transfer = deps.state.getTransfer(transferId);
  if (!transfer) return;
  if (transfer.state === 'complete' || transfer.state === 'error' || transfer.state === 'cancelled') {
    return;
  }

  if (outcome.success) {
    transfer.state = 'complete';
    transfer.downloadPath = outcome.downloadPath;
    transfer.progress = 100;
  } else {
    transfer.state = 'error';
    transfer.errorMessage = outcome.errorMessage;
  }

  transfer.updatedAt = Date.now();
  await deps.saveTransfer(transfer);
  deps.emitStateChange(transfer);
  eventEmitter.emit(FILE_TRANSFER_EVENTS.COMPLETED, transfer);
}

export async function handleTransferComplete(
  deps: P2PTransferDeps,
  data: FileTransferCompleteData & { type: MessagingLayerType.FileTransferComplete },
  _senderCid: string
): Promise<void> {
  await applyTransferOutcome(deps, data.transfer_id, {
    success: data.success,
    downloadPath: data.download_path,
    errorMessage: data.error_message,
  });
}
