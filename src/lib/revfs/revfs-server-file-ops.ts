/**
 * Server-scoped file operations.
 *
 * Split from the peer-scoped half so revfs-file-ops keeps the P2P path — where
 * the ack and tree-op reasoning lives — and this keeps the backend-storage path.
 */

import type { RevfsNode, RevfsFileMetadata } from '@/types/revfs-types';
import { RevfsFileState } from '@/types/revfs-types';
import {
  serverTreeKey,
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


export async function uploadFileToServer(
  ctx: FileOpsContext,
  myCid: bigint,
  dirPath: string,
  fileName: string,
  metadata: RevfsFileMetadata,
  content: Uint8Array,
): Promise<void> {
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);
  const filePath = dirPath.endsWith('/') ? `${dirPath}${fileName}` : `${dirPath}/${fileName}`;
  const io = ctx.ensureIO();

  // Bytes FIRST, tree second.
  //
  // This used to place the node and persist the tree before calling the
  // backend, then await the backend result and DISCARD it — with no rollback.
  // Combined with the request being rejected client-side, that produced a file
  // that existed in the tree, counted against the quota, and had no bytes
  // anywhere, under a green "Uploaded" toast.
  //
  // A node now appears if and only if its bytes were accepted. That costs the
  // optimistic render, which nothing here depended on: there is no progress UI,
  // and a file that silently is not there is far worse than one that takes a
  // moment to appear.
  const result = await io.execute({
    type: 'backend-send-file',
    cid: myCid,
    peerCid: null,
    fileName,
    content,
    virtualDir: filePath,
  });

  if (result.type !== 'backend-send-file' || !result.success) {
    throw new Error(`The server did not accept "${fileName}". It has not been uploaded.`);
  }

  const serverMetadata: RevfsFileMetadata = {
    ...metadata,
    uploadedByCid: myCid,
  };

  const [newTree] = treePlaceFile(tree, filePath, serverMetadata, myCid);
  const fileNode = ctx.findFileInTree(newTree, filePath);
  if (fileNode) fileNode.fileState = RevfsFileState.ServerStored;

  ctx.state.setTree(key, newTree);
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}

export async function removeFileFromServer(
  ctx: FileOpsContext,
  myCid: bigint,
  filePath: string,
): Promise<void> {
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);
  const io = ctx.ensureIO();

  // Delete the bytes BEFORE dropping the node, and stop if that fails.
  //
  // The node used to be removed and persisted first, then the backend delete
  // issued and its result ignored. A failed delete therefore left the bytes on
  // the server with nothing in the tree referencing them — storage consumed
  // permanently, with no node left to retry from. Removing the node is the
  // irreversible half locally, so it goes last.
  const fileNode = ctx.findFileInTree(tree, filePath);
  if (fileNode?.fileMetadata) {
    const deleted = await io.execute({
      type: 'backend-delete-file',
      cid: myCid,
      peerCid: null,
      // The file's PATH, which is the key upload writes as `virtual_path`.
      // This used to send `fileMetadata.virtualDirectory` — the containing
      // DIRECTORY — so it addressed `/docs` for a file at `/docs/notes.txt`.
      // Two different keys for the same object, one written and one read.
      //
      // Deriving from the path also ends a drift: rename and move rewrite
      // `node.path` and never touch `virtualDirectory`, so the stored field
      // grew staler with every rename while the path stayed correct.
      virtualDir: filePath,
    });

    if (deleted.type !== 'backend-delete-file' || !deleted.success) {
      throw new Error(
        `"${filePath}" could not be deleted from server storage. It has been left in place.`
      );
    }
  }

  const [newTree] = treeRemoveFile(tree, filePath);
  ctx.state.setTree(key, newTree);
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}

export async function downloadFileFromServer(
  ctx: FileOpsContext,
  myCid: bigint,
  filePath: string,
): Promise<string | undefined> {
  const tree = await ctx.getServerTree(myCid);
  const io = ctx.ensureIO();

  const fileNode = ctx.findFileInTree(tree, filePath);
  if (!fileNode?.fileMetadata) {
    throw new Error(`File not found or has no metadata: ${filePath}`);
  }

  const result = await io.execute({
    type: 'backend-download-file',
    cid: myCid,
    peerCid: null,
    // The file's PATH — the key upload writes. See removeFileFromServer above.
    virtualDir: filePath,
  });

  if (result.type === 'backend-download-file') {
    return result.downloadPath;
  }
  return undefined;
}
