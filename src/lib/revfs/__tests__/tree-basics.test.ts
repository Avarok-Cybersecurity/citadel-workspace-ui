/**
 * Tree Operations Tests: Basics
 *
 * Tests for peerPairKey, normalizePath, createDefaultTree, findNode.
 */

import { describe, it, expect } from 'vitest';
import {
  peerPairKey,
  createDefaultTree,
  findNode,
  normalizePath,
} from '../tree-operations';
import {
  SENT_FILES_DIR,
  RECEIVED_FILES_DIR,
} from '@/types/revfs-types';
import { CID_A, CID_B } from './tree-test-helpers';
import type { RevfsNode } from '@/types/revfs-types';

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
    const tree: RevfsNode = createDefaultTree();
    expect(tree.path).toBe('/');
    expect(tree.children).toHaveLength(2);
    const paths: string[] = tree.children!.map(c => c.path);
    expect(paths).toContain(RECEIVED_FILES_DIR);
    expect(paths).toContain(SENT_FILES_DIR);
  });
});

// ============================================================================
// findNode
// ============================================================================

describe('findNode', () => {
  it('finds root', () => {
    const tree: RevfsNode = createDefaultTree();
    expect(findNode(tree, '/')).toBe(tree);
  });

  it('finds child by path', () => {
    const tree: RevfsNode = createDefaultTree();
    const node: RevfsNode | null = findNode(tree, SENT_FILES_DIR);
    expect(node).not.toBeNull();
    expect(node!.name).toBe('Sent Files');
  });

  it('returns null for missing path', () => {
    const tree: RevfsNode = createDefaultTree();
    expect(findNode(tree, '/nonexistent')).toBeNull();
  });
});
