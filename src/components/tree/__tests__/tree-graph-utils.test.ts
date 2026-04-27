import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from '../tree-graph-utils';
import {
  findReparentTarget,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  type ReparentCandidateNode,
} from '../tree-reparent';
import type { TreeNode, DomainNode } from '../tree-graph-types';

/* ------------------------------------------------------------------ */
/* `findReparentTarget`                                                */
/* ------------------------------------------------------------------ */

/**
 * Build a candidate node at the given top-left position with optional
 * measured dimensions. Centers are computed as `position + size/2`.
 */
function mkNode(
  id: string,
  x: number,
  y: number,
  measured?: { width?: number; height?: number },
): ReparentCandidateNode {
  return { id, position: { x, y }, ...(measured ? { measured } : {}) };
}

describe('findReparentTarget', () => {
  it('returns null when no candidate is within the proximity threshold', () => {
    const dragged = mkNode('d', 0, 0);
    // Place a candidate well outside DEFAULT (240) * 0.6 ≈ 144 from dragged center.
    const other = mkNode('a', 1000, 1000);
    expect(findReparentTarget([dragged, other], dragged)).toBeNull();
  });

  it('selects the closest candidate within threshold and ignores the dragged node itself', () => {
    // Dragged center at (120, 40) using defaults.
    const dragged = mkNode('d', 0, 0);
    const close = mkNode('a', 30, 0); // very close
    const far = mkNode('b', 300, 200); // outside threshold
    expect(findReparentTarget([dragged, close, far], dragged)).toBe('a');
  });

  it('uses measured dimensions when present so threshold scales with node size', () => {
    // A small node (40×40) needs a tighter proximity (≤24px) than a large one.
    const dragged = mkNode('d', 0, 0, { width: 40, height: 40 });
    const tinyCandidate = mkNode('tiny', 100, 0, { width: 40, height: 40 });
    // Distance between centers (20,20) and (120,20) = 100px; threshold = max(40,40)*0.6 = 24px.
    expect(findReparentTarget([dragged, tinyCandidate], dragged)).toBeNull();

    // A large candidate (400×400) should accept the same drag because its
    // threshold is max(400,400)*0.6 = 240, well above 100.
    const largeCandidate = mkNode('large', 100, 0, { width: 400, height: 400 });
    // Center of large candidate at (300, 200); dragged center at (20, 20);
    // distance = sqrt(280^2 + 180^2) ≈ 333 — still above threshold (240).
    // Move closer:
    const largerCloser = mkNode('huge', 0, 0, { width: 400, height: 400 });
    // Center at (200, 200); dragged center (20, 20); distance ≈ 254 — also above.
    // Place it slightly closer:
    const reachable = mkNode('reachable', 0, -100, { width: 400, height: 400 });
    // Center at (200, 100); distance from (20,20) ≈ sqrt(180^2 + 80^2) ≈ 197 < 240 ✓
    expect(findReparentTarget([dragged, largeCandidate, largerCloser, reachable], dragged)).toBe('reachable');
  });

  it('falls back to default dimensions when measured is missing', () => {
    // Without measured, both nodes get DEFAULT (240×80). Threshold = 144.
    const dragged = mkNode('d', 0, 0);
    const candidate = mkNode('a', 100, 0);
    // Centers: (120, 40) and (220, 40); distance = 100 < 144 ✓
    expect(findReparentTarget([dragged, candidate], dragged)).toBe('a');
    // Defaults align with the dagre layout values - a regression here
    // means dimensions drift between layout and proximity logic.
    expect(DEFAULT_NODE_WIDTH).toBe(240);
    expect(DEFAULT_NODE_HEIGHT).toBe(80);
  });

  it('breaks ties deterministically by iteration order', () => {
    // Two candidates at the exact same distance from the dragged node.
    // The first one in the array wins.
    const dragged = mkNode('d', 0, 0);
    const a = mkNode('a', 50, 0);
    const b = mkNode('b', -50, 0); // mirrored, same distance
    expect(findReparentTarget([dragged, a, b], dragged)).toBe('a');
    expect(findReparentTarget([dragged, b, a], dragged)).toBe('b');
  });

  it('handles empty and single-node inputs safely', () => {
    const dragged = mkNode('only', 0, 0);
    expect(findReparentTarget([], dragged)).toBeNull();
    expect(findReparentTarget([dragged], dragged)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* `wouldCreateCycle`                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a minimal `DomainNode` for tree-shape tests. Most fields are
 * irrelevant to cycle detection - only `id`, `parent_id`, and `children`
 * matter, but `wouldCreateCycle` only consumes the `TreeNode` shape so
 * we keep the rest as defaults.
 */
function dn(id: string, parentId: string | null = null): DomainNode {
  return {
    id,
    parent_id: parentId,
    entity_type: 'Workspace',
    depth: 0,
    name: id,
    description: '',
    owner_id: '',
    members: [],
    children: [],
    mdx_content: '',
    rules: null,
    chat_enabled: false,
    chat_channel_id: null,
    default_permissions: {},
    metadata: [],
    allowed_child_types: null,
    is_default: false,
    created_at: 0n,
    updated_at: 0n,
  };
}

function leaf(id: string): TreeNode {
  return { node: dn(id), children: [] };
}

function branch(id: string, children: TreeNode[]): TreeNode {
  return { node: dn(id), children };
}

describe('wouldCreateCycle', () => {
  it('returns true when moving a node onto itself', () => {
    const tree: TreeNode = branch('root', [leaf('a')]);
    expect(wouldCreateCycle(tree, 'a', 'a')).toBe(true);
  });

  it('returns true when moving a node under one of its descendants', () => {
    //   root
    //   └── a
    //       └── b
    //           └── c
    const tree: TreeNode = branch('root', [
      branch('a', [branch('b', [leaf('c')])]),
    ]);
    // Moving 'a' under any of {a, b, c} would create a cycle.
    expect(wouldCreateCycle(tree, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(tree, 'a', 'c')).toBe(true);
  });

  it('returns false for a sibling reparent', () => {
    //   root
    //   ├── a
    //   └── b
    const tree: TreeNode = branch('root', [leaf('a'), leaf('b')]);
    expect(wouldCreateCycle(tree, 'a', 'b')).toBe(false);
  });

  it('returns false when moving onto an unrelated subtree', () => {
    //   root
    //   ├── a
    //   │   └── x
    //   └── b
    //       └── y
    const tree: TreeNode = branch('root', [
      branch('a', [leaf('x')]),
      branch('b', [leaf('y')]),
    ]);
    // Move 'a' under 'y': not a cycle (a's descendants are {x}, y is in 'b' subtree)
    expect(wouldCreateCycle(tree, 'a', 'y')).toBe(false);
  });

  it('returns false when the node-to-move is not in the tree', () => {
    const tree: TreeNode = branch('root', [leaf('a')]);
    expect(wouldCreateCycle(tree, 'missing', 'a')).toBe(false);
  });
});
