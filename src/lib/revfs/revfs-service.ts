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
import {
  peerPairKey,
  serverTreeKey,
  createDefaultTree,
  applyRemoteOp,
  mergeTrees,
} from './tree-operations';
import { RevfsState, type TreeChangedCallback } from './revfs-state';
import { RevfsIO, type RevfsIODeps } from './revfs-io';
import { debugLog } from '@/lib/debug-config';
import type { DirOpsContext } from './revfs-dir-ops';
import * as dirOps from './revfs-dir-ops';
import type { FileOpsContext } from './revfs-file-ops';
import * as fileOps from './revfs-file-ops';

const ACK_TIMEOUT_MS = 15_000;

export class RevfsService {
  private readonly state = new RevfsState();
  private io: RevfsIO | null = null;
  private initialized = false;

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
    const key = peerPairKey(myCid, peerCid);
    const cached = this.state.getTree(key);
    if (cached) return cached;

    const io = this.ensureIO();
    const result = await io.execute({ type: 'load-tree', treeKey: key });
    if (result.type === 'load-tree' && result.tree) {
      this.state.setTree(key, result.tree);
      return result.tree;
    }

    const defaultTree = createDefaultTree();
    this.state.setTree(key, defaultTree);
    await io.execute({ type: 'persist-tree', treeKey: key, tree: defaultTree });
    return defaultTree;
  }

  async getServerTree(myCid: bigint): Promise<RevfsNode> {
    const key = serverTreeKey(myCid);
    const cached = this.state.getTree(key);
    if (cached) return cached;

    const io = this.ensureIO();
    const result = await io.execute({ type: 'load-tree', treeKey: key });
    if (result.type === 'load-tree' && result.tree) {
      this.state.setTree(key, result.tree);
      return result.tree;
    }

    const defaultTree = createDefaultTree();
    this.state.setTree(key, defaultTree);
    await io.execute({ type: 'persist-tree', treeKey: key, tree: defaultTree });
    return defaultTree;
  }

  // ── Peer-Scoped Operations (delegated) ────────────────────────────────

  mkdir(myCid: bigint, peerCid: bigint, path: string): Promise<void> { return dirOps.peerMkdir(this.dirCtx(), myCid, peerCid, path); }
  rmdir(myCid: bigint, peerCid: bigint, path: string): Promise<void> { return dirOps.peerRmdir(this.dirCtx(), myCid, peerCid, path); }
  rename(myCid: bigint, peerCid: bigint, path: string, newName: string): Promise<void> { return dirOps.peerRename(this.dirCtx(), myCid, peerCid, path, newName); }
  move(myCid: bigint, peerCid: bigint, src: string, dest: string): Promise<void> { return dirOps.peerMove(this.dirCtx(), myCid, peerCid, src, dest); }
  copy(myCid: bigint, peerCid: bigint, src: string, dest: string): Promise<void> { return dirOps.peerCopy(this.dirCtx(), myCid, peerCid, src, dest); }
  uploadFileToPeer(myCid: bigint, peerCid: bigint, dir: string, name: string, meta: RevfsFileMetadata): Promise<void> { return fileOps.uploadFileToPeer(this.fileCtx(), myCid, peerCid, dir, name, meta); }
  removeFileFromPeer(myCid: bigint, peerCid: bigint, path: string): Promise<void> { return fileOps.removeFileFromPeer(this.fileCtx(), myCid, peerCid, path); }
  downloadFileFromPeer(myCid: bigint, peerCid: bigint, path: string): Promise<string | undefined> { return fileOps.downloadFileFromPeer(this.fileCtx(), myCid, peerCid, path); }
  addSentFile(myCid: bigint, peerCid: bigint, t: { fileName: string; fileSize: number; fileType: string; transferId: string }): Promise<void> { return fileOps.addSentFile(this.fileCtx(), myCid, peerCid, t); }
  addReceivedFile(myCid: bigint, peerCid: bigint, t: { fileName: string; fileSize: number; fileType: string; transferId: string; downloadPath?: string }): Promise<void> { return fileOps.addReceivedFile(this.fileCtx(), myCid, peerCid, t); }

  // ── Server-Scoped Operations (delegated) ──────────────────────────────

  serverMkdir(myCid: bigint, path: string): Promise<void> { return dirOps.serverMkdir(this.dirCtx(), myCid, path); }
  serverRmdir(myCid: bigint, path: string): Promise<void> { return dirOps.serverRmdir(this.dirCtx(), myCid, path); }
  serverRename(myCid: bigint, path: string, name: string): Promise<void> { return dirOps.serverRename(this.dirCtx(), myCid, path, name); }
  serverMove(myCid: bigint, src: string, dest: string): Promise<void> { return dirOps.serverMove(this.dirCtx(), myCid, src, dest); }
  serverCopy(myCid: bigint, src: string, dest: string): Promise<void> { return dirOps.serverCopy(this.dirCtx(), myCid, src, dest); }
  uploadFileToServer(myCid: bigint, dir: string, name: string, meta: RevfsFileMetadata): Promise<void> { return fileOps.uploadFileToServer(this.fileCtx(), myCid, dir, name, meta); }
  removeFileFromServer(myCid: bigint, path: string): Promise<void> { return fileOps.removeFileFromServer(this.fileCtx(), myCid, path); }
  downloadFileFromServer(myCid: bigint, path: string): Promise<string | undefined> { return fileOps.downloadFileFromServer(this.fileCtx(), myCid, path); }

  // ── Incoming Operation Handler ────────────────────────────────────────

  async handleRevfsOperation(senderCid: bigint, myCid: bigint, op: RevfsOperation): Promise<void> {
    debugLog('RevfsService', `[revfs] handleRevfsOperation: sender=${senderCid} myCid=${myCid} op=${op.op_type} path=${op.path}`);
    const key = peerPairKey(myCid, senderCid);

    if (op.op_type === RevfsOpType.Ack && op.ack_op_id) {
      this.state.resolveAck(op.ack_op_id, op.success ?? true);
      return;
    }

    if (op.op_type === RevfsOpType.SyncRequest) {
      const tree = await this.getTree(myCid, senderCid);
      const syncResponse: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.SyncResponse, path: '/', tree, timestamp: Date.now() };
      await this.sendOp(senderCid, syncResponse);
      return;
    }

    if (op.op_type === RevfsOpType.SyncResponse && op.tree) {
      const currentTree = await this.getTree(myCid, senderCid);
      const merged = mergeTrees(currentTree, applyRemoteOp(currentTree, op, myCid));
      this.state.setTree(key, merged);
      const io = this.ensureIO();
      await io.execute({ type: 'persist-tree', treeKey: key, tree: merged });
      return;
    }

    const tree = await this.getTree(myCid, senderCid);
    const newTree = applyRemoteOp(tree, op, myCid);
    debugLog('RevfsService', `[revfs] handleRevfsOperation: applied ${op.op_type}, updating tree for key=${key}`);
    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

    const ackOp: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.Ack, path: op.path, ack_op_id: op.op_id, success: true, timestamp: Date.now() };
    await this.sendOp(senderCid, ackOp);
  }

  // ── Sync ──────────────────────────────────────────────────────────────

  async requestSync(myCid: bigint, peerCid: bigint): Promise<void> {
    const syncReq: RevfsOperation = { op_id: crypto.randomUUID(), op_type: RevfsOpType.SyncRequest, path: '/', timestamp: Date.now() };
    await this.sendOp(peerCid, syncReq);
  }

  // ── Event Subscription ────────────────────────────────────────────────

  onTreeChanged(callback: TreeChangedCallback): () => void {
    return this.state.onTreeChanged(callback);
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private async sendAndAwaitAck(peerCid: bigint, op: RevfsOperation, key: TreeKey): Promise<void> {
    const ackPromise = this.state.registerAck(op.op_id, ACK_TIMEOUT_MS);
    const sendResult = await this.sendOp(peerCid, op);
    if (!sendResult) {
      this.state.addPendingOp(key, { operation: op, retryCount: 0, createdAt: Date.now() });
      const io = this.ensureIO();
      await io.execute({ type: 'persist-pending-ops', treeKey: key, ops: this.state.getPendingOps(key) });
      return;
    }
    try {
      await ackPromise;
    } catch {
      this.state.addPendingOp(key, { operation: op, retryCount: 0, createdAt: Date.now() });
      const io = this.ensureIO();
      await io.execute({ type: 'persist-pending-ops', treeKey: key, ops: this.state.getPendingOps(key) });
    }
  }

  private async sendOp(peerCid: bigint, operation: RevfsOperation): Promise<boolean> {
    const io = this.ensureIO();
    const result = await io.execute({ type: 'send-revfs-op', peerCid, operation });
    return result.type === 'send-revfs-op' && result.success;
  }

  private findFileInTree(tree: RevfsNode, path: string): RevfsNode | null {
    if (tree.path === path && tree.type === 'file') return tree;
    for (const child of tree.children ?? []) {
      const found = this.findFileInTree(child, path);
      if (found) return found;
    }
    return null;
  }
}

// Singleton
export const revfsService = new RevfsService();
