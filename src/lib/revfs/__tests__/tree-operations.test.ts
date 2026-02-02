import { describe, it, expect } from 'vitest';
import {
  peerPairKey,
  createDefaultTree,
  findNode,
  mkdir,
  rmdir,
  placeFile,
  removeFile,
  renameNode,
  moveNode,
  copyNode,
  applyRemoteOp,
  flipFileState,
  mergeTrees,
  normalizePath,
} from '../tree-operations';
import {
  RevfsFileState,
  RevfsOpType,
  SENT_FILES_DIR,
  RECEIVED_FILES_DIR,
} from '@/types/revfs-types';
import type { RevfsFileMetadata, RevfsNode } from '@/types/revfs-types';

const CID_A = 100n;
const CID_B = 200n;

function makeMeta(overrides?: Partial<RevfsFileMetadata>): RevfsFileMetadata {
  return {
    fileId: 'file-1',
    fileName: 'test.pdf',
    fileSize: 1024,
    fileType: 'application/pdf',
    virtualDirectory: '/vfs/test',
    uploadedByCid: CID_A,
    ...overrides,
  };
}

// ============================================================================
// peerPairKey
// ============================================================================

describe('peerPairKey', () => {
  it('produces canonical key regardless of order', () => {
    expect(peerPairKey(CID_A, CID_B)).toBe(peerPairKey(CID_B, CID_A));
  });

  it('puts smaller CID first', () => {
    expect(peerPairKey(CID_A, CID_B)).toBe('100_200');
  });
});

// ============================================================================
// normalizePath
// ============================================================================

describe('normalizePath', () => {
  it('adds leading slash', () => {
    expect(normalizePath('foo')).toBe('/foo');
  });
  it('removes trailing slash', () => {
    expect(normalizePath('/foo/')).toBe('/foo');
  });
  it('collapses double slashes', () => {
    expect(normalizePath('//foo//bar//')).toBe('/foo/bar');
  });
  it('root stays as /', () => {
    expect(normalizePath('/')).toBe('/');
  });
});

// ============================================================================
// createDefaultTree
// ============================================================================

describe('createDefaultTree', () => {
  it('has root with two protected folders', () => {
    const tree = createDefaultTree();
    expect(tree.path).toBe('/');
    expect(tree.children).toHaveLength(2);
    const paths = tree.children!.map(c => c.path);
    expect(paths).toContain(RECEIVED_FILES_DIR);
    expect(paths).toContain(SENT_FILES_DIR);
  });
});

// ============================================================================
// findNode
// ============================================================================

describe('findNode', () => {
  it('finds root', () => {
    const tree = createDefaultTree();
    expect(findNode(tree, '/')).toBe(tree);
  });

  it('finds child by path', () => {
    const tree = createDefaultTree();
    const node = findNode(tree, SENT_FILES_DIR);
    expect(node).not.toBeNull();
    expect(node!.name).toBe('Sent Files');
  });

  it('returns null for missing path', () => {
    const tree = createDefaultTree();
    expect(findNode(tree, '/nonexistent')).toBeNull();
  });
});

// ============================================================================
// mkdir
// ============================================================================

describe('mkdir', () => {
  it('creates a directory under root', () => {
    const tree = createDefaultTree();
    const [newTree, op] = mkdir(tree, '/shared');
    expect(findNode(newTree, '/shared')).not.toBeNull();
    expect(op.op_type).toBe(RevfsOpType.Mkdir);
    expect(op.path).toBe('/shared');
  });

  it('creates nested directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/reports');
    expect(findNode(tree, '/docs/reports')).not.toBeNull();
  });

  it('throws if parent missing', () => {
    const tree = createDefaultTree();
    expect(() => mkdir(tree, '/a/b')).toThrow('Parent directory not found');
  });

  it('throws if already exists', () => {
    const tree = createDefaultTree();
    const [newTree] = mkdir(tree, '/test');
    expect(() => mkdir(newTree, '/test')).toThrow('already exists');
  });

  it('does not mutate original tree', () => {
    const tree = createDefaultTree();
    const childCount = tree.children!.length;
    mkdir(tree, '/new');
    expect(tree.children!.length).toBe(childCount);
  });
});

// ============================================================================
// rmdir
// ============================================================================

describe('rmdir', () => {
  it('removes a directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/tmp');
    expect(findNode(tree, '/tmp')).not.toBeNull();
    const [newTree, op] = rmdir(tree, '/tmp');
    expect(findNode(newTree, '/tmp')).toBeNull();
    expect(op.op_type).toBe(RevfsOpType.Rmdir);
  });

  it('throws on protected directory', () => {
    const tree = createDefaultTree();
    expect(() => rmdir(tree, SENT_FILES_DIR)).toThrow('protected');
    expect(() => rmdir(tree, RECEIVED_FILES_DIR)).toThrow('protected');
  });

  it('throws on root', () => {
    const tree = createDefaultTree();
    expect(() => rmdir(tree, '/')).toThrow('root');
  });

  it('throws if not found', () => {
    const tree = createDefaultTree();
    expect(() => rmdir(tree, '/nonexistent')).toThrow('not found');
  });

  it('throws on file path', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/test.pdf', meta, CID_A);
    expect(() => rmdir(tree, '/docs/test.pdf')).toThrow('Not a directory');
  });
});

// ============================================================================
// placeFile
// ============================================================================

describe('placeFile', () => {
  it('places file with Hosted state when viewer uploaded', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta({ uploadedByCid: CID_A });
    const [newTree, op] = placeFile(tree, '/docs/test.pdf', meta, CID_A);
    const file = findNode(newTree, '/docs/test.pdf');
    expect(file).not.toBeNull();
    expect(file!.fileState).toBe(RevfsFileState.Hosted);
    expect(op.op_type).toBe(RevfsOpType.PlaceFile);
  });

  it('places file with Remote state when peer uploaded', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta({ uploadedByCid: CID_A });
    const [newTree] = placeFile(tree, '/docs/test.pdf', meta, CID_B);
    const file = findNode(newTree, '/docs/test.pdf');
    expect(file!.fileState).toBe(RevfsFileState.Remote);
  });

  it('throws on missing parent', () => {
    const tree = createDefaultTree();
    expect(() => placeFile(tree, '/nope/test.pdf', makeMeta(), CID_A)).toThrow('Parent directory not found');
  });

  it('replaces existing file at same path', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta1 = makeMeta({ fileId: 'v1', uploadedByCid: CID_A });
    [tree] = placeFile(tree, '/docs/test.pdf', meta1, CID_A);
    const meta2 = makeMeta({ fileId: 'v2', uploadedByCid: CID_A });
    [tree] = placeFile(tree, '/docs/test.pdf', meta2, CID_A);
    const file = findNode(tree, '/docs/test.pdf');
    expect(file!.fileMetadata!.fileId).toBe('v2');
    // Should still be only one child file
    const docs = findNode(tree, '/docs');
    expect(docs!.children!.filter(c => c.type === 'file')).toHaveLength(1);
  });
});

// ============================================================================
// removeFile
// ============================================================================

describe('removeFile', () => {
  it('removes a file', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/test.pdf', meta, CID_A);
    const [newTree, op] = removeFile(tree, '/docs/test.pdf');
    expect(findNode(newTree, '/docs/test.pdf')).toBeNull();
    expect(op.op_type).toBe(RevfsOpType.RemoveFile);
  });

  it('throws if file not found', () => {
    const tree = createDefaultTree();
    expect(() => removeFile(tree, '/nope.txt')).toThrow('not found');
  });

  it('throws on directory path', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    expect(() => removeFile(tree, '/docs')).toThrow('Not a file');
  });
});

// ============================================================================
// flipFileState
// ============================================================================

describe('flipFileState', () => {
  it('flips Hosted to Remote', () => {
    expect(flipFileState(RevfsFileState.Hosted)).toBe(RevfsFileState.Remote);
  });
  it('flips Remote to Hosted', () => {
    expect(flipFileState(RevfsFileState.Remote)).toBe(RevfsFileState.Hosted);
  });
  it('leaves Sent unchanged', () => {
    expect(flipFileState(RevfsFileState.Sent)).toBe(RevfsFileState.Sent);
  });
  it('leaves Received unchanged', () => {
    expect(flipFileState(RevfsFileState.Received)).toBe(RevfsFileState.Received);
  });
});

// ============================================================================
// applyRemoteOp
// ============================================================================

describe('applyRemoteOp', () => {
  it('applies remote mkdir idempotently', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.Mkdir, path: '/shared', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/shared')).not.toBeNull();
    // Applying again should not throw
    const result2 = applyRemoteOp(result, op, CID_B);
    expect(findNode(result2, '/shared')).not.toBeNull();
  });

  it('applies remote rmdir', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/tmp');
    const op = { op_id: '1', op_type: RevfsOpType.Rmdir, path: '/tmp', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/tmp')).toBeNull();
  });

  it('does not remove protected dirs via remote op', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.Rmdir, path: SENT_FILES_DIR, timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, SENT_FILES_DIR)).not.toBeNull();
  });

  it('applies remote placeFile with flipped state', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta({ uploadedByCid: CID_A });
    const op = {
      op_id: '1',
      op_type: RevfsOpType.PlaceFile,
      path: '/docs/file.pdf',
      metadata: meta,
      timestamp: Date.now(),
    };
    // CID_B is the viewer receiving CID_A's upload
    const result = applyRemoteOp(tree, op, CID_B);
    const file = findNode(result, '/docs/file.pdf');
    expect(file).not.toBeNull();
    // CID_A uploaded → CID_B (viewer) is NOT the uploader → Remote
    expect(file!.fileState).toBe(RevfsFileState.Remote);
  });

  it('applies remote RemoveFile', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/test.pdf', meta, CID_A);
    const op = { op_id: '1', op_type: RevfsOpType.RemoveFile, path: '/docs/test.pdf', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/docs/test.pdf')).toBeNull();
  });

  it('returns tree unchanged for RemoveFile on missing file', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.RemoveFile, path: '/nope.txt', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(result.children).toHaveLength(2);
  });

  it('applies SyncResponse with flipped file states', () => {
    let remoteTree = createDefaultTree();
    [remoteTree] = mkdir(remoteTree, '/docs');
    const meta = makeMeta({ uploadedByCid: CID_A });
    [remoteTree] = placeFile(remoteTree, '/docs/test.pdf', meta, CID_A);
    // Remote tree has file as Hosted (CID_A uploaded, CID_A is viewer)
    expect(findNode(remoteTree, '/docs/test.pdf')!.fileState).toBe(RevfsFileState.Hosted);

    const op = {
      op_id: '1',
      op_type: RevfsOpType.SyncResponse,
      path: '/',
      tree: remoteTree,
      timestamp: Date.now(),
    };
    const result = applyRemoteOp(createDefaultTree(), op, CID_B);
    // After flipNodeStates, Hosted→Remote
    const file = findNode(result, '/docs/test.pdf');
    expect(file).not.toBeNull();
    expect(file!.fileState).toBe(RevfsFileState.Remote);
  });

  it('returns tree unchanged for SyncResponse with null tree', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.SyncResponse, path: '/', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(result.children).toHaveLength(2);
  });

  it('returns tree unchanged for PlaceFile without metadata', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const op = { op_id: '1', op_type: RevfsOpType.PlaceFile, path: '/docs/f.txt', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/docs/f.txt')).toBeNull();
  });

  it('replaces existing file via remote PlaceFile', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta1 = makeMeta({ fileId: 'v1', uploadedByCid: CID_A });
    const op1 = { op_id: '1', op_type: RevfsOpType.PlaceFile, path: '/docs/f.pdf', metadata: meta1, timestamp: Date.now() };
    tree = applyRemoteOp(tree, op1, CID_B);
    const meta2 = makeMeta({ fileId: 'v2', uploadedByCid: CID_A });
    const op2 = { op_id: '2', op_type: RevfsOpType.PlaceFile, path: '/docs/f.pdf', metadata: meta2, timestamp: Date.now() };
    tree = applyRemoteOp(tree, op2, CID_B);
    const file = findNode(tree, '/docs/f.pdf');
    expect(file!.fileMetadata!.fileId).toBe('v2');
    expect(findNode(tree, '/docs')!.children!.filter(c => c.type === 'file')).toHaveLength(1);
  });

  it('returns tree unchanged for Rmdir on non-existent path', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.Rmdir, path: '/nope', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(result.children).toHaveLength(2);
  });

  it('returns tree unchanged for Mkdir with missing parent', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.Mkdir, path: '/a/b', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/a/b')).toBeNull();
  });

  it('SyncResponse flips nested states recursively (Sent/Received unchanged)', () => {
    let remoteTree = createDefaultTree();
    [remoteTree] = mkdir(remoteTree, '/mix');
    // Manually create nodes with different states
    const mixNode = findNode(remoteTree, '/mix')!;
    mixNode.children = [
      { name: 'hosted.txt', type: 'file', path: '/mix/hosted.txt', fileState: RevfsFileState.Hosted, createdAt: 1, updatedAt: 1 },
      { name: 'remote.txt', type: 'file', path: '/mix/remote.txt', fileState: RevfsFileState.Remote, createdAt: 1, updatedAt: 1 },
      { name: 'sent.txt', type: 'file', path: '/mix/sent.txt', fileState: RevfsFileState.Sent, createdAt: 1, updatedAt: 1 },
      { name: 'recv.txt', type: 'file', path: '/mix/recv.txt', fileState: RevfsFileState.Received, createdAt: 1, updatedAt: 1 },
    ];

    const op = { op_id: '1', op_type: RevfsOpType.SyncResponse, path: '/', tree: remoteTree, timestamp: Date.now() };
    const result = applyRemoteOp(createDefaultTree(), op, CID_B);
    expect(findNode(result, '/mix/hosted.txt')!.fileState).toBe(RevfsFileState.Remote);
    expect(findNode(result, '/mix/remote.txt')!.fileState).toBe(RevfsFileState.Hosted);
    expect(findNode(result, '/mix/sent.txt')!.fileState).toBe(RevfsFileState.Sent);
    expect(findNode(result, '/mix/recv.txt')!.fileState).toBe(RevfsFileState.Received);
  });
});

// ============================================================================
// mergeTrees
// ============================================================================

describe('mergeTrees', () => {
  it('merges disjoint directories', () => {
    let local = createDefaultTree();
    [local] = mkdir(local, '/local-only');

    let remote = createDefaultTree();
    [remote] = mkdir(remote, '/remote-only');

    const merged = mergeTrees(local, remote);
    expect(findNode(merged, '/local-only')).not.toBeNull();
    expect(findNode(merged, '/remote-only')).not.toBeNull();
  });

  it('keeps later-updated node on conflict', () => {
    const base = createDefaultTree();
    const local = { ...base, updatedAt: 1000 };
    const remote = { ...base, updatedAt: 2000 };
    const merged = mergeTrees(local, remote);
    expect(merged.updatedAt).toBe(2000);
  });

  it('file-vs-file conflict uses later updatedAt', () => {
    const localFile: RevfsNode = { name: 'f.txt', type: 'file', path: '/f.txt', createdAt: 1, updatedAt: 100, fileMetadata: makeMeta({ fileId: 'local' }) };
    const remoteFile: RevfsNode = { name: 'f.txt', type: 'file', path: '/f.txt', createdAt: 1, updatedAt: 200, fileMetadata: makeMeta({ fileId: 'remote' }) };
    const merged = mergeTrees(localFile, remoteFile);
    expect(merged.fileMetadata!.fileId).toBe('remote');
  });

  it('merges nested directories recursively', () => {
    let local = createDefaultTree();
    [local] = mkdir(local, '/shared');
    [local] = mkdir(local, '/shared/a');

    let remote = createDefaultTree();
    [remote] = mkdir(remote, '/shared');
    [remote] = mkdir(remote, '/shared/b');

    const merged = mergeTrees(local, remote);
    expect(findNode(merged, '/shared/a')).not.toBeNull();
    expect(findNode(merged, '/shared/b')).not.toBeNull();
  });

  it('adds remote-only nested children', () => {
    const local = createDefaultTree();
    let remote = createDefaultTree();
    [remote] = mkdir(remote, '/newdir');
    [remote] = mkdir(remote, '/newdir/sub');

    const merged = mergeTrees(local, remote);
    expect(findNode(merged, '/newdir')).not.toBeNull();
    expect(findNode(merged, '/newdir/sub')).not.toBeNull();
  });
});

// ============================================================================
// Deep Nested Tree Stress Tests
// ============================================================================

describe('deep nested tree stress tests', () => {
  const MAX_DEPTH = 50;
  const FILES_PER_LEVEL = 3;

  /**
   * Builds a path string for a given depth level.
   * E.g., depth 3 => '/level-0/level-1/level-2'
   */
  function buildPathAtDepth(depth: number): string {
    if (depth === 0) return '/';
    const segments = Array.from({ length: depth }, (_, i) => `level-${i}`);
    return '/' + segments.join('/');
  }

  /**
   * Creates a deeply nested tree structure with files at each level.
   * Returns the tree and metadata about what was created.
   */
  function createDeepTree(depth: number, filesPerLevel: number): {
    tree: RevfsNode;
    allDirPaths: string[];
    allFilePaths: string[];
    totalDirs: number;
    totalFiles: number;
  } {
    let tree = createDefaultTree();
    const allDirPaths: string[] = [];
    const allFilePaths: string[] = [];

    // Create nested directories
    for (let d = 1; d <= depth; d++) {
      const parentPath = buildPathAtDepth(d - 1);
      const dirName = `level-${d - 1}`;
      const dirPath = parentPath === '/' ? `/${dirName}` : `${parentPath}/${dirName}`;
      [tree] = mkdir(tree, dirPath);
      allDirPaths.push(dirPath);

      // Add files at this level
      for (let f = 0; f < filesPerLevel; f++) {
        const fileName = `file-${d}-${f}.dat`;
        const filePath = `${dirPath}/${fileName}`;
        const meta = makeMeta({
          fileId: `file-${d}-${f}`,
          fileName,
          fileSize: (d * 1000) + (f * 100),
          uploadedByCid: f % 2 === 0 ? CID_A : CID_B,
        });
        [tree] = placeFile(tree, filePath, meta, CID_A);
        allFilePaths.push(filePath);
      }
    }

    return {
      tree,
      allDirPaths,
      allFilePaths,
      totalDirs: depth,
      totalFiles: depth * filesPerLevel,
    };
  }

  /**
   * Recursively counts all nodes in the tree.
   */
  function countNodes(node: RevfsNode): { dirs: number; files: number } {
    let dirs = node.type === 'directory' ? 1 : 0;
    let files = node.type === 'file' ? 1 : 0;
    for (const child of node.children ?? []) {
      const childCounts = countNodes(child);
      dirs += childCounts.dirs;
      files += childCounts.files;
    }
    return { dirs, files };
  }

  /**
   * Recursively calculates max depth of tree.
   */
  function calculateMaxDepth(node: RevfsNode, currentDepth = 0): number {
    if (!node.children || node.children.length === 0) {
      return currentDepth;
    }
    return Math.max(...node.children.map(c => calculateMaxDepth(c, currentDepth + 1)));
  }

  it('creates deeply nested tree with files at each level (50 levels)', () => {
    const { tree, allDirPaths, allFilePaths, totalDirs, totalFiles } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);

    // Verify structure counts
    expect(allDirPaths).toHaveLength(totalDirs);
    expect(allFilePaths).toHaveLength(totalFiles);

    // Verify all directories are findable
    for (const dirPath of allDirPaths) {
      const node = findNode(tree, dirPath);
      expect(node).not.toBeNull();
      expect(node!.type).toBe('directory');
    }

    // Verify all files are findable
    for (const filePath of allFilePaths) {
      const node = findNode(tree, filePath);
      expect(node).not.toBeNull();
      expect(node!.type).toBe('file');
      expect(node!.fileMetadata).toBeDefined();
    }
  });

  it('finds deepest node efficiently', () => {
    const { tree, allDirPaths } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const deepestPath = allDirPaths[allDirPaths.length - 1];

    // Should find the deepest directory
    const deepNode = findNode(tree, deepestPath);
    expect(deepNode).not.toBeNull();
    expect(deepNode!.name).toBe(`level-${MAX_DEPTH - 1}`);

    // Find a file in the deepest directory
    const deepFilePath = `${deepestPath}/file-${MAX_DEPTH}-0.dat`;
    const deepFile = findNode(tree, deepFilePath);
    expect(deepFile).not.toBeNull();
    expect(deepFile!.type).toBe('file');
  });

  it('verifies tree depth calculation', () => {
    const { tree } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const maxDepth = calculateMaxDepth(tree);
    // +1 for files being one level deeper than their parent dir
    expect(maxDepth).toBe(MAX_DEPTH + 1);
  });

  it('counts all nodes correctly in deep tree', () => {
    const { tree, totalDirs, totalFiles } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const counts = countNodes(tree);
    // +3 for root + 2 protected folders (Sent Files, Received Files)
    expect(counts.dirs).toBe(totalDirs + 3);
    expect(counts.files).toBe(totalFiles);
  });

  it('removes file from deepest level', () => {
    const { tree, allFilePaths } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const deepFilePath = allFilePaths[allFilePaths.length - 1];

    expect(findNode(tree, deepFilePath)).not.toBeNull();
    const [newTree] = removeFile(tree, deepFilePath);
    expect(findNode(newTree, deepFilePath)).toBeNull();
  });

  it('removes directory at mid-level (cascades children removal)', () => {
    const { tree } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const midLevelPath = buildPathAtDepth(Math.floor(MAX_DEPTH / 2) + 1)
      .split('/')
      .slice(0, Math.floor(MAX_DEPTH / 2) + 1)
      .join('/') || '/level-0';

    // Build the actual mid-level path
    const segments = [];
    for (let i = 0; i < Math.floor(MAX_DEPTH / 2); i++) {
      segments.push(`level-${i}`);
    }
    const actualMidPath = '/' + segments.join('/');

    expect(findNode(tree, actualMidPath)).not.toBeNull();
    const [newTree] = rmdir(tree, actualMidPath);
    expect(findNode(newTree, actualMidPath)).toBeNull();
  });

  it('adds new directory at deepest level', () => {
    const { tree, allDirPaths } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const deepestPath = allDirPaths[allDirPaths.length - 1];
    const newSubDir = `${deepestPath}/even-deeper`;

    const [newTree] = mkdir(tree, newSubDir);
    const node = findNode(newTree, newSubDir);
    expect(node).not.toBeNull();
    expect(node!.type).toBe('directory');
  });

  it('adds file to deepest level', () => {
    const { tree, allDirPaths } = createDeepTree(MAX_DEPTH, FILES_PER_LEVEL);
    const deepestPath = allDirPaths[allDirPaths.length - 1];
    const newFilePath = `${deepestPath}/extra-file.txt`;

    const meta = makeMeta({ fileId: 'extra', fileName: 'extra-file.txt' });
    const [newTree] = placeFile(tree, newFilePath, meta, CID_A);
    const node = findNode(newTree, newFilePath);
    expect(node).not.toBeNull();
    expect(node!.type).toBe('file');
  });

  it('merges two deep trees with different structures', () => {
    // Create two trees with different branches at mid-level
    let localTree = createDefaultTree();
    let remoteTree = createDefaultTree();

    // Build common path up to level 10
    for (let d = 0; d < 10; d++) {
      const segments = Array.from({ length: d + 1 }, (_, i) => `level-${i}`);
      const path = '/' + segments.join('/');
      [localTree] = mkdir(localTree, path);
      [remoteTree] = mkdir(remoteTree, path);
    }

    // Local gets branch-a, remote gets branch-b
    [localTree] = mkdir(localTree, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-a');
    [remoteTree] = mkdir(remoteTree, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-b');

    // Add files to each branch
    const metaA = makeMeta({ fileId: 'local-file', fileName: 'local.txt' });
    const metaB = makeMeta({ fileId: 'remote-file', fileName: 'remote.txt' });
    [localTree] = placeFile(localTree, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-a/local.txt', metaA, CID_A);
    [remoteTree] = placeFile(remoteTree, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-b/remote.txt', metaB, CID_A);

    const merged = mergeTrees(localTree, remoteTree);

    // Both branches should exist
    expect(findNode(merged, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-a')).not.toBeNull();
    expect(findNode(merged, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-b')).not.toBeNull();
    expect(findNode(merged, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-a/local.txt')).not.toBeNull();
    expect(findNode(merged, '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/branch-b/remote.txt')).not.toBeNull();
  });

  it('applies remote operations to deep tree', () => {
    const { tree } = createDeepTree(20, 2);
    const deepPath = '/level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9';

    // Remote mkdir at deep level
    const mkdirOp = { op_id: '1', op_type: RevfsOpType.Mkdir, path: `${deepPath}/remote-dir`, timestamp: Date.now() };
    let result = applyRemoteOp(tree, mkdirOp, CID_B);
    expect(findNode(result, `${deepPath}/remote-dir`)).not.toBeNull();

    // Remote placeFile - CID_A uploads, CID_B receives → file state is Remote for CID_B
    const meta = makeMeta({ fileId: 'remote-deep', fileName: 'remote.dat', uploadedByCid: CID_A });
    const placeOp = { op_id: '2', op_type: RevfsOpType.PlaceFile, path: `${deepPath}/remote-dir/remote.dat`, metadata: meta, timestamp: Date.now() };
    result = applyRemoteOp(result, placeOp, CID_B);
    const file = findNode(result, `${deepPath}/remote-dir/remote.dat`);
    expect(file).not.toBeNull();
    // CID_A uploaded → CID_B (viewer) is NOT the uploader → Remote
    expect(file!.fileState).toBe(RevfsFileState.Remote);

    // Remote removeFile
    const removeOp = { op_id: '3', op_type: RevfsOpType.RemoveFile, path: `${deepPath}/remote-dir/remote.dat`, timestamp: Date.now() };
    result = applyRemoteOp(result, removeOp, CID_B);
    expect(findNode(result, `${deepPath}/remote-dir/remote.dat`)).toBeNull();
  });

  it('handles SyncResponse with deeply nested tree', () => {
    // Create a deep tree as if it came from remote peer
    const { tree: remoteTree } = createDeepTree(15, 2);

    // Apply as SyncResponse
    const op = {
      op_id: '1',
      op_type: RevfsOpType.SyncResponse,
      path: '/',
      tree: remoteTree,
      timestamp: Date.now(),
    };
    const result = applyRemoteOp(createDefaultTree(), op, CID_B);

    // Verify structure was received
    expect(findNode(result, '/level-0')).not.toBeNull();
    expect(findNode(result, '/level-0/level-1/level-2/level-3/level-4')).not.toBeNull();

    // Verify file states were flipped
    const deepFile = findNode(result, '/level-0/level-1/level-2/level-3/level-4/file-5-0.dat');
    expect(deepFile).not.toBeNull();
    // Original was Hosted (uploaded by CID_A, viewer was CID_A), after flip should be Remote
    expect(deepFile!.fileState).toBe(RevfsFileState.Remote);
  });

  it('handles wide tree at each level (many siblings)', () => {
    let tree = createDefaultTree();
    const SIBLINGS_PER_LEVEL = 20;
    const LEVELS = 5;

    // Create wide structure
    for (let level = 0; level < LEVELS; level++) {
      const parentPath = level === 0 ? '/' : `/wide-${level - 1}`;
      for (let sibling = 0; sibling < SIBLINGS_PER_LEVEL; sibling++) {
        const dirPath = level === 0
          ? `/wide-${level}-sibling-${sibling}`
          : `${parentPath}/wide-${level}-sibling-${sibling}`;

        // Only create one path per level for deeper levels
        if (level > 0 && sibling > 0) continue;

        try {
          [tree] = mkdir(tree, dirPath);
          // Add a file
          const meta = makeMeta({ fileId: `w-${level}-${sibling}`, fileName: `data-${sibling}.bin` });
          [tree] = placeFile(tree, `${dirPath}/data-${sibling}.bin`, meta, CID_A);
        } catch {
          // Parent might not exist for deeper levels with multiple siblings
        }
      }
    }

    // Verify wide root level
    for (let s = 0; s < SIBLINGS_PER_LEVEL; s++) {
      const node = findNode(tree, `/wide-0-sibling-${s}`);
      expect(node).not.toBeNull();
      expect(findNode(tree, `/wide-0-sibling-${s}/data-${s}.bin`)).not.toBeNull();
    }
  });

  it('immutability preserved in deep tree operations', () => {
    const { tree: originalTree, allDirPaths } = createDeepTree(10, 2);
    const originalNodeCount = countNodes(originalTree);

    // Perform operations - original should be unchanged
    const deepPath = allDirPaths[allDirPaths.length - 1];
    mkdir(originalTree, `${deepPath}/new-dir`);
    const meta = makeMeta({ fileId: 'new' });
    placeFile(originalTree, `${deepPath}/new.txt`, meta, CID_A);

    const afterNodeCount = countNodes(originalTree);
    expect(afterNodeCount.dirs).toBe(originalNodeCount.dirs);
    expect(afterNodeCount.files).toBe(originalNodeCount.files);
  });

  it('path normalization works at all depths', () => {
    const { tree, allDirPaths } = createDeepTree(20, 1);

    for (const dirPath of allDirPaths.slice(0, 10)) {
      // Test with trailing slash
      expect(findNode(tree, `${dirPath}/`)).not.toBeNull();
      // Test with double slashes
      const doubleSlashPath = dirPath.replace(/\//g, '//');
      expect(findNode(tree, doubleSlashPath)).not.toBeNull();
    }
  });
});

// ============================================================================
// renameNode
// ============================================================================

describe('renameNode', () => {
  it('renames a directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const [newTree, op] = renameNode(tree, '/docs', 'documents');
    expect(findNode(newTree, '/docs')).toBeNull();
    expect(findNode(newTree, '/documents')).not.toBeNull();
    expect(op.op_type).toBe(RevfsOpType.Rename);
    expect(op.path).toBe('/docs');
    expect(op.newName).toBe('documents');
  });

  it('renames a file', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta({ fileName: 'old.pdf' });
    [tree] = placeFile(tree, '/docs/old.pdf', meta, CID_A);
    const [newTree, op] = renameNode(tree, '/docs/old.pdf', 'new.pdf');
    expect(findNode(newTree, '/docs/old.pdf')).toBeNull();
    expect(findNode(newTree, '/docs/new.pdf')).not.toBeNull();
    expect(op.newName).toBe('new.pdf');
  });

  it('updates child paths when renaming directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/reports');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/reports/q1.pdf', meta, CID_A);
    const [newTree] = renameNode(tree, '/docs', 'documents');
    expect(findNode(newTree, '/documents/reports')).not.toBeNull();
    expect(findNode(newTree, '/documents/reports/q1.pdf')).not.toBeNull();
  });

  it('throws on root rename', () => {
    const tree = createDefaultTree();
    expect(() => renameNode(tree, '/', 'newroot')).toThrow('Cannot rename root');
  });

  it('throws on protected directory rename', () => {
    const tree = createDefaultTree();
    expect(() => renameNode(tree, SENT_FILES_DIR, 'Outbox')).toThrow('protected');
    expect(() => renameNode(tree, RECEIVED_FILES_DIR, 'Inbox')).toThrow('protected');
  });

  it('throws on name collision', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/files');
    expect(() => renameNode(tree, '/docs', 'files')).toThrow('already exists');
  });

  it('throws on invalid name', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    expect(() => renameNode(tree, '/docs', '')).toThrow('Invalid name');
    expect(() => renameNode(tree, '/docs', 'path/with/slash')).toThrow('Invalid name');
  });

  it('does not mutate original tree', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    renameNode(tree, '/docs', 'documents');
    expect(findNode(tree, '/docs')).not.toBeNull();
    expect(findNode(tree, '/documents')).toBeNull();
  });
});

// ============================================================================
// moveNode
// ============================================================================

describe('moveNode', () => {
  it('moves a directory to new parent', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const [newTree, op] = moveNode(tree, '/docs', '/archive');
    expect(findNode(newTree, '/docs')).toBeNull();
    expect(findNode(newTree, '/archive/docs')).not.toBeNull();
    expect(op.op_type).toBe(RevfsOpType.Move);
    expect(op.path).toBe('/docs');
    expect(op.destPath).toBe('/archive/docs');
  });

  it('moves a file to new parent', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/report.pdf', meta, CID_A);
    const [newTree] = moveNode(tree, '/docs/report.pdf', '/archive');
    expect(findNode(newTree, '/docs/report.pdf')).toBeNull();
    expect(findNode(newTree, '/archive/report.pdf')).not.toBeNull();
  });

  it('updates child paths when moving directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/reports');
    [tree] = mkdir(tree, '/archive');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/reports/q1.pdf', meta, CID_A);
    const [newTree] = moveNode(tree, '/docs', '/archive');
    expect(findNode(newTree, '/archive/docs/reports')).not.toBeNull();
    expect(findNode(newTree, '/archive/docs/reports/q1.pdf')).not.toBeNull();
  });

  it('throws when moving to root', () => {
    const tree = createDefaultTree();
    expect(() => moveNode(tree, '/', '/somewhere')).toThrow('Cannot move root');
  });

  it('throws when moving protected directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/archive');
    expect(() => moveNode(tree, SENT_FILES_DIR, '/archive')).toThrow('protected');
  });

  it('throws when moving into itself', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/sub');
    expect(() => moveNode(tree, '/docs', '/docs')).toThrow('into itself');
    expect(() => moveNode(tree, '/docs', '/docs/sub')).toThrow('into itself');
  });

  it('throws on name collision at destination', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    [tree] = mkdir(tree, '/archive/docs');
    expect(() => moveNode(tree, '/docs', '/archive')).toThrow('already exists');
  });

  it('does not mutate original tree', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    moveNode(tree, '/docs', '/archive');
    expect(findNode(tree, '/docs')).not.toBeNull();
    expect(findNode(tree, '/archive/docs')).toBeNull();
  });
});

// ============================================================================
// copyNode
// ============================================================================

describe('copyNode', () => {
  it('copies a directory to new parent', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const [newTree, op] = copyNode(tree, '/docs', '/archive');
    // Original still exists
    expect(findNode(newTree, '/docs')).not.toBeNull();
    // Copy exists
    expect(findNode(newTree, '/archive/docs')).not.toBeNull();
    expect(op.op_type).toBe(RevfsOpType.Copy);
    expect(op.path).toBe('/docs');
    expect(op.destPath).toBe('/archive/docs');
  });

  it('copies a file to new parent', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/report.pdf', meta, CID_A);
    let fileIdCounter = 0;
    const [newTree] = copyNode(tree, '/docs/report.pdf', '/archive', () => `new-id-${++fileIdCounter}`);
    expect(findNode(newTree, '/docs/report.pdf')).not.toBeNull();
    expect(findNode(newTree, '/archive/report.pdf')).not.toBeNull();
    // New file should have new ID
    const copiedFile = findNode(newTree, '/archive/report.pdf');
    expect(copiedFile?.fileMetadata?.fileId).toBe('new-id-1');
  });

  it('deep copies directory with children', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/reports');
    [tree] = mkdir(tree, '/archive');
    const meta = makeMeta();
    [tree] = placeFile(tree, '/docs/reports/q1.pdf', meta, CID_A);
    const [newTree] = copyNode(tree, '/docs', '/archive');
    expect(findNode(newTree, '/archive/docs/reports')).not.toBeNull();
    expect(findNode(newTree, '/archive/docs/reports/q1.pdf')).not.toBeNull();
  });

  it('adds (copy) suffix on name collision', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const [newTree] = copyNode(tree, '/docs', '/');
    // Should create /docs (copy) since /docs exists
    expect(findNode(newTree, '/docs (copy)')).not.toBeNull();
  });

  it('adds (copy 2) suffix on multiple collisions', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = copyNode(tree, '/docs', '/');  // Creates /docs (copy)
    [tree] = copyNode(tree, '/docs', '/');  // Creates /docs (copy 2)
    expect(findNode(tree, '/docs (copy)')).not.toBeNull();
    expect(findNode(tree, '/docs (copy 2)')).not.toBeNull();
  });

  it('handles file extension in copy suffix', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const meta = makeMeta({ fileName: 'report.pdf' });
    [tree] = placeFile(tree, '/docs/report.pdf', meta, CID_A);
    const [newTree] = copyNode(tree, '/docs/report.pdf', '/docs');
    // Should create report (copy).pdf
    expect(findNode(newTree, '/docs/report (copy).pdf')).not.toBeNull();
  });

  it('throws when copying protected directory', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/archive');
    expect(() => copyNode(tree, SENT_FILES_DIR, '/archive')).toThrow('protected');
  });

  it('throws when copying root', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/archive');
    expect(() => copyNode(tree, '/', '/archive')).toThrow('Cannot copy root');
  });

  it('does not mutate original tree', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const childCount = findNode(tree, '/archive')?.children?.length ?? 0;
    copyNode(tree, '/docs', '/archive');
    expect(findNode(tree, '/archive')?.children?.length ?? 0).toBe(childCount);
  });
});

// ============================================================================
// applyRemoteOp for Rename, Move, Copy
// ============================================================================

describe('applyRemoteOp for new operations', () => {
  it('applies remote Rename', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    const op = { op_id: '1', op_type: RevfsOpType.Rename, path: '/docs', newName: 'documents', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/docs')).toBeNull();
    expect(findNode(result, '/documents')).not.toBeNull();
  });

  it('applies remote Rename with nested children', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/reports');
    const op = { op_id: '1', op_type: RevfsOpType.Rename, path: '/docs', newName: 'documents', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/documents/reports')).not.toBeNull();
  });

  it('ignores remote Rename for protected dirs', () => {
    const tree = createDefaultTree();
    const op = { op_id: '1', op_type: RevfsOpType.Rename, path: SENT_FILES_DIR, newName: 'Outbox', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, SENT_FILES_DIR)).not.toBeNull();
  });

  it('ignores remote Rename on collision', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/files');
    const op = { op_id: '1', op_type: RevfsOpType.Rename, path: '/docs', newName: 'files', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    // Both should still exist since rename was blocked
    expect(findNode(result, '/docs')).not.toBeNull();
    expect(findNode(result, '/files')).not.toBeNull();
  });

  it('applies remote Move', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const op = { op_id: '1', op_type: RevfsOpType.Move, path: '/docs', destPath: '/archive/docs', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/docs')).toBeNull();
    expect(findNode(result, '/archive/docs')).not.toBeNull();
  });

  it('applies remote Move with nested children', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/docs/reports');
    [tree] = mkdir(tree, '/archive');
    const op = { op_id: '1', op_type: RevfsOpType.Move, path: '/docs', destPath: '/archive/docs', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/archive/docs/reports')).not.toBeNull();
  });

  it('ignores remote Move for protected dirs', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/archive');
    const op = { op_id: '1', op_type: RevfsOpType.Move, path: SENT_FILES_DIR, destPath: '/archive/sent', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, SENT_FILES_DIR)).not.toBeNull();
  });

  it('applies remote Copy', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const op = { op_id: '1', op_type: RevfsOpType.Copy, path: '/docs', destPath: '/archive/docs', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    expect(findNode(result, '/docs')).not.toBeNull();
    expect(findNode(result, '/archive/docs')).not.toBeNull();
  });

  it('applies remote Copy with metadata', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    const meta = makeMeta({ fileId: 'original' });
    [tree] = placeFile(tree, '/docs/report.pdf', meta, CID_A);
    const newMeta = makeMeta({ fileId: 'copied' });
    const op = { op_id: '1', op_type: RevfsOpType.Copy, path: '/docs/report.pdf', destPath: '/archive/report.pdf', metadata: newMeta, timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    const copiedFile = findNode(result, '/archive/report.pdf');
    expect(copiedFile?.fileMetadata?.fileId).toBe('copied');
  });

  it('ignores remote Copy on collision', () => {
    let tree = createDefaultTree();
    [tree] = mkdir(tree, '/docs');
    [tree] = mkdir(tree, '/archive');
    [tree] = mkdir(tree, '/archive/docs');
    const op = { op_id: '1', op_type: RevfsOpType.Copy, path: '/docs', destPath: '/archive/docs', timestamp: Date.now() };
    const result = applyRemoteOp(tree, op, CID_B);
    // archive/docs should still be the original (collision blocked copy)
    const archiveDocs = findNode(result, '/archive/docs');
    expect(archiveDocs?.children?.length ?? 0).toBe(0);
  });
});
