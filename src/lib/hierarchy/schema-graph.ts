/**
 * The hierarchy as a graph for the editor: levels (Structure view) or real nodes (Organisation
 * view) laid out top-down.
 *
 * Pure: plain node and edge records with positions. The components hand them to React Flow, and
 * every edit goes back through `schema-edits`, so the graph is only ever a view of the schema.
 */
import { Graph, layout as dagreLayout } from '@dagrejs/dagre';
import type { DomainNode, EntityTypeConfig, TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { WORKSPACE_LEVEL, childrenOf, levelNames } from './schema-edits';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import { moveTargets } from '@/lib/workspace-service/move-targets';

export interface GraphNode<D> {
  id: string;
  position: { x: number; y: number };
  data: D;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface LevelData {
  typeName: string;
  label: string;
  icon: string;
  isRoot: boolean;
}
export interface OrgData {
  nodeId: string;
  name: string;
  typeName: string;
}

/** Node box size, shared with the components that draw them. */
export const GRAPH_NODE_WIDTH: number = 180;
export const GRAPH_NODE_HEIGHT: number = 56;

export const edgeId = (source: string, target: string): string => `${source}->${target}`;

function layout<D>(ids: Array<{ id: string; data: D }>, edges: GraphEdge[]): GraphNode<D>[] {
  const g: Graph = new Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel((): Record<string, never> => ({}));
  for (const { id } of ids) g.setNode(id, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagreLayout(g);
  return ids.map(({ id, data }) => {
    const p: { x: number; y: number } = g.node(id);
    // dagre gives centres; React Flow positions a node by its top-left corner.
    return { id, data, position: { x: p.x - GRAPH_NODE_WIDTH / 2, y: p.y - GRAPH_NODE_HEIGHT / 2 } };
  });
}

/** Structure view: one node per level, one edge per "may contain". */
export function schemaToGraph(schema: TreeSchema): { nodes: GraphNode<LevelData>[]; edges: GraphEdge[] } {
  const names: string[] = Array.from(new Set([WORKSPACE_LEVEL, ...levelNames(schema)]));
  const configOf = (name: string): EntityTypeConfig | undefined =>
    schema.entity_type_configs.find((c: EntityTypeConfig) => c.type_name === name);
  const edges: GraphEdge[] = names.flatMap((parent: string) =>
    childrenOf(schema, parent)
      .filter((child: string) => names.includes(child))
      .map((child: string) => ({ id: edgeId(parent, child), source: parent, target: child })),
  );
  const nodes: GraphNode<LevelData>[] = layout(
    names.map((name: string) => ({
      id: name,
      data: { typeName: name, label: configOf(name)?.label ?? name, icon: configOf(name)?.icon ?? 'folder', isRoot: name === WORKSPACE_LEVEL },
    })),
    edges,
  );
  return { nodes, edges };
}

/** Organisation view: the workspace root and every node under it. */
export function treeToGraph(nodes: DomainNode[], workspaceName: string): { nodes: GraphNode<OrgData>[]; edges: GraphEdge[] } {
  const ids: Set<string> = new Set<string>(nodes.map((n: DomainNode) => n.id));
  const parentOf = (n: DomainNode): string =>
    n.parent_id && ids.has(n.parent_id) ? n.parent_id : WORKSPACE_ROOT_ID;
  const edges: GraphEdge[] = nodes.map((n: DomainNode) => ({ id: edgeId(parentOf(n), n.id), source: parentOf(n), target: n.id }));
  const records: Array<{ id: string; data: OrgData }> = [
    { id: WORKSPACE_ROOT_ID, data: { nodeId: WORKSPACE_ROOT_ID, name: workspaceName, typeName: WORKSPACE_LEVEL } },
    ...nodes.map((n: DomainNode) => ({ id: n.id, data: { nodeId: n.id, name: n.name, typeName: getEntityTypeString(n.entity_type) } })),
  ];
  return { nodes: layout(records, edges), edges };
}

/**
 * Whether a node of level `moving` may be dropped under a node of level `target`, and why not.
 * The server checks the same rule on the move.
 */
export function dropProblem(schema: TreeSchema, moving: string, target: string, labelOf: (level: string) => string): string | null {
  return childrenOf(schema, target).includes(moving)
    ? null
    : `A ${labelOf(target)} cannot contain a ${labelOf(moving)}.`;
}

/**
 * Where a node may be moved, for a drag and for "Move into": the sidebar's move rules
 * (`moveTargets`: not itself, not inside its own descendants, not under a level that will not
 * have it), and the workspace itself when its level may sit at the top.
 */
export function moveDestinations(
  schema: TreeSchema,
  nodes: Record<string, DomainNode>,
  movedId: string,
  workspaceName: string,
): Array<{ id: string; name: string }> {
  const moved: DomainNode | undefined = nodes[movedId];
  if (!moved) return [];
  const atTop: boolean = !moved.parent_id || moved.parent_id === WORKSPACE_ROOT_ID;
  const top: Array<{ id: string; name: string }> =
    !atTop && childrenOf(schema, WORKSPACE_LEVEL).includes(getEntityTypeString(moved.entity_type))
      ? [{ id: WORKSPACE_ROOT_ID, name: workspaceName }]
      : [];
  return [...top, ...moveTargets(nodes, movedId).map((n: DomainNode) => ({ id: n.id, name: n.name }))];
}
