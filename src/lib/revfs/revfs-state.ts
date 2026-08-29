/**
 * RE-VFS In-Memory State
 *
 * Holds cached trees, pending operations, and ACK tracking.
 * No I/O — state is populated by the service via intents.
 *
 * Supports both P2P (PeerPairKey) and server (ServerTreeKey) scoped trees
 * via the unified TreeKey type.
 */

import type { RevfsNode, RevfsPendingOp, TreeKey } from '@/types/revfs-types';
import { debugLog } from '@/lib/debug-config';

export interface PendingAck {
  resolve: (success: boolean) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export type TreeChangedCallback = (key: TreeKey, tree: RevfsNode) => void;

export class RevfsState {
  readonly trees: Map<string, RevfsNode> = new Map<TreeKey, RevfsNode>();
  readonly pendingOps: Map<string, RevfsPendingOp[]> = new Map<TreeKey, RevfsPendingOp[]>();
  readonly pendingAcks: Map<string, PendingAck> = new Map<string, PendingAck>();
  private readonly listeners: Set<TreeChangedCallback> = new Set<TreeChangedCallback>();

  // ── Tree ──────────────────────────────────────────────────────────────

  getTree(key: TreeKey): RevfsNode | undefined {
    return this.trees.get(key);
  }

  setTree(key: TreeKey, tree: RevfsNode): void {
    this.trees.set(key, tree);
    this.notifyTreeChanged(key, tree);
  }

  // ── Pending Ops ───────────────────────────────────────────────────────

  getPendingOps(key: TreeKey): RevfsPendingOp[] {
    return this.pendingOps.get(key) ?? [];
  }

  setPendingOps(key: TreeKey, ops: RevfsPendingOp[]): void {
    this.pendingOps.set(key, ops);
  }

  addPendingOp(key: TreeKey, op: RevfsPendingOp): void {
    const ops: RevfsPendingOp[] = this.getPendingOps(key);
    ops.push(op);
    this.pendingOps.set(key, ops);
  }

  removePendingOp(key: TreeKey, opId: string): void {
    const ops: RevfsPendingOp[] = this.getPendingOps(key).filter(o => o.operation.op_id !== opId);
    this.pendingOps.set(key, ops);
  }

  // ── ACK Tracking ──────────────────────────────────────────────────────

  registerAck(opId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout((): void => {
        this.pendingAcks.delete(opId);
        reject(new Error(`ACK timeout for op ${opId}`));
      }, timeoutMs);

      this.pendingAcks.set(opId, { resolve, reject, timeout });
    });
  }

  resolveAck(opId: string, success: boolean): void {
    const ack: PendingAck | undefined = this.pendingAcks.get(opId);
    if (ack) {
      clearTimeout(ack.timeout);
      this.pendingAcks.delete(opId);
      ack.resolve(success);
    }
  }

  // ── Listeners ─────────────────────────────────────────────────────────

  onTreeChanged(callback: TreeChangedCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyTreeChanged(key: TreeKey, tree: RevfsNode): void {
    for (const listener of this.listeners) {
      try {
        listener(key, tree);
      } catch (err) {
        debugLog('RevfsState', 'Listener error:', err);
      }
    }
  }
}
