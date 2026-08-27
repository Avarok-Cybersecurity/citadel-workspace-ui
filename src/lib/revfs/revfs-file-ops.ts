/**
 * RE-VFS File Operations
 *
 * All file-related service methods: upload, download, remove, sent/received tracking.
 * For both peer-scoped (P2P) and server-scoped storage.
 */

import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';
import { RevfsFileState } from '@/types/revfs-types';
import {
  peerPairKey,
  placeFile as treePlaceFile,
  removeFile as treeRemoveFile,
} from './tree-operations';
import type { RevfsState } from './revfs-state';
import type { RevfsIO } from './revfs-io';

export interface FileOpsContext {
  state: RevfsState;
  ensureIO: () => RevfsIO;
  getTree: (myCid: bigint, peerCid: bigint) => Promise<RevfsNode>;
  getServerTree: (myCid: bigint) => Promise<RevfsNode>;
  sendAndAwaitAck: (peerCid: bigint, op: import('@/types/revfs-types').RevfsOperation, key: import('@/types/revfs-types').TreeKey) => Promise<void>;
  sendOp: (peerCid: bigint, operation: import('@/types/revfs-types').RevfsOperation) => Promise<boolean>;
  findFileInTree: (tree: RevfsNode, path: string) => RevfsNode | null;
}

// ── Peer-Scoped File Operations ───────────────────────────────────────────

export async function uploadFileToPeer(
  ctx: FileOpsContext,
  myCid: bigint,
  peerCid: bigint,
  dirPath: string,
  fileName: string,
  metadata: RevfsFileMetadata,
  content: Uint8Array,
): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const filePath = dirPath.endsWith('/') ? `${dirPath}${fileName}` : `${dirPath}/${fileName}`;
  const io = ctx.ensureIO();

  // Send the BYTES, then record the file.
  //
  // This path never transmitted any: it placed the node, persisted the tree and
  // sent the peer a tree op describing a file whose contents existed only in
  // the uploader's page. Both peers then showed the file, and neither had it.
  //
  // Same ordering rationale as the server path — a node appears if and only if
  // its bytes were accepted.
  const result = await io.execute({
    type: 'backend-send-file',
    cid: myCid,
    peerCid,
    fileName,
    content,
    virtualDir: filePath,
  });

  if (result.type !== 'backend-send-file' || !result.success) {
    throw new Error(`"${fileName}" could not be sent to the peer. It has not been uploaded.`);
  }

  const [newTree, op] = treePlaceFile(tree, filePath, metadata, myCid);

  ctx.state.setTree(key, newTree);
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function removeFileFromPeer(
  ctx: FileOpsContext,
  myCid: bigint,
  peerCid: bigint,
  filePath: string,
): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeRemoveFile(tree, filePath);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

  const fileNode = ctx.findFileInTree(tree, filePath);
  if (fileNode?.fileMetadata) {
    await io.execute({
      type: 'backend-delete-file',
      cid: myCid,
      peerCid,
      virtualDir: fileNode.fileMetadata.virtualDirectory,
    });
  }

  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function downloadFileFromPeer(
  ctx: FileOpsContext,
  myCid: bigint,
  peerCid: bigint,
  filePath: string,
): Promise<string | undefined> {
  const tree = await ctx.getTree(myCid, peerCid);
  const io = ctx.ensureIO();

  const fileNode = ctx.findFileInTree(tree, filePath);
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

// ── Standard Transfer Auto-Population ─────────────────────────────────────

export async function addSentFile(
  ctx: FileOpsContext,
  myCid: bigint,
  peerCid: bigint,
  transfer: { fileName: string; fileSize: number; fileType: string; transferId: string },
): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
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
  const fileNode = ctx.findFileInTree(newTree, filePath);
  if (fileNode) fileNode.fileState = RevfsFileState.Sent;

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  void ctx.sendOp(peerCid, op);
}

export async function addReceivedFile(
  ctx: FileOpsContext,
  myCid: bigint,
  peerCid: bigint,
  transfer: { fileName: string; fileSize: number; fileType: string; transferId: string; downloadPath?: string },
): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
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
  const fileNode = ctx.findFileInTree(newTree, filePath);
  if (fileNode) fileNode.fileState = RevfsFileState.Received;

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}
