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
import type { RevfsState } from './revfs-state';
import type { RevfsIO } from './revfs-io';

export interface DirOpsContext {
  state: RevfsState;
  ensureIO: () => RevfsIO;
  getTree: (myCid: bigint, peerCid: bigint) => Promise<RevfsNode>;
  getServerTree: (myCid: bigint) => Promise<RevfsNode>;
  sendAndAwaitAck: (peerCid: bigint, op: import('@/types/revfs-types').RevfsOperation, key: TreeKey) => Promise<void>;
}

// ── Peer-Scoped Directory Operations ──────────────────────────────────────

export async function peerMkdir(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, path: string): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeMkdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerRmdir(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, path: string): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeRmdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerRename(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, path: string, newName: string): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeRename(tree, path, newName);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerMove(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeMove(tree, sourcePath, destParentPath);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
  await ctx.sendAndAwaitAck(peerCid, op, key);
}

export async function peerCopy(ctx: DirOpsContext, myCid: bigint, peerCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key = peerPairKey(myCid, peerCid);
  const tree = await ctx.getTree(myCid, peerCid);
  const [newTree, op] = treeCopy(tree, sourcePath, destParentPath, () => crypto.randomUUID());

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
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
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);
  const [newTree] = treeMkdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}

export async function serverRmdir(ctx: DirOpsContext, myCid: bigint, path: string): Promise<void> {
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);

  // Collect the files BEFORE the removal — rmdir drops the whole subtree, taking
  // the list of what was inside it with it.
  //
  // The peer-scoped twin sends its op to the peer, who applies it to their copy.
  // There is no peer here, and no directory concept on the backend either: it
  // stores files keyed by virtual path. So propagating a directory removal means
  // deleting each file that lived under it, or the bytes stay on the server and
  // the user's quota never comes back.
  const target = findNode(tree, path);
  const orphaned = target ? collectFiles(target) : [];

  const [newTree] = treeRmdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });

  for (const file of orphaned) {
    if (!file.fileMetadata) {
      // Nothing identifies this file to the backend, so it cannot be deleted
      // there. Say so rather than dropping it silently and reporting success.
      debugLog('RevfsDirOps', `serverRmdir: no metadata for ${file.path}, cannot delete server-side`);
      continue;
    }
    await io.execute({
      type: 'backend-delete-file',
      cid: myCid,
      peerCid: null,
      // The file's PATH — the key upload writes, not the stored directory.
      virtualDir: file.path,
    });
  }
}

export async function serverRename(ctx: DirOpsContext, myCid: bigint, path: string, newName: string): Promise<void> {
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);
  const [newTree] = treeRename(tree, path, newName);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}

export async function serverMove(ctx: DirOpsContext, myCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);
  const [newTree] = treeMove(tree, sourcePath, destParentPath);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}

export async function serverCopy(ctx: DirOpsContext, myCid: bigint, sourcePath: string, destParentPath: string): Promise<void> {
  const key = serverTreeKey(myCid);
  const tree = await ctx.getServerTree(myCid);
  const [newTree] = treeCopy(tree, sourcePath, destParentPath, () => crypto.randomUUID());

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
}
