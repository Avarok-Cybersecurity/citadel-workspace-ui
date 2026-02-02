/**
 * RE-VFS Tree Operations (Pure Functions)
 *
 * All tree manipulation is pure — no I/O, no side effects.
 * Each mutation returns a new tree + the RevfsOperation to send to the peer.
 */

import {
  type RevfsNode,
  type RevfsFileMetadata,
  type RevfsOperation,
  type PeerPairKey,
  type ServerTreeKey,
  RevfsFileState,
  RevfsOpType,
  TreeScope,
  PROTECTED_DIRS,
  SENT_FILES_DIR,
  RECEIVED_FILES_DIR,
} from '@/types/revfs-types';

// ============================================================================
// Utility
// ============================================================================

export function peerPairKey(cidA: bigint, cidB: bigint): PeerPairKey {
  const a = cidA < cidB ? cidA : cidB;
  const b = cidA < cidB ? cidB : cidA;
  return `${a}_${b}`;
}

/**
 * Generate a server-scoped tree key for a client's server storage.
 * Format: `server_${cid}`
 */
export function serverTreeKey(cid: bigint): ServerTreeKey {
  return `server_${cid}`;
}

function makeOpId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function cloneTree(node: RevfsNode): RevfsNode {
  return JSON.parse(JSON.stringify(node, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  )) as RevfsNode;
}

/** Normalize path: ensure leading slash, no trailing slash, no double slashes */
export function normalizePath(path: string): string {
  let p = path.replace(/\/+/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

function baseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

// ============================================================================
// Default Tree
// ============================================================================

export function createDefaultTree(): RevfsNode {
  const t = now();
  return {
    name: '/',
    type: 'directory',
    path: '/',
    children: [
      { name: 'Received Files', type: 'directory', path: RECEIVED_FILES_DIR, children: [], createdAt: t, updatedAt: t },
      { name: 'Sent Files', type: 'directory', path: SENT_FILES_DIR, children: [], createdAt: t, updatedAt: t },
    ],
    createdAt: t,
    updatedAt: t,
  };
}

// ============================================================================
// Find
// ============================================================================

export function findNode(tree: RevfsNode, path: string): RevfsNode | null {
  const target = normalizePath(path);
  if (tree.path === target) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, target);
      if (found) return found;
    }
  }
  return null;
}

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

  // Validate
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

  // Check for collision
  if (parentNode.children.some(c => c.path === newPath)) {
    throw new Error(`A node with name "${newName}" already exists in this directory`);
  }

  const node = parentNode.children[idx];
  const t = now();

  // Recursively update paths for this node and all descendants
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

  // Validate
  if (normalizedSource === '/') {
    throw new Error('Cannot move root directory');
  }
  if (PROTECTED_DIRS.has(normalizedSource)) {
    throw new Error(`Cannot move protected directory: ${normalizedSource}`);
  }

  // Can't move into itself or its descendants
  if (normalizedDest === normalizedSource || normalizedDest.startsWith(normalizedSource + '/')) {
    throw new Error('Cannot move a directory into itself');
  }

  const newTree = cloneTree(tree);

  // Find source node
  const sourceParent = parentPath(normalizedSource);
  const sourceParentNode = findNode(newTree, sourceParent);
  if (!sourceParentNode || !sourceParentNode.children) {
    throw new Error(`Source parent not found: ${sourceParent}`);
  }

  const sourceIdx = sourceParentNode.children.findIndex(c => c.path === normalizedSource);
  if (sourceIdx < 0) {
    throw new Error(`Source not found: ${normalizedSource}`);
  }

  // Find destination parent
  const destParentNode = findNode(newTree, normalizedDest);
  if (!destParentNode || destParentNode.type !== 'directory') {
    throw new Error(`Destination directory not found: ${normalizedDest}`);
  }

  const nodeName = baseName(normalizedSource);
  const newPath = normalizedDest === '/' ? `/${nodeName}` : `${normalizedDest}/${nodeName}`;

  // Check for collision at destination
  if (!destParentNode.children) destParentNode.children = [];
  if (destParentNode.children.some(c => c.name === nodeName)) {
    throw new Error(`A node with name "${nodeName}" already exists at destination`);
  }

  const t = now();

  // Remove from source
  const [movedNode] = sourceParentNode.children.splice(sourceIdx, 1);
  sourceParentNode.updatedAt = t;

  // Recursively update paths
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

  // Add to destination
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

// ============================================================================
// Copy Node
// ============================================================================

/**
 * Copy a file or directory to a new location.
 * Creates a deep copy with new timestamps and optional name suffix for collisions.
 *
 * @param tree - The tree to modify
 * @param sourcePath - Path of node to copy
 * @param destParentPath - Parent directory for the copy
 * @param newFileIdGenerator - Optional function to generate new file IDs for copied files
 */
export function copyNode(
  tree: RevfsNode,
  sourcePath: string,
  destParentPath: string,
  newFileIdGenerator?: () => string,
): [RevfsNode, RevfsOperation] {
  const normalizedSource = normalizePath(sourcePath);
  const normalizedDest = normalizePath(destParentPath);

  // Validate
  if (normalizedSource === '/') {
    throw new Error('Cannot copy root directory');
  }
  if (PROTECTED_DIRS.has(normalizedSource)) {
    throw new Error(`Cannot copy protected directory: ${normalizedSource}`);
  }

  const newTree = cloneTree(tree);

  // Find source node
  const sourceNode = findNode(newTree, normalizedSource);
  if (!sourceNode) {
    throw new Error(`Source not found: ${normalizedSource}`);
  }

  // Find destination parent
  const destParentNode = findNode(newTree, normalizedDest);
  if (!destParentNode || destParentNode.type !== 'directory') {
    throw new Error(`Destination directory not found: ${normalizedDest}`);
  }

  if (!destParentNode.children) destParentNode.children = [];

  const t = now();
  let finalName = sourceNode.name;

  // Handle name collision by adding "(copy)" suffix
  const existingNames = new Set(destParentNode.children.map(c => c.name));
  if (existingNames.has(finalName)) {
    // Try "name (copy)", "name (copy 2)", etc.
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

  // Deep copy the node with new paths and timestamps
  const copyWithNewPaths = (node: RevfsNode, oldBasePath: string, newBasePath: string): RevfsNode => {
    const copy: RevfsNode = {
      ...node,
      name: node.path === oldBasePath ? finalName : node.name,
      path: node.path.replace(oldBasePath, newBasePath),
      createdAt: t,
      updatedAt: t,
    };

    // Generate new file ID for copied files
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

/** Get file extension (without dot) */
function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(idx + 1) : '';
}

// ============================================================================
// Flip File States (for incoming remote operations)
// ============================================================================

export function flipFileState(state: RevfsFileState): RevfsFileState {
  switch (state) {
    case RevfsFileState.Hosted: return RevfsFileState.Remote;
    case RevfsFileState.Remote: return RevfsFileState.Hosted;
    default: return state; // Sent/Received stay as-is
  }
}

function flipNodeStates(node: RevfsNode): RevfsNode {
  const flipped: RevfsNode = { ...node };
  if (flipped.fileState) {
    flipped.fileState = flipFileState(flipped.fileState);
  }
  if (flipped.children) {
    flipped.children = flipped.children.map(flipNodeStates);
  }
  return flipped;
}

// ============================================================================
// Apply Remote Operation
// ============================================================================

export function applyRemoteOp(
  tree: RevfsNode,
  op: RevfsOperation,
  _viewerCid: bigint,
): RevfsNode {
  const newTree = cloneTree(tree);

  switch (op.op_type) {
    case RevfsOpType.Mkdir: {
      const parent = parentPath(op.path);
      const name = baseName(op.path);
      const parentNode = findNode(newTree, parent);
      if (!parentNode || parentNode.type !== 'directory') return newTree;
      if (findNode(newTree, op.path)) return newTree; // idempotent
      if (!parentNode.children) parentNode.children = [];
      parentNode.children.push({
        name,
        type: 'directory',
        path: op.path,
        children: [],
        createdAt: op.timestamp,
        updatedAt: op.timestamp,
      });
      parentNode.updatedAt = op.timestamp;
      break;
    }

    case RevfsOpType.Rmdir: {
      if (PROTECTED_DIRS.has(op.path)) return newTree;
      const parent = parentPath(op.path);
      const parentNode = findNode(newTree, parent);
      if (!parentNode?.children) return newTree;
      const idx = parentNode.children.findIndex(c => c.path === op.path);
      if (idx >= 0) {
        parentNode.children.splice(idx, 1);
        parentNode.updatedAt = op.timestamp;
      }
      break;
    }

    case RevfsOpType.PlaceFile: {
      if (!op.metadata) return newTree;
      const parent = parentPath(op.path);
      const name = baseName(op.path);
      const parentNode = findNode(newTree, parent);
      if (!parentNode || parentNode.type !== 'directory') return newTree;
      if (!parentNode.children) parentNode.children = [];

      // For individual ops: viewer determines state directly
      // If I uploaded it → Hosted (I store for them). Otherwise → Remote (they store for me).
      const fileState = op.metadata.uploadedByCid === _viewerCid
        ? RevfsFileState.Hosted
        : RevfsFileState.Remote;

      const fileNode: RevfsNode = {
        name,
        type: 'file',
        path: op.path,
        fileState,
        fileMetadata: op.metadata,
        createdAt: op.timestamp,
        updatedAt: op.timestamp,
      };

      const existingIdx = parentNode.children.findIndex(c => c.path === op.path);
      if (existingIdx >= 0) {
        parentNode.children[existingIdx] = fileNode;
      } else {
        parentNode.children.push(fileNode);
      }
      parentNode.updatedAt = op.timestamp;
      break;
    }

    case RevfsOpType.RemoveFile: {
      const parent = parentPath(op.path);
      const parentNode = findNode(newTree, parent);
      if (!parentNode?.children) return newTree;
      const idx = parentNode.children.findIndex(c => c.path === op.path);
      if (idx >= 0) {
        parentNode.children.splice(idx, 1);
        parentNode.updatedAt = op.timestamp;
      }
      break;
    }

    case RevfsOpType.SyncResponse: {
      if (op.tree) {
        return flipNodeStates(cloneTree(op.tree));
      }
      break;
    }

    case RevfsOpType.Rename: {
      if (!op.newName) return newTree;
      if (PROTECTED_DIRS.has(op.path)) return newTree;

      const parent = parentPath(op.path);
      const parentNode = findNode(newTree, parent);
      if (!parentNode?.children) return newTree;

      const idx = parentNode.children.findIndex(c => c.path === op.path);
      if (idx < 0) return newTree;

      const node = parentNode.children[idx];
      const newPath = parent === '/' ? `/${op.newName}` : `${parent}/${op.newName}`;

      // Check collision
      if (parentNode.children.some(c => c.path === newPath)) return newTree;

      // Update paths recursively
      const updatePaths = (n: RevfsNode, oldBasePath: string, newBasePath: string): void => {
        n.path = n.path.replace(oldBasePath, newBasePath);
        n.updatedAt = op.timestamp;
        if (n.children) {
          for (const child of n.children) {
            updatePaths(child, oldBasePath, newBasePath);
          }
        }
      };

      node.name = op.newName;
      updatePaths(node, op.path, newPath);
      parentNode.updatedAt = op.timestamp;
      break;
    }

    case RevfsOpType.Move: {
      if (!op.destPath) return newTree;
      if (PROTECTED_DIRS.has(op.path)) return newTree;

      const sourceParent = parentPath(op.path);
      const sourceParentNode = findNode(newTree, sourceParent);
      if (!sourceParentNode?.children) return newTree;

      const sourceIdx = sourceParentNode.children.findIndex(c => c.path === op.path);
      if (sourceIdx < 0) return newTree;

      const destParentPath = parentPath(op.destPath);
      const destParentNode = findNode(newTree, destParentPath);
      if (!destParentNode || destParentNode.type !== 'directory') return newTree;

      if (!destParentNode.children) destParentNode.children = [];

      // Check collision at destination
      const destName = baseName(op.destPath);
      if (destParentNode.children.some(c => c.name === destName)) return newTree;

      // Remove from source
      const [movedNode] = sourceParentNode.children.splice(sourceIdx, 1);
      sourceParentNode.updatedAt = op.timestamp;

      // Update paths
      const updatePaths = (n: RevfsNode, oldBasePath: string, newBasePath: string): void => {
        n.path = n.path.replace(oldBasePath, newBasePath);
        n.updatedAt = op.timestamp;
        if (n.children) {
          for (const child of n.children) {
            updatePaths(child, oldBasePath, newBasePath);
          }
        }
      };

      updatePaths(movedNode, op.path, op.destPath);

      // Add to destination
      destParentNode.children.push(movedNode);
      destParentNode.updatedAt = op.timestamp;
      break;
    }

    case RevfsOpType.Copy: {
      if (!op.destPath) return newTree;
      if (PROTECTED_DIRS.has(op.path)) return newTree;

      const sourceNode = findNode(newTree, op.path);
      if (!sourceNode) return newTree;

      const destParentPath = parentPath(op.destPath);
      const destParentNode = findNode(newTree, destParentPath);
      if (!destParentNode || destParentNode.type !== 'directory') return newTree;

      if (!destParentNode.children) destParentNode.children = [];

      const destName = baseName(op.destPath);
      // Check collision
      if (destParentNode.children.some(c => c.name === destName)) return newTree;

      // Deep copy with new paths
      const copyWithNewPaths = (node: RevfsNode, oldBasePath: string, newBasePath: string): RevfsNode => {
        const copy: RevfsNode = {
          ...node,
          name: node.path === oldBasePath ? destName : node.name,
          path: node.path.replace(oldBasePath, newBasePath),
          createdAt: op.timestamp,
          updatedAt: op.timestamp,
        };

        // Use provided metadata if available (contains new fileId)
        if (node.path === oldBasePath && op.metadata) {
          copy.fileMetadata = op.metadata;
        }

        if (node.children) {
          copy.children = node.children.map(child =>
            copyWithNewPaths(child, oldBasePath, newBasePath)
          );
        }

        return copy;
      };

      const copiedNode = copyWithNewPaths(sourceNode, op.path, op.destPath);
      destParentNode.children.push(copiedNode);
      destParentNode.updatedAt = op.timestamp;
      break;
    }

    default:
      break;
  }

  return newTree;
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
  // Use whichever has the later updatedAt as the base for conflicts
  if (local.type === 'file' || remote.type === 'file') {
    return local.updatedAt >= remote.updatedAt ? cloneTree(local) : cloneTree(remote);
  }

  const merged = cloneTree(local);
  const remoteChildren = remote.children ?? [];
  const localChildren = merged.children ?? [];
  const remoteChildPaths = new Set(remoteChildren.map(c => c.path));

  // Handle children that exist in remote
  for (const remoteChild of remoteChildren) {
    const localIdx = localChildren.findIndex(c => c.path === remoteChild.path);
    if (localIdx >= 0) {
      // Both have this path — merge recursively
      localChildren[localIdx] = mergeTrees(localChildren[localIdx], remoteChild);
    } else {
      // Remote has a path local doesn't — add it
      localChildren.push(cloneTree(remoteChild));
    }
  }

  // Handle deletions: remove local children that don't exist in remote
  // if the remote tree was updated more recently than the local child
  // (indicating the child was deleted remotely)
  for (let i = localChildren.length - 1; i >= 0; i--) {
    const localChild = localChildren[i];
    if (!remoteChildPaths.has(localChild.path)) {
      // Local has this child but remote doesn't
      // If remote's updatedAt is newer than the local child's updatedAt,
      // the child was deleted remotely
      if (remote.updatedAt > localChild.updatedAt) {
        localChildren.splice(i, 1);
      }
    }
  }

  merged.children = localChildren;
  merged.updatedAt = Math.max(local.updatedAt, remote.updatedAt);
  return merged;
}

// ============================================================================
// Storage Usage Calculation
// ============================================================================

/**
 * Calculate total storage used by summing file sizes in tree.
 *
 * For P2P mode (TreeScope.Peer):
 *   - Counts files with state Hosted (files I'm storing for my peer)
 *
 * For Server mode (TreeScope.Server):
 *   - Counts files with state ServerStored (files on the server)
 *
 * @param tree - The RE-VFS tree to calculate storage for
 * @param scope - TreeScope.Peer or TreeScope.Server
 * @returns Total bytes used
 */
export function calculateStorageUsage(tree: RevfsNode, scope: TreeScope): number {
  let total = 0;

  const traverse = (node: RevfsNode): void => {
    if (node.type === 'file' && node.fileMetadata) {
      // Count files based on storage scope
      if (scope === TreeScope.Server && node.fileState === RevfsFileState.ServerStored) {
        total += node.fileMetadata.fileSize;
      } else if (scope === TreeScope.Peer && node.fileState === RevfsFileState.Hosted) {
        total += node.fileMetadata.fileSize;
      }
    }
    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };

  traverse(tree);
  return total;
}

/**
 * Check if a path exists in the tree.
 * Useful for validating path bar input.
 */
export function pathExists(tree: RevfsNode, path: string): boolean {
  return findNode(tree, normalizePath(path)) !== null;
}
