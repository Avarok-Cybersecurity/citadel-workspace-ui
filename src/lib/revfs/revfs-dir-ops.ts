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
  renameNode as treeRename,
  moveNode as treeMove,
  copyNode as treeCopy,
} from './tree-operations';
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
  const [newTree] = treeRmdir(tree, path);

  ctx.state.setTree(key, newTree);
  const io = ctx.ensureIO();
  await io.execute({ type: 'persist-tree', treeKey: key, tree: newTree });
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
