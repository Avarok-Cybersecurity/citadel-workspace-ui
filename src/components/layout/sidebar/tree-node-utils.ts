import { searchMatcher } from '@/lib/fold-for-search';
import { isVariant } from 'citadel-workspace-client-ts';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import type { DomainNode, TreeNode } from './tree-node-types';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

/**
 * Builds a tree structure from a flat list of DomainNodes.
 * Groups nodes by parent_id and creates a recursive TreeNode structure.
 */
/**
 * `rootName` names the synthetic parent made when there are several top-level spaces:
 * the workspace's own name. It said "Workspace", measured live.
 */
export function buildTreeFromNodes(nodes: DomainNode[], rootName: string): TreeNode | null {
  if (nodes.length === 0) return null;

  // Build lookup maps
  const nodeMap: Map<string, DomainNode> = new Map<string, DomainNode>();
  const childrenMap: Map<string | null, DomainNode[]> = new Map<string | null, DomainNode[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    const parentId: string | null = node.parent_id;
    const siblings: DomainNode[] = childrenMap.get(parentId) ?? [];
    siblings.push(node);
    childrenMap.set(parentId, siblings);
  }

  // A root is a node whose parent is not in this set.
  //
  // This used to be "children of null" PLUS "children of 'workspace-root'",
  // which double-counts whenever the server includes the workspace root node
  // itself: the root has parent_id null so it is a root, and its children name
  // 'workspace-root' as their parent so they were treated as roots too. Every
  // top-level office then rendered TWICE — once beside the root and once
  // beneath it — with duplicate ids and duplicate data-testids, which is how
  // this surfaced (a testid lookup resolving to 2 elements).
  //
  // Deriving it from the data answers both cases with one rule: when the root
  // node is present its children have a resolvable parent and are not roots;
  // when it is absent they have a dangling 'workspace-root' parent and are.
  const roots: DomainNode[] = nodes.filter(
    (node) => node.parent_id === null || !nodeMap.has(node.parent_id)
  );
  if (roots.length === 0) return null;

  // Sort roots by name
  roots.sort((a, b) => a.name.localeCompare(b.name));

  // Recursive function to build tree
  function buildNode(node: DomainNode): TreeNode {
    const nodeChildren: DomainNode[] = childrenMap.get(node.id) ?? [];
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
    id: WORKSPACE_ROOT_ID,
    parent_id: null,
    entity_type: 'Workspace',
    depth: 0,
    name: rootName,
    description: '',
    owner_id: '',
    members: [],
    children: roots.map(r => r.id),
    mdx_content: '',
    // A synthetic root the client invents to hold the real roots; it has no
    // stored document and therefore no server hash.
    mdx_content_hash: null,
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

/**
 * How many spaces sit inside `nodeId`, at any depth, by `parent_id` -- the relation the
 * tree is drawn from. A node's own `children` list can lag it: after a room was moved in,
 * deleting its new office warned about nothing (measured live).
 */
export function descendantCount(nodes: readonly DomainNode[], nodeId: string): number {
  const byParent: Map<string, string[]> = new Map();
  for (const node of nodes) {
    if (node.parent_id === null) continue;
    byParent.set(node.parent_id, [...(byParent.get(node.parent_id) ?? []), node.id]);
  }
  let count: number = 0;
  const pending: string[] = [...(byParent.get(nodeId) ?? [])];
  while (pending.length > 0) {
    const next: string = pending.pop() as string;
    count++;
    pending.push(...(byParent.get(next) ?? []));
  }
  return count;
}

/**
 * The tree cut down to the nodes whose name matches `query`, plus their
 * ancestors; the tree itself when the query is blank, null when nothing matches.
 * Folded, and folded ONCE -- see fold-for-search.ts. The walk recurses over the
 * whole tree, so a per-node fold is a per-node normalisation.
 */
export function filterTree(tree: TreeNode | null, query: string): TreeNode | null {
  if (!tree || !query.trim()) return tree;
  const matches: (haystack: string) => boolean = searchMatcher(query);
  function filterNode(tn: TreeNode): TreeNode | null {
    const children: TreeNode[] = tn.children
      .map(filterNode)
      .filter((c: TreeNode | null): c is TreeNode => c !== null);
    return matches(tn.node.name) || children.length > 0 ? { ...tn, children } : null;
  }
  return filterNode(tree);
}
