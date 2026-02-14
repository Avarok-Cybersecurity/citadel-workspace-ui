/**
 * RE-VFS Tree Sync (Pure Functions)
 *
 * Applies remote operations to local trees — used for peer synchronization.
 */

import {
  type RevfsNode,
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
  flipNodeStates,
} from './tree-queries';

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

      if (parentNode.children.some(c => c.path === newPath)) return newTree;

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

      const destParentPathVal = parentPath(op.destPath);
      const destParentNode = findNode(newTree, destParentPathVal);
      if (!destParentNode || destParentNode.type !== 'directory') return newTree;

      if (!destParentNode.children) destParentNode.children = [];

      const destName = baseName(op.destPath);
      if (destParentNode.children.some(c => c.name === destName)) return newTree;

      const [movedNode] = sourceParentNode.children.splice(sourceIdx, 1);
      sourceParentNode.updatedAt = op.timestamp;

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

      destParentNode.children.push(movedNode);
      destParentNode.updatedAt = op.timestamp;
      break;
    }

    case RevfsOpType.Copy: {
      if (!op.destPath) return newTree;
      if (PROTECTED_DIRS.has(op.path)) return newTree;

      const sourceNode = findNode(newTree, op.path);
      if (!sourceNode) return newTree;

      const destParentPathVal = parentPath(op.destPath);
      const destParentNode = findNode(newTree, destParentPathVal);
      if (!destParentNode || destParentNode.type !== 'directory') return newTree;

      if (!destParentNode.children) destParentNode.children = [];

      const destName = baseName(op.destPath);
      if (destParentNode.children.some(c => c.name === destName)) return newTree;

      const copyWithNewPaths = (node: RevfsNode, oldBasePath: string, newBasePath: string): RevfsNode => {
        const copy: RevfsNode = {
          ...node,
          name: node.path === oldBasePath ? destName : node.name,
          path: node.path.replace(oldBasePath, newBasePath),
          createdAt: op.timestamp,
          updatedAt: op.timestamp,
        };

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
