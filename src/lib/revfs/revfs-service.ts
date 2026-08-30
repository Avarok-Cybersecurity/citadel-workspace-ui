/**
 * RE-VFS Service (Singleton)
 *
 * Thin orchestrator that delegates to revfs-dir-ops, revfs-file-ops,
 * and handles incoming operations + sync.
 */

import type {
  RevfsNode,
  RevfsOperation,
  RevfsFileMetadata,
  TreeKey,
} from '@/types/revfs-types';
import { RevfsOpType } from '@/types/revfs-types';
import { withSerialLock } from '@/lib/serial-queue';
import {
  peerPairKey,
  serverTreeKey,
  createDefaultTree,
} from './tree-operations';
import { RevfsState, type TreeChangedCallback } from './revfs-state';
import { RevfsIO, type RevfsIODeps } from './revfs-io';
import { retryPendingOps, sendAndAwaitAck, type RetryOutcome } from './revfs-retry';
import { applyInboundOperation, type InboundContext } from './revfs-inbound';
import { awaitTreeChange } from './await-tree-change';

/** How long a peer has to answer a sync request before we stop claiming it did. */
const SYNC_ANSWER_TIMEOUT_MS: number = 15_000;
import type { DirOpsContext } from './revfs-dir-ops';
import * as dirOps from './revfs-dir-ops';
import type { FileOpsContext } from './revfs-file-ops';
import * as fileOps from './revfs-file-ops';
import * as serverFileOps from './revfs-server-file-ops';
import { persistTree } from './persist-tree';
import type { RevfsIntentResult } from '@/types/revfs-intents';



export class RevfsService {
  private readonly state: RevfsState = new RevfsState();
  private io: RevfsIO | null = null;
  private initialized: boolean = false;

  // ── Initialization ────────────────────────────────────────────────────

  initialize(deps: RevfsIODeps): void {
    if (this.initialized) return;
    this.io = new RevfsIO(deps);
    this.initialized = true;
  }

  private ensureIO(): RevfsIO {
    if (!this.io) throw new Error('RevfsService not initialized — call initialize() first');
    return this.io;
  }

  // ── Context Builders ──────────────────────────────────────────────────

  private dirCtx(): DirOpsContext {
    return {
      state: this.state,
      ensureIO: () => this.ensureIO(),
      getTree: (myCid, peerCid) => this.getTree(myCid, peerCid),
      getServerTree: (myCid) => this.getServerTree(myCid),
      sendAndAwaitAck: (peerCid, op, key) => this.sendAndAwaitAck(peerCid, op, key),
    };
  }

  private fileCtx(): FileOpsContext {
    return {
      state: this.state,
      ensureIO: () => this.ensureIO(),
      getTree: (myCid, peerCid) => this.getTree(myCid, peerCid),
      getServerTree: (myCid) => this.getServerTree(myCid),
      sendAndAwaitAck: (peerCid, op, key) => this.sendAndAwaitAck(peerCid, op, key),
      sendOp: (peerCid, operation) => this.sendOp(peerCid, operation),
      findFileInTree: (tree, path) => this.findFileInTree(tree, path),
    };
  }

  // ── Tree Access ───────────────────────────────────────────────────────

  async getTree(myCid: bigint, peerCid: bigint): Promise<RevfsNode> {
    const key: string = peerPairKey(myCid, peerCid);
    const cached: RevfsNode | undefined = this.state.getTree(key);
    if (cached) return cached;

    const io: RevfsIO = this.ensureIO();
    const result: RevfsIntentResult = await io.execute({ type: 'load-tree', treeKey: key });
    // Re-checked AFTER the await, before either branch below.
    //
    // Loading is async, and a remote op can be applied to this key while it is
    // in flight — `handleRevfsOperation` writes through `setTree` with no
    // coordination against a load. Without this check the loaded tree, or the
    // default when nothing loaded, is written straight over that op: clobbered
    // in memory, PERSISTED over on disk, and `setTree` fires notifyTreeChanged
    // so the UI is actively repainted with the stale content.
    //
    // The default branch is the destructive one because its callers can be
    // terminal — the SyncRequest handler calls getTree, replies, and returns
    // without writing anything back, so nothing restores what it overwrote.
    // The loaded-tree branch has the same defect with a stale snapshot, which
    // is why the check sits above both rather than inside one.
    const appliedDuringLoad: RevfsNode | undefined = this.state.getTree(key);
    if (appliedDuringLoad) return appliedDuringLoad;

    if (result.type === 'load-tree' && result.tree) {
      this.state.setTree(key, result.tree);
      return result.tree;
    }

    const defaultTree: RevfsNode = createDefaultTree();
    this.state.setTree(key, defaultTree);
    await persistTree(io, key, defaultTree);
    return defaultTree;
  }

  async getServerTree(myCid: bigint): Promise<RevfsNode> {
    const key: string = serverTreeKey(myCid);
    const cached: RevfsNode | undefined = this.state.getTree(key);
    if (cached) return cached;

    const io: RevfsIO = this.ensureIO();
    const result: RevfsIntentResult = await io.execute({ type: 'load-tree', treeKey: key });
    // Same race as getTree above; server-scoped ops write through setTree too.
    const appliedDuringLoad: RevfsNode | undefined = this.state.getTree(key);
    if (appliedDuringLoad) return appliedDuringLoad;

    if (result.type === 'load-tree' && result.tree) {
      this.state.setTree(key, result.tree);
      return result.tree;
    }

    const defaultTree: RevfsNode = createDefaultTree();
    this.state.setTree(key, defaultTree);
    await persistTree(io, key, defaultTree);
    return defaultTree;
  }

  // ── Peer-Scoped Operations (delegated) ────────────────────────────────

  // Every mutator below is serialised on its tree's key -- see the header of
  // lib/serial-queue for the read-modify-write race this closes, and how bulk
  // delete hit it.
  //
  // Each returns whether the PEER acknowledged the operation, not whether the
  // local tree changed -- the local half is done and persisted either way, and
  // a false is queued for retry. These were `Promise<void>`, so the ack flag
  // `sendAndAwaitAck` was changed to return died here and the file manager
  // reported every peer operation as delivered.
  mkdir(myCid: bigint, peerCid: bigint, path: string): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => dirOps.peerMkdir(this.dirCtx(), myCid, peerCid, path)); }
  rmdir(myCid: bigint, peerCid: bigint, path: string): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => dirOps.peerRmdir(this.dirCtx(), myCid, peerCid, path)); }
  rename(myCid: bigint, peerCid: bigint, path: string, newName: string): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => dirOps.peerRename(this.dirCtx(), myCid, peerCid, path, newName)); }
  move(myCid: bigint, peerCid: bigint, src: string, dest: string): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => dirOps.peerMove(this.dirCtx(), myCid, peerCid, src, dest)); }
  copy(myCid: bigint, peerCid: bigint, src: string, dest: string): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => dirOps.peerCopy(this.dirCtx(), myCid, peerCid, src, dest)); }
  uploadFileToPeer(myCid: bigint, peerCid: bigint, dir: string, name: string, meta: RevfsFileMetadata, content: Uint8Array): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => fileOps.uploadFileToPeer(this.fileCtx(), myCid, peerCid, dir, name, meta, content)); }
  removeFileFromPeer(myCid: bigint, peerCid: bigint, path: string): Promise<boolean> { return withSerialLock(peerPairKey(myCid, peerCid), () => fileOps.removeFileFromPeer(this.fileCtx(), myCid, peerCid, path)); }
  downloadFileFromPeer(myCid: bigint, peerCid: bigint, path: string): Promise<string | undefined> { return fileOps.downloadFileFromPeer(this.fileCtx(), myCid, peerCid, path); }
  addSentFile(myCid: bigint, peerCid: bigint, t: { fileName: string; fileSize: number; fileType: string; transferId: string }): Promise<void> { return withSerialLock(peerPairKey(myCid, peerCid), () => fileOps.addSentFile(this.fileCtx(), myCid, peerCid, t)); }
  addReceivedFile(myCid: bigint, peerCid: bigint, t: { fileName: string; fileSize: number; fileType: string; transferId: string; downloadPath?: string }): Promise<void> { return withSerialLock(peerPairKey(myCid, peerCid), () => fileOps.addReceivedFile(this.fileCtx(), myCid, peerCid, t)); }

  // ── Server-Scoped Operations (delegated) ──────────────────────────────

  serverMkdir(myCid: bigint, path: string): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => dirOps.serverMkdir(this.dirCtx(), myCid, path)); }
  serverRmdir(myCid: bigint, path: string): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => dirOps.serverRmdir(this.dirCtx(), myCid, path)); }
  serverRename(myCid: bigint, path: string, name: string): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => dirOps.serverRename(this.dirCtx(), myCid, path, name)); }
  serverMove(myCid: bigint, src: string, dest: string): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => dirOps.serverMove(this.dirCtx(), myCid, src, dest)); }
  serverCopy(myCid: bigint, src: string, dest: string): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => dirOps.serverCopy(this.dirCtx(), myCid, src, dest)); }
  uploadFileToServer(myCid: bigint, dir: string, name: string, meta: RevfsFileMetadata, content: Uint8Array): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => serverFileOps.uploadFileToServer(this.fileCtx(), myCid, dir, name, meta, content)); }
  removeFileFromServer(myCid: bigint, path: string): Promise<void> { return withSerialLock(serverTreeKey(myCid), () => serverFileOps.removeFileFromServer(this.fileCtx(), myCid, path)); }
  downloadFileFromServer(myCid: bigint, path: string): Promise<string | undefined> { return serverFileOps.downloadFileFromServer(this.fileCtx(), myCid, path); }

  // ── Incoming Operation Handler ────────────────────────────────────────

  /** An operation that arrived from a peer. See revfs-inbound.ts. */
  async handleRevfsOperation(senderCid: bigint, myCid: bigint, op: RevfsOperation): Promise<void> {
    return applyInboundOperation(this.inboundCtx(), senderCid, myCid, op);
  }

  private inboundCtx(): InboundContext {
    return {
      state: this.state,
      ensureIO: () => this.ensureIO(),
      getTree: (mine: bigint, peer: bigint) => this.getTree(mine, peer),
      sendOp: (peer: bigint, operation: RevfsOperation) => this.sendOp(peer, operation),
    };
  }

  // ── Sync ──────────────────────────────────────────────────────────────

  /**
   * Ask a peer for their tree, and wait for it to arrive.
   *
   * Returns true only if the peer's tree actually landed.
   *
   * See `awaitTreeChange` for what "arrived" means and why.
   */
  async requestSync(myCid: bigint, peerCid: bigint, timeoutMs: number = SYNC_ANSWER_TIMEOUT_MS): Promise<boolean> {
    const answered: Promise<boolean> = awaitTreeChange(this.state, peerPairKey(myCid, peerCid), timeoutMs);

    const syncReq: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.SyncRequest, path: '/', timestamp: Date.now() };
    const sent: boolean = await this.sendOp(peerCid, syncReq);
    if (!sent) return false;
    return answered;
  }

  // ── Event Subscription ────────────────────────────────────────────────

  onTreeChanged(callback: TreeChangedCallback): () => void {
    return this.state.onTreeChanged(callback);
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private async sendAndAwaitAck(peerCid: bigint, op: RevfsOperation, key: TreeKey): Promise<boolean> {
    return sendAndAwaitAck({ state: this.state, io: this.ensureIO(), sendOp: (p: bigint, o: RevfsOperation) => this.sendOp(p, o) }, peerCid, op, key);
  }



  async retryPendingOps(key: TreeKey, peerCid: bigint): Promise<RetryOutcome> {
    return retryPendingOps({ state: this.state, io: this.ensureIO(), sendOp: (p: bigint, op: RevfsOperation) => this.sendOp(p, op) }, key, peerCid);
  }

  private async sendOp(peerCid: bigint, operation: RevfsOperation): Promise<boolean> {
    const io: RevfsIO = this.ensureIO();
    const result: RevfsIntentResult = await io.execute({ type: 'send-revfs-op', peerCid, operation });
    return result.type === 'send-revfs-op' && result.success;
  }

  private findFileInTree(tree: RevfsNode, path: string): RevfsNode | null {
    if (tree.path === path && tree.type === 'file') return tree;
    for (const child of tree.children ?? []) {
      const found: RevfsNode | null = this.findFileInTree(child, path);
      if (found) return found;
    }
    return null;
  }
}

// Singleton
export const revfsService: RevfsService = new RevfsService();
