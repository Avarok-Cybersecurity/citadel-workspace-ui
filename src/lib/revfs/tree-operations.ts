/**
 * RE-VFS Tree Operations — Barrel Re-export
 *
 * Consumers import from this module to access all tree functions.
 * Implementation is split across:
 *   - tree-queries.ts: lookups, path utilities, storage calculations
 *   - tree-mutations.ts: mkdir, rmdir, placeFile, removeFile
 *   - tree-transforms.ts: rename, move
 *   - tree-copy-merge.ts: copy, merge
 *   - tree-sync.ts: applyRemoteOp for peer synchronization
 */

// Queries & utilities
export {
  peerPairKey,
  serverTreeKey,
  makeOpId,
  now,
  cloneTree,
  normalizePath,
  parentPath,
  baseName,
  getExtension,
  createDefaultTree,
  findNode,
  pathExists,
  calculateStorageUsage,
  collectFiles,
  flipFileState,
  flipNodeStates,
} from './tree-queries';

// Mutations
export {
  mkdir,
  rmdir,
  placeFile,
  removeFile,
} from './tree-mutations';

// Transforms
export {
  renameNode,
  moveNode,
} from './tree-transforms';

// Copy & Merge
export {
  copyNode,
  mergeTrees,
} from './tree-copy-merge';

// Sync
export { applyRemoteOp } from './tree-sync';
