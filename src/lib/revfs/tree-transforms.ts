/**
 * RE-VFS Tree Transforms (Pure Functions)
 *
 * rename and move — structural path transformations on tree nodes.
 * Copy and merge operations are in tree-copy-merge.ts.
 */

import {
  type RevfsNode,
  type RevfsOperation,
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
// Rename Node
// ============================================================================

/**
 * Rename a file or directory.
 * Updates the node's name, path, and all descendant paths.
 */
export function renameNode(
  tree: RevfsNode,
  path: string,
  newName: string,
): [RevfsNode, RevfsOperation] {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    throw new Error('Cannot rename root directory');
  }
  if (PROTECTED_DIRS.has(normalized)) {
    throw new Error(`Cannot rename protected directory: ${normalized}`);
  }
  if (!newName || newName.includes('/')) {
    throw new Error('Invalid name: must be non-empty and cannot contain slashes');
  }

  const parent = parentPath(normalized);
  const newPath = parent === '/' ? `/${newName}` : `${parent}/${newName}`;

  const newTree = cloneTree(tree);
  const parentNode = findNode(newTree, parent);
  if (!parentNode || !parentNode.children) {
    throw new Error(`Parent directory not found: ${parent}`);
  }

  const idx = parentNode.children.findIndex(c => c.path === normalized);
  if (idx < 0) {
    throw new Error(`Node not found: ${normalized}`);
  }

  if (parentNode.children.some(c => c.path === newPath)) {
    throw new Error(`A node with name "${newName}" already exists in this directory`);
  }

  const node = parentNode.children[idx];
  const t = now();

  const updatePaths = (n: RevfsNode, oldBasePath: string, newBasePath: string): void => {
    n.path = n.path.replace(oldBasePath, newBasePath);
    n.updatedAt = t;
    if (n.children) {
      for (const child of n.children) {
        updatePaths(child, oldBasePath, newBasePath);
      }
    }
  };

  node.name = newName;
  updatePaths(node, normalized, newPath);
  parentNode.updatedAt = t;

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.Rename,
    path: normalized,
    newName,
    timestamp: t,
  };

  return [newTree, op];
}

// ============================================================================
// Move Node
// ============================================================================

/**
 * Move a file or directory to a new location.
 * The node keeps its name but gets a new parent.
 */
export function moveNode(
  tree: RevfsNode,
  sourcePath: string,
  destParentPath: string,
): [RevfsNode, RevfsOperation] {
  const normalizedSource = normalizePath(sourcePath);
  const normalizedDest = normalizePath(destParentPath);

  if (normalizedSource === '/') {
    throw new Error('Cannot move root directory');
  }
  if (PROTECTED_DIRS.has(normalizedSource)) {
    throw new Error(`Cannot move protected directory: ${normalizedSource}`);
  }
  if (normalizedDest === normalizedSource || normalizedDest.startsWith(normalizedSource + '/')) {
    throw new Error('Cannot move a directory into itself');
  }

  const newTree = cloneTree(tree);

  const sourceParent = parentPath(normalizedSource);
  const sourceParentNode = findNode(newTree, sourceParent);
  if (!sourceParentNode || !sourceParentNode.children) {
    throw new Error(`Source parent not found: ${sourceParent}`);
  }

  const sourceIdx = sourceParentNode.children.findIndex(c => c.path === normalizedSource);
  if (sourceIdx < 0) {
    throw new Error(`Source not found: ${normalizedSource}`);
  }

  const destParentNode = findNode(newTree, normalizedDest);
  if (!destParentNode || destParentNode.type !== 'directory') {
    throw new Error(`Destination directory not found: ${normalizedDest}`);
  }

  const nodeName = baseName(normalizedSource);
  const newPath = normalizedDest === '/' ? `/${nodeName}` : `${normalizedDest}/${nodeName}`;

  if (!destParentNode.children) destParentNode.children = [];
  if (destParentNode.children.some(c => c.name === nodeName)) {
    throw new Error(`A node with name "${nodeName}" already exists at destination`);
  }

  const t = now();

  const [movedNode] = sourceParentNode.children.splice(sourceIdx, 1);
  sourceParentNode.updatedAt = t;

  const updatePaths = (n: RevfsNode, oldBasePath: string, newBasePath: string): void => {
    n.path = n.path.replace(oldBasePath, newBasePath);
    n.updatedAt = t;
    if (n.children) {
      for (const child of n.children) {
        updatePaths(child, oldBasePath, newBasePath);
      }
    }
  };

  updatePaths(movedNode, normalizedSource, newPath);

  destParentNode.children.push(movedNode);
  destParentNode.updatedAt = t;

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.Move,
    path: normalizedSource,
    destPath: newPath,
    timestamp: t,
  };

  return [newTree, op];
}
