/**
 * RE-VFS Tree Mutations (Pure Functions)
 *
 * mkdir, rmdir, placeFile, removeFile — each returns a new tree + RevfsOperation.
 */

import {
  type RevfsNode,
  type RevfsFileMetadata,
  type RevfsOperation,
  RevfsFileState,
  RevfsOpType,
  PROTECTED_DIRS,
} from '@/types/revfs-types';
import {
  normalizePath,
  parentPath,
  baseName,
  cloneTree,
  findNode,
  makeOpId,
  now,
} from './tree-queries';

// ============================================================================
// Mkdir
// ============================================================================

export function mkdir(tree: RevfsNode, path: string): [RevfsNode, RevfsOperation] {
  const normalized = normalizePath(path);
  const parent = parentPath(normalized);
  const name = baseName(normalized);

  const newTree = cloneTree(tree);
  const parentNode = findNode(newTree, parent);
  if (!parentNode || parentNode.type !== 'directory') {
    throw new Error(`Parent directory not found: ${parent}`);
  }
  if (findNode(newTree, normalized)) {
    throw new Error(`Directory already exists: ${normalized}`);
  }

  const t = now();
  const child: RevfsNode = {
    name,
    type: 'directory',
    path: normalized,
    children: [],
    createdAt: t,
    updatedAt: t,
  };

  if (!parentNode.children) parentNode.children = [];
  parentNode.children.push(child);
  parentNode.updatedAt = t;

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.Mkdir,
    path: normalized,
    timestamp: t,
  };

  return [newTree, op];
}

// ============================================================================
// Rmdir
// ============================================================================

export function rmdir(tree: RevfsNode, path: string): [RevfsNode, RevfsOperation] {
  const normalized = normalizePath(path);

  if (PROTECTED_DIRS.has(normalized)) {
    throw new Error(`Cannot remove protected directory: ${normalized}`);
  }
  if (normalized === '/') {
    throw new Error('Cannot remove root directory');
  }

  const parent = parentPath(normalized);
  const newTree = cloneTree(tree);
  const parentNode = findNode(newTree, parent);
  if (!parentNode || !parentNode.children) {
    throw new Error(`Parent directory not found: ${parent}`);
  }

  const idx = parentNode.children.findIndex(c => c.path === normalized);
  if (idx < 0) {
    throw new Error(`Directory not found: ${normalized}`);
  }
  if (parentNode.children[idx].type !== 'directory') {
    throw new Error(`Not a directory: ${normalized}`);
  }

  parentNode.children.splice(idx, 1);
  parentNode.updatedAt = now();

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.Rmdir,
    path: normalized,
    timestamp: now(),
  };

  return [newTree, op];
}

// ============================================================================
// Place File
// ============================================================================

export function placeFile(
  tree: RevfsNode,
  path: string,
  metadata: RevfsFileMetadata,
  viewerCid: bigint,
): [RevfsNode, RevfsOperation] {
  const normalized = normalizePath(path);
  const parent = parentPath(normalized);
  const name = baseName(normalized);

  const newTree = cloneTree(tree);
  const parentNode = findNode(newTree, parent);
  if (!parentNode || parentNode.type !== 'directory') {
    throw new Error(`Parent directory not found: ${parent}`);
  }

  // Determine file state: if I uploaded it, I'm Hosting; otherwise Remote
  const fileState = metadata.uploadedByCid === viewerCid
    ? RevfsFileState.Hosted
    : RevfsFileState.Remote;

  const t = now();
  const fileNode: RevfsNode = {
    name,
    type: 'file',
    path: normalized,
    fileState,
    fileMetadata: metadata,
    createdAt: t,
    updatedAt: t,
  };

  if (!parentNode.children) parentNode.children = [];

  // Replace existing file at same path if present
  const existingIdx = parentNode.children.findIndex(c => c.path === normalized);
  if (existingIdx >= 0) {
    parentNode.children[existingIdx] = fileNode;
  } else {
    parentNode.children.push(fileNode);
  }
  parentNode.updatedAt = t;

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.PlaceFile,
    path: normalized,
    metadata,
    timestamp: t,
  };

  return [newTree, op];
}

// ============================================================================
// Remove File
// ============================================================================

export function removeFile(tree: RevfsNode, path: string): [RevfsNode, RevfsOperation] {
  const normalized = normalizePath(path);
  const parent = parentPath(normalized);

  const newTree = cloneTree(tree);
  const parentNode = findNode(newTree, parent);
  if (!parentNode || !parentNode.children) {
    throw new Error(`Parent directory not found: ${parent}`);
  }

  const idx = parentNode.children.findIndex(c => c.path === normalized);
  if (idx < 0) {
    throw new Error(`File not found: ${normalized}`);
  }
  if (parentNode.children[idx].type !== 'file') {
    throw new Error(`Not a file: ${normalized}`);
  }

  parentNode.children.splice(idx, 1);
  parentNode.updatedAt = now();

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.RemoveFile,
    path: normalized,
    timestamp: now(),
  };

  return [newTree, op];
}
