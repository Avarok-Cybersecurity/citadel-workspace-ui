import { describe, it, expect } from 'vitest';
import { buildTreeFromNodes } from '../tree-node-utils';
import type { DomainNode } from '../tree-node-types';
import type { TreeNode } from '@/components/layout/sidebar/tree-node-types';

/**
 * A node carrying only the fields buildTreeFromNodes reads. Filling in the rest
 * of DomainNode would obscure what each case is actually about.
 */
function node(id: string, parent_id: string | null, name = id): DomainNode {
  return {
    id,
    parent_id,
    name,
    entity_type: 'Office',
    depth: 0,
    description: '',
    owner_id: '',
    members: [],
    children: [],
    mdx_content: '',
    rules: null,
    chat_enabled: false,
    chat_channel_id: null,
    default_permissions: [],
    metadata: [],
    allowed_child_types: [],
  } as unknown as DomainNode;
}

/** Every id in the tree, in order, so duplicates are visible. */
function idsInTree(tree: ReturnType<typeof buildTreeFromNodes>): string[] {
  if (!tree) return [];
  return [tree.node.id, ...tree.children.flatMap(idsInTree)];
}

describe('buildTreeFromNodes', () => {
  it('renders each node once when the workspace root is present', () => {
    // The regression this guards. Roots used to be "children of null" PLUS
    // "children of 'workspace-root'". With the root node itself in the list the
    // root matched the first rule and its children matched the second, so every
    // office rendered twice — once beside the root and once beneath it —
    // producing duplicate DOM ids and testids.
    const tree: TreeNode | null = buildTreeFromNodes([
      node('workspace-root', null, 'Root Workspace'),
      node('office-a', 'workspace-root', 'General'),
      node('office-b', 'workspace-root', 'Engineering'),
    ]);

    const ids: string[] = idsInTree(tree);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(tree?.node.id).toBe('workspace-root');
    expect(tree?.children.map((c) => c.node.id).sort()).toEqual(['office-a', 'office-b']);
  });

  it('nests children under their parent', () => {
    const tree: TreeNode | null = buildTreeFromNodes([
      node('workspace-root', null, 'Root'),
      node('office-a', 'workspace-root', 'General'),
      node('room-a', 'office-a', 'Random'),
    ]);

    expect(tree?.children[0].node.id).toBe('office-a');
    expect(tree?.children[0].children[0].node.id).toBe('room-a');
  });

  it('wraps orphans in a synthetic root when the real root is absent', () => {
    // The other half of the same rule: with no 'workspace-root' node in the set,
    // its children have a dangling parent and are genuinely roots.
    const tree: TreeNode | null = buildTreeFromNodes([
      node('office-a', 'workspace-root', 'General'),
      node('office-b', 'workspace-root', 'Engineering'),
    ]);

    expect(tree?.node.id).toBe('workspace-root');
    const ids: string[] = idsInTree(tree);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(tree?.children.map((c) => c.node.id).sort()).toEqual(['office-a', 'office-b']);
  });

  it('returns null for an empty set', () => {
    expect(buildTreeFromNodes([])).toBeNull();
  });
});
