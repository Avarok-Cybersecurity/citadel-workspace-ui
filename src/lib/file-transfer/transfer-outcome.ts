/**
 * Terminal-state transitions for a file transfer.
 *
 * Extracted from p2p-transfers to keep that module under the file cap.
 */
import { eventEmitter } from '../event-emitter';
import { FILE_TRANSFER_EVENTS } from './events';
import type { FileTransferState as TransferLifecycleState } from '@/types/messaging-layer';
import type { P2PTransferDeps } from './p2p-transfers';

/**
 * States a transfer can never leave. 'declined' and 'expired' belong here as
 * much as the other three: a declined offer whose stray tick could still
 * "complete" it would resurrect a transfer both sides agreed was over.
 */
const TERMINAL_STATES: ReadonlySet<TransferLifecycleState> = new Set([
  'complete', 'error', 'cancelled', 'declined', 'expired',
]);

export function isTerminalTransferState(state: TransferLifecycleState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * The one place a transfer becomes terminal with an outcome. Success and
 * failure can be reported more than once — the protocol's completion tick, the
 * accept-failure status notification, and a Fail tick can all describe the
 * same transfer — and two reports must not produce two COMPLETED events or two
 * saves, so an already-terminal transfer is a no-op: whichever report arrives
 * first wins and the rest are ignored.
 */
export async function applyTransferOutcome(
  deps: P2PTransferDeps,
  transferId: string,
  outcome: { success: boolean; downloadPath?: string; errorMessage?: string }
): Promise<void> {
  const transfer = deps.state.getTransfer(transferId);
  if (!transfer) return;
  if (isTerminalTransferState(transfer.state)) return;

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
