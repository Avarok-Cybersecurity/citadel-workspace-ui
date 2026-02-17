import type { Node } from "@xyflow/react";
import { TreeGraphNode } from "./TreeGraphNode";
import type { TreeFlowNode } from "./tree-graph-types";
import { isVariant } from 'citadel-workspace-client-ts';

/**
 * Node types registry for React Flow.
 * Type assertion needed as TreeGraphNode has more specific types than NodeTypes expects.
 */
export const nodeTypes = {
  treeNode: TreeGraphNode,
} as const;

/**
 * Returns the minimap node color based on entity type.
 */
export function getMinimapNodeColor(node: Node): string {
  const entityType = (node.data as TreeFlowNode["data"])?.entityType;

  if (entityType === "Workspace") {
    return "#7c3aed";
  }

  if (isVariant(entityType as Record<string, unknown>, 'Child')) {
    const childType = (entityType as { Child: string }).Child.toLowerCase();
    switch (childType) {
      case "office":
        return "#2563eb";
      case "room":
        return "#16a34a";
      case "department":
        return "#ea580c";
      case "team":
        return "#0891b2";
      case "project":
        return "#db2777";
      default:
        return "#475569";
    }
  }

  return "#475569";
}
