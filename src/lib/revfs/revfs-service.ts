/**
 * RE-VFS Service (Singleton)
 *
 * Coordinates pure tree logic, in-memory state, and I/O router.
 * All public methods are async and return after persistence + network I/O.
 */

import type {
  RevfsNode,
  RevfsOperation,
  RevfsFileMetadata,
  PeerPairKey,
  ServerTreeKey,
  TreeKey,
} from '@/types/revfs-types';
import { RevfsOpType, TreeScope } from '@/types/revfs-types';
import {
  peerPairKey,
  serverTreeKey,
  createDefaultTree,
  mkdir as treeMkdir,
  rmdir as treeRmdir,
  placeFile as treePlaceFile,
  removeFile as treeRemoveFile,
  renameNode as treeRename,
  moveNode as treeMove,
  copyNode as treeCopy,
  applyRemoteOp,
  mergeTrees,
} from './tree-operations';
import { RevfsState, type TreeChangedCallback } from './revfs-state';
import { RevfsIO, type RevfsIODeps } from './revfs-io';

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

  // ── Directory Operations ──────────────────────────────────────────────

  async mkdir(myCid: bigint, peerCid: bigint, path: string): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const [newTree, op] = treeMkdir(tree, path);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    await this.sendAndAwaitAck(peerCid, op, key);
  }

  async rmdir(myCid: bigint, peerCid: bigint, path: string): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const [newTree, op] = treeRmdir(tree, path);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    await this.sendAndAwaitAck(peerCid, op, key);
  }

  async rename(myCid: bigint, peerCid: bigint, path: string, newName: string): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const [newTree, op] = treeRename(tree, path, newName);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    await this.sendAndAwaitAck(peerCid, op, key);
  }

  async move(myCid: bigint, peerCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const [newTree, op] = treeMove(tree, sourcePath, destParentPath);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    await this.sendAndAwaitAck(peerCid, op, key);
  }

  async copy(myCid: bigint, peerCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const [newTree, op] = treeCopy(tree, sourcePath, destParentPath, () => crypto.randomUUID());

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    await this.sendAndAwaitAck(peerCid, op, key);
  }

  // ── File Operations ───────────────────────────────────────────────────

  async uploadFileToPeer(
    myCid: bigint,
    peerCid: bigint,
    dirPath: string,
    fileName: string,
    metadata: RevfsFileMetadata,
  ): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const filePath = dirPath.endsWith('/') ? `${dirPath}${fileName}` : `${dirPath}/${fileName}`;
    const [newTree, op] = treePlaceFile(tree, filePath, metadata, myCid);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    await this.sendAndAwaitAck(peerCid, op, key);
  }

  async removeFileFromPeer(myCid: bigint, peerCid: bigint, filePath: string): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const [newTree, op] = treeRemoveFile(tree, filePath);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

    // Delete from backend too
    const fileNode = this.findFileInTree(tree, filePath);
    if (fileNode?.fileMetadata) {
      await io.execute({
        type: 'backend-delete-file',
        cid: myCid,
        peerCid,
        virtualDir: fileNode.fileMetadata.virtualDirectory,
      });
    }

    await this.sendAndAwaitAck(peerCid, op, key);
  }

  async downloadFileFromPeer(myCid: bigint, peerCid: bigint, filePath: string): Promise<string | undefined> {
    const tree = await this.getTree(myCid, peerCid);
    const io = this.ensureIO();

    // Find the file node to get virtualDirectory
    const findFile = (node: RevfsNode): RevfsNode | null => {
      if (node.path === filePath && node.type === 'file') return node;
      for (const child of node.children ?? []) {
        const found = findFile(child);
        if (found) return found;
      }
      return null;
    };

    const fileNode = findFile(tree);
    if (!fileNode?.fileMetadata) {
      throw new Error(`File not found or has no metadata: ${filePath}`);
    }

    const result = await io.execute({
      type: 'backend-download-file',
      cid: myCid,
      peerCid,
      virtualDir: fileNode.fileMetadata.virtualDirectory,
    });

    if (result.type === 'backend-download-file') {
      return result.downloadPath;
    }
    return undefined;
  }

  // ── Standard Transfer Auto-Population ─────────────────────────────────

  async addSentFile(
    myCid: bigint,
    peerCid: bigint,
    transfer: { fileName: string; fileSize: number; fileType: string; transferId: string },
  ): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const filePath = `/Sent Files/${transfer.fileName}`;
    const metadata: RevfsFileMetadata = {
      fileId: transfer.transferId,
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      fileType: transfer.fileType,
      virtualDirectory: '',
      uploadedByCid: myCid,
    };

    const [newTree, op] = treePlaceFile(tree, filePath, metadata, myCid);
    // Override state to Sent for standard transfers
    const fileNode = this.findFileInTree(newTree, filePath);
    if (fileNode) fileNode.fileState = RevfsFileState.Sent;

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    // Send op so peer sees it in their Received Files
    void this.sendOp(peerCid, op);
  }

  async addReceivedFile(
    myCid: bigint,
    peerCid: bigint,
    transfer: { fileName: string; fileSize: number; fileType: string; transferId: string; downloadPath?: string },
  ): Promise<void> {
    const key = peerPairKey(myCid, peerCid);
    const tree = await this.getTree(myCid, peerCid);
    const filePath = `/Received Files/${transfer.fileName}`;
    const metadata: RevfsFileMetadata = {
      fileId: transfer.transferId,
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      fileType: transfer.fileType,
      virtualDirectory: transfer.downloadPath ?? '',
      uploadedByCid: peerCid,
    };

    const [newTree] = treePlaceFile(tree, filePath, metadata, myCid);
    const fileNode = this.findFileInTree(newTree, filePath);
    if (fileNode) fileNode.fileState = RevfsFileState.Received;

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  }

  // ── Incoming Operation Handler ────────────────────────────────────────

  async handleRevfsOperation(senderCid: bigint, myCid: bigint, op: RevfsOperation): Promise<void> {
    debugLog('RevfsService', `[revfs] handleRevfsOperation: sender=${senderCid} myCid=${myCid} op=${op.op_type} path=${op.path}`);
    const key = peerPairKey(myCid, senderCid);

    // Handle ACK
    if (op.op_type === RevfsOpType.Ack && op.ack_op_id) {
      this.state.resolveAck(op.ack_op_id, op.success ?? true);
      return;
    }

    // Handle SyncRequest
    if (op.op_type === RevfsOpType.SyncRequest) {
      const tree = await this.getTree(myCid, senderCid);
      const syncResponse: RevfsOperation = {
        op_id: crypto.randomUUID(),
        op_type: RevfsOpType.SyncResponse,
        path: '/',
        tree,
        timestamp: Date.now(),
      };
      await this.sendOp(senderCid, syncResponse);
      return;
    }

    // Handle SyncResponse
    if (op.op_type === RevfsOpType.SyncResponse && op.tree) {
      const currentTree = await this.getTree(myCid, senderCid);
      const merged = mergeTrees(currentTree, applyRemoteOp(currentTree, op, myCid));
      this.state.setTree(key, merged);
      const io = this.ensureIO();
      await io.execute({ type: 'persist-tree', treeKey: key, tree: merged });
      return;
    }

    // Apply tree mutation
    const tree = await this.getTree(myCid, senderCid);
    const newTree = applyRemoteOp(tree, op, myCid);
    debugLog('RevfsService', `[revfs] handleRevfsOperation: applied ${op.op_type}, updating tree for key=${key}`);
    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

    // Send ACK
    const ackOp: RevfsOperation = {
      op_id: crypto.randomUUID(),
      op_type: RevfsOpType.Ack,
      path: op.path,
      ack_op_id: op.op_id,
      success: true,
      timestamp: Date.now(),
    };
    await this.sendOp(senderCid, ackOp);
  }

  // ── Sync ──────────────────────────────────────────────────────────────

  async requestSync(myCid: bigint, peerCid: bigint): Promise<void> {
    const syncReq: RevfsOperation = {
      op_id: crypto.randomUUID(),
      op_type: RevfsOpType.SyncRequest,
      path: '/',
      timestamp: Date.now(),
    };
    await this.sendOp(peerCid, syncReq);
  }

  // ── Event Subscription ────────────────────────────────────────────────

  onTreeChanged(callback: TreeChangedCallback): () => void {
    return this.state.onTreeChanged(callback);
  }

  // ========================================================================
  // Server-Scoped Tree Operations (No P2P Sync)
  // ========================================================================
  // These methods store files on the Citadel server instead of a peer.
  // No P2P messaging or ACK - operations are local tree + server backend.

  /**
   * Get or create the server-scoped tree for this user.
   * Server trees are private to the user (not shared with peers).
   */
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

    // Create default tree for server storage (same structure but different semantics)
    const defaultTree = createDefaultTree();
    this.state.setTree(key, defaultTree);
    await io.execute({ type: 'persist-tree', treeKey: key, tree: defaultTree });
    return defaultTree;
  }

  /**
   * Create a directory in the server tree.
   * No P2P sync needed - server tree is local only.
   */
  async serverMkdir(myCid: bigint, path: string): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const [newTree] = treeMkdir(tree, path);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    // No P2P sync for server trees
  }

  /**
   * Remove a directory from the server tree.
   * No P2P sync needed - server tree is local only.
   */
  async serverRmdir(myCid: bigint, path: string): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const [newTree] = treeRmdir(tree, path);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
    // No P2P sync for server trees
  }

  /**
   * Rename a file or directory in the server tree.
   * No P2P sync needed - server tree is local only.
   */
  async serverRename(myCid: bigint, path: string, newName: string): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const [newTree] = treeRename(tree, path, newName);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  }

  /**
   * Move a file or directory in the server tree.
   * No P2P sync needed - server tree is local only.
   */
  async serverMove(myCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const [newTree] = treeMove(tree, sourcePath, destParentPath);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  }

  /**
   * Copy a file or directory in the server tree.
   * No P2P sync needed - server tree is local only.
   */
  async serverCopy(myCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const [newTree] = treeCopy(tree, sourcePath, destParentPath, () => crypto.randomUUID());

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  }

  /**
   * Upload a file to server storage.
   * File is encrypted and stored on the Citadel server.
   */
  async uploadFileToServer(
    myCid: bigint,
    dirPath: string,
    fileName: string,
    metadata: RevfsFileMetadata,
  ): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const filePath = dirPath.endsWith('/') ? `${dirPath}${fileName}` : `${dirPath}/${fileName}`;

    // Override metadata to mark as server-stored
    const serverMetadata: RevfsFileMetadata = {
      ...metadata,
      uploadedByCid: myCid, // Server files are always owned by the user
    };

    const [newTree] = treePlaceFile(tree, filePath, serverMetadata, myCid);

    // Override file state to ServerStored
    const fileNode = this.findFileInTree(newTree, filePath);
    if (fileNode) fileNode.fileState = RevfsFileState.ServerStored;

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

    // Send file to server (peerCid: null = server storage)
    await io.execute({
      type: 'backend-send-file',
      cid: myCid,
      peerCid: null, // null = server storage
      source: metadata.virtualDirectory, // Source path on local filesystem
      virtualDir: filePath,
    });
  }

  /**
   * Remove a file from server storage.
   */
  async removeFileFromServer(myCid: bigint, filePath: string): Promise<void> {
    const key = serverTreeKey(myCid);
    const tree = await this.getServerTree(myCid);
    const [newTree] = treeRemoveFile(tree, filePath);

    this.state.setTree(key, newTree);
    const io = this.ensureIO();
    await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

    // Delete from server backend (peerCid: null = server storage)
    const fileNode = this.findFileInTree(tree, filePath);
    if (fileNode?.fileMetadata) {
      await io.execute({
        type: 'backend-delete-file',
        cid: myCid,
        peerCid: null, // null = server storage
        virtualDir: fileNode.fileMetadata.virtualDirectory,
      });
    }
  }

  /**
   * Download a file from server storage.
   * Returns the local download path on success.
   */
  async downloadFileFromServer(myCid: bigint, filePath: string): Promise<string | undefined> {
    const tree = await this.getServerTree(myCid);
    const io = this.ensureIO();

    const fileNode = this.findFileInTree(tree, filePath);
    if (!fileNode?.fileMetadata) {
      throw new Error(`File not found or has no metadata: ${filePath}`);
    }

    const result = await io.execute({
      type: 'backend-download-file',
      cid: myCid,
      peerCid: null, // null = server storage
      virtualDir: fileNode.fileMetadata.virtualDirectory,
    });

    if (result.type === 'backend-download-file') {
      return result.downloadPath;
    }
    return undefined;
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private async sendAndAwaitAck(peerCid: bigint, op: RevfsOperation, key: TreeKey): Promise<void> {
    const ackPromise = this.state.registerAck(op.op_id, ACK_TIMEOUT_MS);
    const sendResult = await this.sendOp(peerCid, op);
    if (!sendResult) {
      // Queue for retry
      this.state.addPendingOp(key, { operation: op, retryCount: 0, createdAt: Date.now() });
      const io = this.ensureIO();
      await io.execute({ type: 'persist-pending-ops', treeKey: key, ops: this.state.getPendingOps(key) });
      return;
    }
    try {
      await ackPromise;
    } catch {
      // ACK timeout — queue for retry
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

// Need this import for the Sent/Received state override
import { RevfsFileState } from '@/types/revfs-types';
import { debugLog } from '@/lib/debug-config';

// Singleton
export const revfsService = new RevfsService();
