/**
 * Tree Graph Utilities
 *
 * Conversion and layout utilities for transforming TreeNode structures
 * into React Flow nodes and edges with automatic hierarchical positioning.
 */

import type { Edge } from "@xyflow/react";
import dagre from "dagre";
import type { TreeFlowNode, TreeNodeData, TreeNode, DomainNode, NodeEntityType } from "./tree-graph-types";
import { isVariant } from 'citadel-workspace-client-ts';

/**
 * Layout configuration for dagre
 */
interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  rankDirection: "TB" | "BT" | "LR" | "RL";
  nodeSep: number;
  rankSep: number;
  edgeSep: number;
}

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  nodeWidth: 240,
  nodeHeight: 80,
  rankDirection: "TB",
  nodeSep: 60,
  rankSep: 100,
  edgeSep: 20,
};

/**
 * Context for tree traversal
 */
interface TraversalContext {
  selectedNodeId: string | null;
  canEdit: boolean;
  onSelect: (nodeId: string) => void;
  onContextMenu: (nodeId: string, event: React.MouseEvent) => void;
}

/**
 * Convert a TreeNode structure to React Flow nodes and edges
 */
export function treeNodeToFlowElements(
  treeNode: TreeNode,
  context: TraversalContext
): { nodes: TreeFlowNode[]; edges: Edge[] } {
  const nodes: TreeFlowNode[] = [];
  const edges: Edge[] = [];

  function traverse(node: TreeNode, parentId: string | null): void {
    const { node: domainNode, children } = node;

    const flowNode = createFlowNode(domainNode, children.length, context);
    nodes.push(flowNode);

    if (parentId !== null) {
      edges.push(createEdge(parentId, domainNode.id));
    }

    for (const child of children) {
      traverse(child, domainNode.id);
    }
  }

  traverse(treeNode, null);

  return { nodes, edges };
}

/**
 * Create a React Flow node from a DomainNode
 */
function createFlowNode(
  domainNode: DomainNode,
  childCount: number,
  context: TraversalContext
): TreeFlowNode {
  const data: TreeNodeData = {
    domainNode,
    label: domainNode.name,
    description: truncateDescription(domainNode.description, 50),
    entityType: domainNode.entity_type,
    depth: domainNode.depth,
    childCount,
    isSelected: context.selectedNodeId === domainNode.id,
    canEdit: context.canEdit,
    onSelect: context.onSelect,
    onContextMenu: context.onContextMenu,
  };

  return {
    id: domainNode.id,
    type: "treeNode",
    position: { x: 0, y: 0 },
    data,
    draggable: context.canEdit,
  };
}

/**
 * Create an edge between two nodes
 */
function createEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `edge-${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    type: "smoothstep",
    animated: false,
    style: {
      stroke: "#6366f1",
      strokeWidth: 2,
    },
  };
}

/**
 * Apply dagre layout to position nodes hierarchically
 */
export function applyDagreLayout(
  nodes: TreeFlowNode[],
  edges: Edge[],
  config: Partial<LayoutConfig> = {}
): TreeFlowNode[] {
  const layoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...config };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: layoutConfig.rankDirection,
    nodesep: layoutConfig.nodeSep,
    ranksep: layoutConfig.rankSep,
    edgesep: layoutConfig.edgeSep,
  });

  // Add nodes to dagre graph
  for (const node of nodes) {
    dagreGraph.setNode(node.id, {
      width: layoutConfig.nodeWidth,
      height: layoutConfig.nodeHeight,
    });
  }

  // Add edges to dagre graph
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  // Run layout algorithm
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    if (nodeWithPosition) {
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - layoutConfig.nodeWidth / 2,
          y: nodeWithPosition.y - layoutConfig.nodeHeight / 2,
        },
      };
    }

    return node;
  });
}

/**
 * Truncate a description string to a maximum length
 */
function truncateDescription(description: string, maxLength: number): string {
  if (description.length <= maxLength) {
    return description;
  }
  return description.substring(0, maxLength - 3) + "...";
}

/**
 * Find a node in a tree structure by ID
 */
export function findNodeInTree(
  tree: TreeNode,
  nodeId: string
): TreeNode | null {
  if (tree.node.id === nodeId) {
    return tree;
  }

  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Get all descendant node IDs of a given node
 */
export function getDescendantIds(tree: TreeNode): string[] {
  const ids: string[] = [];

  function collect(node: TreeNode): void {
    for (const child of node.children) {
      ids.push(child.node.id);
      collect(child);
    }
  }

  collect(tree);
  return ids;
}

/**
 * Check if moving a node to a new parent would create a cycle
 */
export function wouldCreateCycle(
  tree: TreeNode,
  nodeId: string,
  newParentId: string
): boolean {
  const nodeTree = findNodeInTree(tree, nodeId);
  if (!nodeTree) {
    return false;
  }

  const descendantIds = getDescendantIds(nodeTree);
  return descendantIds.includes(newParentId) || nodeId === newParentId;
}

/**
 * Get the entity type string for display
 */
export function getEntityTypeString(entityType: NodeEntityType): string {
  if (entityType === "Workspace") {
    return "Workspace";
  }
  if (isVariant(entityType as Record<string, unknown>, 'Child')) {
    return (entityType as { Child: string }).Child;
  }
  return "Unknown";
}

/**
 * Default node dimensions when React Flow has not yet measured a node.
 *
 * These match the values reserved by `applyDagreLayout` (240 × 80) so the
 * proximity heuristic produces sensible results for un-measured nodes
 * during the very first frames of a drag, before React Flow's measurement
 * pass has populated `node.measured`.
 *
 * The PREVIOUS implementation hard-coded 160 × 40 here, which both didn't
 * match the dagre layout AND ignored measured dimensions entirely - so
 * any node with a longer-than-average label produced wrong centers and
 * either missed or accidentally triggered reparenting.
 */
export const DEFAULT_NODE_WIDTH = 240;
export const DEFAULT_NODE_HEIGHT = 80;

/**
 * Multiplier applied to the larger of two adjacent node dimensions to
 * derive the proximity threshold. ~0.6 means the dragged node's center
 * has to come within roughly 60% of a node's own height/width before it
 * is considered a reparent target. Scaling with node size keeps the
 * heuristic consistent across small and large nodes.
 */
export const REPARENT_THRESHOLD_RATIO = 0.6;

/**
 * Subset of React Flow's `Node` shape needed by the proximity heuristic.
 * Decoupling lets us unit-test `findReparentTarget` without the full RF
 * runtime.
 */
export interface ReparentCandidateNode {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
}

/**
 * Pure proximity heuristic: given the current React Flow node positions
 * and the drag-end position of the dragged node, return the id of the
 * closest other node within the proximity threshold, or `null` if none.
 *
 * Uses `node.measured?.width / height` when React Flow has measured the
 * node (post-layout) and falls back to the dagre layout defaults
 * otherwise. The threshold scales with node size via
 * `REPARENT_THRESHOLD_RATIO`.
 *
 * The dragged node itself is excluded. When two candidates are
 * equidistant, the iteration order is the one in `nodes`, which is
 * stable across renders.
 */
export function findReparentTarget(
  nodes: ReparentCandidateNode[],
  draggedNode: ReparentCandidateNode,
): string | null {
  const draggedWidth = draggedNode.measured?.width ?? DEFAULT_NODE_WIDTH;
  const draggedHeight = draggedNode.measured?.height ?? DEFAULT_NODE_HEIGHT;
  const draggedCenterX = draggedNode.position.x + draggedWidth / 2;
  const draggedCenterY = draggedNode.position.y + draggedHeight / 2;

  let closestId: string | null = null;
  let closestDist = Infinity;

  for (const candidate of nodes) {
    if (candidate.id === draggedNode.id) continue;
    const w = candidate.measured?.width ?? DEFAULT_NODE_WIDTH;
    const h = candidate.measured?.height ?? DEFAULT_NODE_HEIGHT;
    const dx = candidate.position.x + w / 2 - draggedCenterX;
    const dy = candidate.position.y + h / 2 - draggedCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = Math.max(w, h) * REPARENT_THRESHOLD_RATIO;
    if (dist < threshold && dist < closestDist) {
      closestDist = dist;
      closestId = candidate.id;
    }
  }

  return closestId;
}
