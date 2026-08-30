/**
 * An operation that arrived from a peer.
 *
 * Split out of `revfs-service` at the 250-line cap, and it is the right seam
 * anyway: everything else in that file is the LOCAL api -- mkdir, rmdir,
 * upload -- while this is the one entry point the wire drives.
 *
 * The dedupe at the top is the important part. CI run 33304689050 recorded
 * seven `SyncRequest`s sent by one peer and one hundred handled by the other,
 * and the same `Mkdir` applied twice 21ms apart under a single op id. Applying
 * an operation twice is wrong on its own; the COST is that every redelivered
 * `SyncRequest` is answered with a fresh 564-byte `SyncResponse` on the
 * reliable channel, and the `PlaceFile` and `Rmdir` the user asked for queue
 * behind that flood and never arrive.
 */
import { peerPairKey } from './tree-queries';
import { withSerialLock } from '@/lib/serial-queue';
import { persistTree } from './persist-tree';
import { applyRemoteOp, mergeTrees } from './tree-operations';
import { applyRemoteOpWithOutcome } from './tree-sync';
import type { RemoteOpOutcome } from './remote-op-outcome';
import { isNewOperation, forgetOperation } from './seen-operations';
import { debugLog } from '@/lib/debug-config';
import { RevfsOpType } from '@/types/revfs-types';
import type { RevfsNode, RevfsOperation } from '@/types/revfs-types';
import type { RevfsIO } from './revfs-io';
import type { RevfsState } from './revfs-state';

export interface InboundContext {
  state: RevfsState;
  ensureIO: () => RevfsIO;
  getTree: (myCid: bigint, peerCid: bigint) => Promise<RevfsNode>;
  sendOp: (peerCid: bigint, op: RevfsOperation) => Promise<boolean>;
}

export async function applyInboundOperation(
  ctx: InboundContext,
  senderCid: bigint,
  myCid: bigint,
  op: RevfsOperation,
): Promise<void> {
    debugLog('RevfsService', `[revfs] handleRevfsOperation: sender=${senderCid} myCid=${myCid} op=${op.op_type} path=${op.path}`);
    const key: string = peerPairKey(myCid, senderCid);

    // Applied once, however many times it arrives. An Ack is exempt: it is
    // idempotent by construction and resolving an already-resolved id is a
    // no-op, while dropping one could strand a sender.
    if (op.op_type !== RevfsOpType.Ack && !isNewOperation(key, op.op_id)) {
      debugLog('RevfsService', `[revfs] handleRevfsOperation: already applied ${op.op_type} ${op.op_id}`);
      // Acknowledged again, not just dropped.
      //
      // `retryPendingOps` resends an operation whose ack never came back, with
      // the SAME op id. A receiver that has already applied it and stays silent
      // leaves that sender retrying for ever -- so the first version of this
      // guard turned a duplicate-work problem into a stuck-queue one.
      //
      // Re-applying is wrong and re-acknowledging is right: the sender's
      // question is "did this land", and it did.
      if (op.op_type !== RevfsOpType.SyncRequest && op.op_type !== RevfsOpType.SyncResponse) {
        const ack: RevfsOperation = {
          op_id: crypto.randomUUID(), op_type: RevfsOpType.Ack,
          path: op.path, ack_op_id: op.op_id, success: true, timestamp: Date.now(),
        };
        await ctx.sendOp(senderCid, ack);
      }
      return;
    }

    if (op.op_type === RevfsOpType.Ack && op.ack_op_id) {
      ctx.state.resolveAck(op.ack_op_id, op.success ?? true);
      return;
    }

    if (op.op_type === RevfsOpType.SyncRequest) {
      const tree: RevfsNode = await ctx.getTree(myCid, senderCid);
      const syncResponse: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.SyncResponse, path: '/', tree, timestamp: Date.now() };
      await ctx.sendOp(senderCid, syncResponse);
      return;
    }

    if (op.op_type === RevfsOpType.SyncResponse && op.tree) {
      const loaded: RevfsNode = await ctx.getTree(myCid, senderCid);
      const currentTree: RevfsNode = ctx.state.getTree(key) ?? loaded;
      // What we have already deleted and the peer has not yet been told about.
      // Without it their SyncResponse restores those files, naming bytes this
      // side destroyed when it queued the removal.
      const pendingRemovals: Set<string> = new Set(
        ctx.state
          .getPendingOps(key)
          .filter((entry) => entry.operation.op_type === RevfsOpType.RemoveFile
            || entry.operation.op_type === RevfsOpType.Rmdir)
          .map((entry) => entry.operation.path),
      );
      const merged: RevfsNode = mergeTrees(
        currentTree,
        applyRemoteOp(currentTree, op, myCid),
        pendingRemovals,
      );
      ctx.state.setTree(key, merged);
      const io: RevfsIO = ctx.ensureIO();
      await persistTree(io, key, merged);
      return;
    }

    // Re-read AFTER the await: `getTree` yields even when cached, so two ops
    // arriving together both read before either writes. See
    // concurrent-remote-ops-do-not-clobber.test.ts.
    const loaded: RevfsNode = await ctx.getTree(myCid, senderCid);
    const tree: RevfsNode = ctx.state.getTree(key) ?? loaded;

    // The outcome, not just the tree. `applyRemoteOp` returns the tree unchanged
    // for every refusal -- a missing parent, a protected path, an occupied
    // destination -- and this used to acknowledge `success: true` regardless, so
    // the sender cleared its retry queue for an operation that never happened.
    let outcome: RemoteOpOutcome;
    try {
      outcome = applyRemoteOpWithOutcome(tree, op, myCid);
      if (outcome.applied) {
        ctx.state.setTree(key, outcome.tree);
        const io: RevfsIO = ctx.ensureIO();
        await persistTree(io, key, outcome.tree);
      }
    } catch (error) {
      // The seen-mark was taken by the guard at the top, BEFORE any of this ran.
      // Left in place, a redelivery takes the "already applied" path and is
      // answered with a success Ack for an operation that threw.
      forgetOperation(key, op.op_id);
      debugLog('RevfsService', `[revfs] handleRevfsOperation: ${op.op_type} threw, forgetting so a retry is real`, error);
      const failed: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.Ack, path: op.path, ack_op_id: op.op_id, success: false, timestamp: Date.now() };
      const told: boolean = await ctx.sendOp(senderCid, failed);
      if (!told) {
        // Not fatal, and worth saying. The sender's ack timeout covers a
        // failure notice that never arrives -- it retries either way -- but a
        // silent drop here is why the op appears to vanish rather than fail.
        debugLog('RevfsService', `[revfs] could not tell ${senderCid} that ${op.op_id} failed`);
      }
      return;
    }

    if (!outcome.applied) {
      // Same reasoning as the catch: the mark must not outlive a refusal, or the
      // sender's retry is answered with a success it never earned.
      forgetOperation(key, op.op_id);
      debugLog('RevfsService', `[revfs] handleRevfsOperation: refused ${op.op_type} at ${op.path}`);
    } else {
      debugLog('RevfsService', `[revfs] handleRevfsOperation: applied ${op.op_type}, updating tree for key=${key}`);
    }

    const ackOp: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.Ack, path: op.path, ack_op_id: op.op_id, success: outcome.applied, timestamp: Date.now() };
    await ctx.sendOp(senderCid, ackOp);
}

/**
 * Apply an inbound operation, serialised against this tree's local mutators.
 *
 * The lock lives here rather than at the call site because it is a property of
 * the inbound path, not of the service's plumbing — and because the exemption
 * below is only correct in light of what this module does with each op type.
 *
 * Every local mutator runs under `withSerialLock` on the tree's key. This did
 * not, so a peer's operation applied to the live tree while `uploadFileToPeer`
 * was blocked on `backend-send-file` — a real transfer with a 30-second ceiling,
 * across which the upload holds the snapshot it read beforehand. When the send
 * returned, `setTree` wrote that snapshot back and the peer's mkdir, rename or
 * delete was gone locally while still present on their side.
 *
 * An Ack is exempt, and must be: `sendAndAwaitAck` runs INSIDE the lock and
 * blocks until the peer acknowledges, so routing the Ack through the same lock
 * deadlocks every peer operation — the mutator holds the lock waiting for an
 * acknowledgement that is waiting for the mutator. An Ack mutates no tree; it
 * resolves a pending promise, so there is nothing here for the lock to protect.
 */
export function applyInboundOperationSerially(
  ctx: InboundContext,
  senderCid: bigint,
  myCid: bigint,
  op: RevfsOperation,
): Promise<void> {
  if (op.op_type === RevfsOpType.Ack) {
    return applyInboundOperation(ctx, senderCid, myCid, op);
  }
  return withSerialLock(peerPairKey(myCid, senderCid), () =>
    applyInboundOperation(ctx, senderCid, myCid, op),
  );
}
