/**
 * Re-sending RE-VFS operations that did not reach their peer.
 *
 * Extracted from revfs-service.ts to keep that module under the repo's 250-line
 * cap. The queue this drains used to have no drain at all — addPendingOp was
 * called on both failure paths, removePendingOp had zero callers anywhere in
 * production, and retryCount was written as 0 and never incremented. So an
 * operation that failed to send was recorded and then sat there forever while
 * the caller was told it had succeeded.
 */
import type { RevfsOperation, TreeKey } from '@/types/revfs-types';
import type { RevfsState } from './revfs-state';
import type { RevfsIO } from './revfs-io';
import { debugLog } from '@/lib/debug-config';

const ACK_TIMEOUT_MS = 15_000;

export interface RetryDeps {
  state: RevfsState;
  io: RevfsIO;
  sendOp: (peerCid: bigint, operation: RevfsOperation) => Promise<boolean>;
}

/**
 * How many times a queued operation is re-sent before it is given up on.
 *
 * The queue used to have no drain at all: `addPendingOp` was called on both
 * failure paths, `removePendingOp` had zero callers anywhere in production, and
 * `retryCount` was written as 0 and never incremented. So an operation that
 * failed to send — or whose ack timed out — was recorded and then sat there
 * forever, while the caller was told the operation had succeeded. The local
 * tree showed the change and the peer never learned about it, with no error on
 * either side. The provider next door (yjs-p2p-provider/ack-checker.ts) had the
 * retry loop this needed the whole time.
 */
const MAX_OP_RETRIES = 5;

/**
 * Re-send everything queued for a peer. Call when a channel becomes usable.
 *
 * Returns the number of operations still outstanding, so a caller can tell
 * "nothing to do" from "tried and still failing" — the distinction the
 * original silent queue made impossible.
 */
/**
 * What a flush actually did. `discarded` is separate from `stillPending`
 * because they need different words to the user: one will be retried, the other
 * is gone.
 */
export interface RetryOutcome {
  /** Operations still queued; these will be attempted again. */
  stillPending: number;
  /** Operations abandoned after MAX_OP_RETRIES. These will never be sent. */
  discarded: number;
}

export async function retryPendingOps(
  deps: RetryDeps,
  key: TreeKey,
  peerCid: bigint,
): Promise<RetryOutcome> {
  const pending = deps.state.getPendingOps(key);
  if (pending.length === 0) return { stillPending: 0, discarded: 0 };

  debugLog('RevfsService', `Retrying ${pending.length} queued operation(s) for ${peerCid}`);

  let discarded: number = 0;

  for (const entry of [...pending]) {
    if (entry.retryCount >= MAX_OP_RETRIES) {
      // Counted, not just logged. `debugLog` is a no-op in production, so
      // "dropped loudly" was silent — and because the drop never reached the
      // caller's count, the very click that discarded a rename for good
      // reported "Tree synced with peer".
      discarded += 1;
      debugLog(
        'RevfsService',
        `Giving up on ${entry.operation.op_type} after ${entry.retryCount} attempts`,
      );
      deps.state.removePendingOp(key, entry.operation.op_id);
      continue;
    }

    const ackPromise: Promise<boolean> = deps.state.registerAck(entry.operation.op_id, ACK_TIMEOUT_MS);
    const sent = await deps.sendOp(peerCid, entry.operation);
    if (!sent) {
      entry.retryCount += 1;
      continue;
    }
    try {
      await ackPromise;
      deps.state.removePendingOp(key, entry.operation.op_id);
    } catch {
      entry.retryCount += 1;
    }
  }

    await deps.io.execute({ type: 'persist-pending-ops', treeKey: key, ops: deps.state.getPendingOps(key) });
  return { stillPending: deps.state.getPendingOps(key).length, discarded };
}

export async function sendAndAwaitAck(
  deps: RetryDeps,
  peerCid: bigint,
  op: RevfsOperation,
  key: TreeKey,
): Promise<void> {
  const ackPromise: Promise<boolean> = deps.state.registerAck(op.op_id, ACK_TIMEOUT_MS);
  const sendResult = await deps.sendOp(peerCid, op);
  if (!sendResult) {
    deps.state.addPendingOp(key, { operation: op, retryCount: 0, createdAt: Date.now() });
        await deps.io.execute({ type: 'persist-pending-ops', treeKey: key, ops: deps.state.getPendingOps(key) });
    return;
  }
  try {
    await ackPromise;
  } catch {
    deps.state.addPendingOp(key, { operation: op, retryCount: 0, createdAt: Date.now() });
        await deps.io.execute({ type: 'persist-pending-ops', treeKey: key, ops: deps.state.getPendingOps(key) });
  }
}
