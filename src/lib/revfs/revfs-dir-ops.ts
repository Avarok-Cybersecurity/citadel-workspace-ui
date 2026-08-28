/**
 * RE-VFS Directory Operations
 *
 * All directory-related service methods: peer + server scoped.
 * Delegates to pure tree functions and IO router.
 */

import type { RevfsNode, TreeKey } from '@/types/revfs-types';
import {
  peerPairKey,
  serverTreeKey,
  mkdir as treeMkdir,
  rmdir as treeRmdir,
  findNode,
  collectFiles,
  renameNode as treeRename,
  moveNode as treeMove,
  copyNode as treeCopy,
} from './tree-operations';
import { debugLog } from '@/lib/debug-config';
import { countByteKeyRefs } from './tree-byte-refs';
import type { RevfsState } from './revfs-state';
import type { RevfsIO } from './revfs-io';
import { persistTree } from './persist-tree';

export interface DirOpsContext {
  state: RevfsState;
  ensureIO: () => RevfsIO;
  getTree: (myCid: bigint, peerCid: bigint) => Promise<RevfsNode>;
  getServerTree: (myCid: bigint) => Promise<RevfsNode>;
  sendAndAwaitAck: (peerCid: bigint, op: import('@/types/revfs-types').RevfsOperation, key: TreeKey) => Promise<void>;
}

// ── Peer-Scoped Directory Operations ──────────────────────────────────────

export async function peerMkdir(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, path: string): Promise<void> {
  const key: string = peerPairKey(myCid, peerCid);
  const tree: RevfsNode = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeMkdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerRmdir(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, path: string): Promise<void> {
  const key: string = peerPairKey(myCid, peerCid);
  const tree: RevfsNode = await ctx.getTree(myCid, peerCid);

  // Collect BEFORE the removal — rmdir takes the list of what was inside with
  // it. `serverRmdir` has done this since the orphaned-bytes fix; the peer twin
  // never got it, so deleting a folder of peer-stored files removed them from
  // both trees while every encrypted blob stayed in the host's storage, with no
  // tree entry left to reach it from. `removeFileFromPeer` deletes with the
  // peer's cid for exactly this reason.
  const target = findNode(tree, path);
  const orphaned: RevfsNode[] = target ? collectFiles(target) : [];

  const [newTree, op] = treeRmdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
  await ctx.sendAndAwaitAck(peerCid, op, key);

  await sweepOrphanedBytes(io, myCid, peerCid, orphaned, newTree, 'peer storage');
}

export async function peerRename(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, path: string, newName: string): Promise<void> {
  const key: string = peerPairKey(myCid, peerCid);
  const tree: RevfsNode = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeRename(tree, path, newName);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerMove(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key: string = peerPairKey(myCid, peerCid);
  const tree: RevfsNode = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeMove(tree, sourcePath, destParentPath);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerCopy(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key: string = peerPairKey(myCid, peerCid);
  const tree: RevfsNode = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeCopy(tree, sourcePath, destParentPath, () => crypto.randomUUID());

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

/*
 * Server-scoped directory operations.
 *
 * These do NOT mirror the peer-scoped ones above, and the difference is a
 * backend limitation rather than an oversight:
 *
 *   rmdir   propagates — each file beneath the directory is deleted server-side,
 *           because the backend stores files by virtual path and would otherwise
 *           keep the bytes (and the quota) forever.
 *   mkdir   has nothing to propagate. An empty directory is purely a client-side
 *           tree node; the backend only learns of it when a file lands in it.
 *   rename  cannot propagate. The backend exposes send / download / delete for a
 *   move    file and no way to re-path one, so honouring these server-side would
 *   copy    mean re-uploading every file under the subtree — and the local client
 *           does not necessarily hold those bytes. They stay local-only until the
 *           backend grows a move/rename primitive.
 *
 * The peer-scoped versions have no such limit: they send the operation and the
 * peer applies it to their own copy of the tree.
 */
// ── Server-Scoped Directory Operations (No P2P Sync) ──────────────────────

export async function serverMkdir(ctx: DirOpsContext, myCid: bigint, path: string): Promise<void> {
  const key: string = serverTreeKey(myCid);
  const tree: RevfsNode = await ctx.getServerTree(myCid);
  const [newTree] = treeMkdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
}

/**
 * Delete the bytes of files that a directory removal just orphaned.
 *
 * A directory is a tree-only concept: the backend stores files keyed by virtual
 * path and knows nothing about the folder above them. So removing a folder from
 * the tree without this leaves every blob under it on disk forever —
 * unreferenced, unreclaimable, and still consuming the real quota even though
 * the storage bar stops counting it.
 */
async function sweepOrphanedBytes(
  io: RevfsIO,
  myCid: bigint,
  peerCid: bigint | null,
  orphaned: RevfsNode[],
  remainingTree: RevfsNode,
  storageLabel: string,
): Promise<void> {
  const undeleted: string[] = [];
  // Copies share their original's byte key (tree-byte-refs.ts): a blob still
  // referenced OUTSIDE the removed folder must survive the sweep — rmdir of a
  // folder holding only a copy used to destroy the original's bytes — and two
  // copies INSIDE it are one blob, one delete.
  const sweptKeys: Set<string> = new Set<string>();
  for (const file of orphaned) {
    if (!file.fileMetadata) {
      // Nothing identifies this file to the backend, so it cannot be deleted
      // there. Say so rather than dropping it silently and reporting success.
      debugLog('RevfsDirOps', `rmdir: no metadata for ${file.path}, cannot delete remotely`);
      continue;
    }
    const byteKey: string = file.fileMetadata.virtualDirectory;
    if (byteKey !== '') {
      if (sweptKeys.has(byteKey)) continue;
      sweptKeys.add(byteKey);
      if (countByteKeyRefs(remainingTree, byteKey) > 0) continue;
    }
    const deleted = await io.execute({
      type: 'backend-delete-file',
      cid: myCid,
      peerCid,
      // The upload-time key. See uploadFileToServer — a renamed file's bytes
      // stay where they were written, so node.path is the wrong thing here.
      virtualDir: file.fileMetadata.virtualDirectory,
    });

    // Collected rather than thrown per file: the directory is already gone from
    // the tree, so aborting halfway would leave the remaining files both
    // undeleted AND unreported. The user is told which ones survived.
    if (deleted.type !== 'backend-delete-file' || !deleted.success) {
      undeleted.push(file.path);
    }
  }

  if (undeleted.length > 0) {
    throw new Error(
      `The folder was removed, but ${undeleted.length} file(s) could not be deleted from ` +
        `${storageLabel} and are still using space: ${undeleted.join(', ')}`
    );
  }
}

export async function serverRmdir(ctx: DirOpsContext, myCid: bigint, path: string): Promise<void> {
  const key: string = serverTreeKey(myCid);
  const tree: RevfsNode = await ctx.getServerTree(myCid);

  // Collect the files BEFORE the removal — rmdir drops the whole subtree, taking
  // the list of what was inside it with it.
  //
  // The peer-scoped twin sends its op to the peer, who applies it to their copy.
  // There is no peer here, and no directory concept on the backend either: it
  // stores files keyed by virtual path. So propagating a directory removal means
  // deleting each file that lived under it, or the bytes stay on the server and
  // the user's quota never comes back.
  const target = findNode(tree, path);
  const orphaned: RevfsNode[] = target ? collectFiles(target) : [];

  const [newTree] = treeRmdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);

  await sweepOrphanedBytes(io, myCid, null, orphaned, newTree, 'server storage');
}

export async function serverRename(ctx: DirOpsContext, myCid: bigint, path: string, newName: string): Promise<void> {
  const key: string = serverTreeKey(myCid);
  const tree: RevfsNode = await ctx.getServerTree(myCid);
  const [newTree] = treeRename(tree, path, newName);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
}

export async function serverMove(ctx: DirOpsContext, myCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key: string = serverTreeKey(myCid);
  const tree: RevfsNode = await ctx.getServerTree(myCid);
  const [newTree] = treeMove(tree, sourcePath, destParentPath);

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
}

export async function serverCopy(ctx: DirOpsContext, myCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key: string = serverTreeKey(myCid);
  const tree: RevfsNode = await ctx.getServerTree(myCid);
  const [newTree] = treeCopy(tree, sourcePath, destParentPath, () => crypto.randomUUID());

  ctx.state.setTree(key, newTree);
  const io: RevfsIO = ctx.ensureIO();
  await persistTree(io, key, newTree);
}
