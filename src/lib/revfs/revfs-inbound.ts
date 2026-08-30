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
import { persistTree } from './persist-tree';
import { applyRemoteOp, mergeTrees } from './tree-operations';
import { isNewOperation } from './seen-operations';
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
      const merged: RevfsNode = mergeTrees(currentTree, applyRemoteOp(currentTree, op, myCid));
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
    const newTree: RevfsNode = applyRemoteOp(tree, op, myCid);
    debugLog('RevfsService', `[revfs] handleRevfsOperation: applied ${op.op_type}, updating tree for key=${key}`);
    ctx.state.setTree(key, newTree);
    const io: RevfsIO = ctx.ensureIO();
    await persistTree(io, key, newTree);

    const ackOp: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.Ack, path: op.path, ack_op_id: op.op_id, success: true, timestamp: Date.now() };
    await ctx.sendOp(senderCid, ackOp);
}
