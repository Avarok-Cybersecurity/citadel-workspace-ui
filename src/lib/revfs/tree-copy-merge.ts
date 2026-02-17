/**
 * RE-VFS Tree Copy & Merge (Pure Functions)
 *
 * copyNode and mergeTrees — deep-copy and last-write-wins merge.
 */

import {
  type RevfsNode,
  type RevfsOperation,
  RevfsOpType,
  PROTECTED_DIRS,
} from '@/types/revfs-types';
import {
  normalizePath,
  getExtension,
  cloneTree,
  findNode,
  makeOpId,
  now,
} from './tree-queries';

// ============================================================================
// Copy Node
// ============================================================================

/**
 * Copy a file or directory to a new location.
 * Creates a deep copy with new timestamps and optional name suffix for collisions.
 */
export function copyNode(
  tree: RevfsNode,
  sourcePath: string,
  destParentPath: string,
  newFileIdGenerator?: () => string,
): [RevfsNode, RevfsOperation] {
  const normalizedSource = normalizePath(sourcePath);
  const normalizedDest = normalizePath(destParentPath);

  if (normalizedSource === '/') {
    throw new Error('Cannot copy root directory');
  }
  if (PROTECTED_DIRS.has(normalizedSource)) {
    throw new Error(`Cannot copy protected directory: ${normalizedSource}`);
  }

  const newTree = cloneTree(tree);

  const sourceNode = findNode(newTree, normalizedSource);
  if (!sourceNode) {
    throw new Error(`Source not found: ${normalizedSource}`);
  }

  const destParentNode = findNode(newTree, normalizedDest);
  if (!destParentNode || destParentNode.type !== 'directory') {
    throw new Error(`Destination directory not found: ${normalizedDest}`);
  }

  if (!destParentNode.children) destParentNode.children = [];

  const t = now();
  let finalName = sourceNode.name;

  const existingNames = new Set(destParentNode.children.map(c => c.name));
  if (existingNames.has(finalName)) {
    const ext = sourceNode.type === 'file' ? getExtension(finalName) : '';
    const basePart = ext ? finalName.slice(0, -ext.length - 1) : finalName;

    let suffix = 1;
    do {
      finalName = suffix === 1
        ? (ext ? `${basePart} (copy).${ext}` : `${basePart} (copy)`)
        : (ext ? `${basePart} (copy ${suffix}).${ext}` : `${basePart} (copy ${suffix})`);
      suffix++;
    } while (existingNames.has(finalName) && suffix < 100);
  }

  const newPath = normalizedDest === '/' ? `/${finalName}` : `${normalizedDest}/${finalName}`;

  const copyWithNewPaths = (node: RevfsNode, oldBasePath: string, newBasePath: string): RevfsNode => {
    const copy: RevfsNode = {
      ...node,
      name: node.path === oldBasePath ? finalName : node.name,
      path: node.path.replace(oldBasePath, newBasePath),
      createdAt: t,
      updatedAt: t,
    };

    if (copy.fileMetadata && newFileIdGenerator) {
      copy.fileMetadata = {
        ...copy.fileMetadata,
        fileId: newFileIdGenerator(),
      };
    }

    if (node.children) {
      copy.children = node.children.map(child =>
        copyWithNewPaths(child, oldBasePath, newBasePath)
      );
    }

    return copy;
  };

  const copiedNode = copyWithNewPaths(sourceNode, normalizedSource, newPath);
  destParentNode.children.push(copiedNode);
  destParentNode.updatedAt = t;

  const op: RevfsOperation = {
    op_id: makeOpId(),
    op_type: RevfsOpType.Copy,
    path: normalizedSource,
    destPath: newPath,
    metadata: copiedNode.fileMetadata,
    timestamp: t,
  };

  return [newTree, op];
}

// ============================================================================
// Merge Trees (last-write-wins per path)
// ============================================================================

/**
 * Merge two trees using last-write-wins semantics.
 *
 * Key behaviors:
 * - If both trees have the same path, merge recursively (files use updatedAt)
 * - If remote has a path local doesn't, add it (creation propagates)
 * - If local has a path remote doesn't AND remote.updatedAt > local child's updatedAt,
 *   remove it (deletion propagates)
 */
export function mergeTrees(local: RevfsNode, remote: RevfsNode): RevfsNode {
  if (local.type === 'file' || remote.type === 'file') {
    return local.updatedAt >= remote.updatedAt ? cloneTree(local) : cloneTree(remote);
  }

  const merged = cloneTree(local);
  const remoteChildren = remote.children ?? [];
  const localChildren = merged.children ?? [];

  for (const remoteChild of remoteChildren) {
    const localIdx = localChildren.findIndex(c => c.path === remoteChild.path);
    if (localIdx >= 0) {
      localChildren[localIdx] = mergeTrees(localChildren[localIdx], remoteChild);
    } else {
      localChildren.push(cloneTree(remoteChild));
    }
  }
  // Note: deletions are handled by explicit RemoveFile/RemoveDir operations,
  // not inferred from missing children.

  merged.children = localChildren;
  merged.updatedAt = Math.max(local.updatedAt, remote.updatedAt);
  return merged;
}
