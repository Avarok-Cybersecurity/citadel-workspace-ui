import { isVariant } from 'citadel-workspace-client-ts';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import type { DomainNode, TreeNode } from './tree-node-types';

/**
 * Builds a tree structure from a flat list of DomainNodes.
 * Groups nodes by parent_id and creates a recursive TreeNode structure.
 */
export function buildTreeFromNodes(nodes: DomainNode[]): TreeNode | null {
  if (nodes.length === 0) return null;

  // Build lookup maps
  const nodeMap = new Map<string, DomainNode>();
  const childrenMap = new Map<string | null, DomainNode[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    const parentId = node.parent_id;
    const siblings = childrenMap.get(parentId) ?? [];
    siblings.push(node);
    childrenMap.set(parentId, siblings);
  }

  // Find root nodes: parent_id is null OR "workspace-root" (synthetic sentinel)
  const roots = [
    ...(childrenMap.get(null) ?? []),
    ...(childrenMap.get('workspace-root') ?? []),
  ];
  if (roots.length === 0) return null;

  // Sort roots by name
  roots.sort((a, b) => a.name.localeCompare(b.name));

  // Recursive function to build tree
  function buildNode(node: DomainNode): TreeNode {
    const nodeChildren = childrenMap.get(node.id) ?? [];
    // Sort children by name
    nodeChildren.sort((a, b) => a.name.localeCompare(b.name));

    return {
      node,
      children: nodeChildren.map(buildNode),
    };
  }

  // Single root: return it directly
  if (roots.length === 1) {
    return buildNode(roots[0]);
  }

  // Multiple roots: wrap in synthetic workspace node so all are visible
  const syntheticRoot: DomainNode = {
    id: 'workspace-root',
    parent_id: null,
    entity_type: 'Workspace',
    depth: 0,
    name: 'Workspace',
    description: '',
    owner_id: '',
    members: [],
    children: roots.map(r => r.id),
    mdx_content: '',
    rules: null,
    chat_enabled: false,
    chat_channel_id: null,
    default_permissions: roots[0].default_permissions,
    metadata: [],
    allowed_child_types: [...new Set(roots.map(r =>
      isVariant(r.entity_type as Record<string, unknown>, 'Child') ? (r.entity_type as { Child: string }).Child :
      getEntityTypeString(r.entity_type)
    ))],
    is_default: false,
    created_at: 0n,
    updated_at: 0n,
  };

  return {
    node: syntheticRoot,
    children: roots.map(buildNode),
  };
}
