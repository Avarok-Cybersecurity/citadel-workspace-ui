/**
 * Tree Graph Editor Types
 *
 * Type definitions for the React Flow-based tree visualization component.
 */

import type { Node } from "@xyflow/react";

// Types for workspace hierarchy - imported from workspace client types
// Re-defining locally to avoid import issues with workspace package resolution
export type NodeEntityType = "Workspace" | { Child: string };

export interface DomainNode {
  id: string;
  parent_id: string | null;
  entity_type: NodeEntityType;
  depth: number;
  name: string;
  description: string;
  owner_id: string;
  members: string[];
  children: string[];
  mdx_content: string;
  rules: string | null;
  chat_enabled: boolean;
  chat_channel_id: string | null;
  default_permissions: Record<string, boolean>;
  metadata: number[];
  allowed_child_types: string[] | null;
  is_default: boolean;
  created_at: bigint;
  updated_at: bigint;
}

export interface TreeNode {
  node: DomainNode;
  children: TreeNode[];
}

/**
 * Props for the TreeGraphEditor component
 */
export interface TreeGraphEditorProps {
  treeStructure: TreeNode;
  onNodeSelect?: (nodeId: string) => void;
  onNodeCreate?: (parentId: string, entityType: string) => Promise<void>;
  onNodeUpdate?: (nodeId: string, updates: Partial<DomainNode>) => Promise<void>;
  onNodeDelete?: (nodeId: string, cascade: boolean) => Promise<void>;
  onNodeMove?: (nodeId: string, newParentId: string) => Promise<void>;
  canEdit?: boolean;
}

/**
 * Data attached to each React Flow node.
 * Extends Record<string, unknown> for React Flow compatibility.
 */
export interface TreeNodeData extends Record<string, unknown> {
  domainNode: DomainNode;
  label: string;
  description: string;
  entityType: NodeEntityType;
  depth: number;
  childCount: number;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: (nodeId: string) => void;
  onContextMenu: (nodeId: string, event: React.MouseEvent) => void;
}

/**
 * React Flow node with TreeNodeData
 */
export type TreeFlowNode = Node<TreeNodeData>;

/**
 * Context menu state for node operations
 */
export interface ContextMenuState {
  nodeId: string | null;
  x: number;
  y: number;
  isOpen: boolean;
}

/**
 * Node color configuration by entity type
 */
export interface NodeColorConfig {
  background: string;
  border: string;
  text: string;
  icon: string;
}

/**
 * Get color configuration for a node entity type
 */
export function getNodeColorConfig(entityType: NodeEntityType): NodeColorConfig {
  if (entityType === "Workspace") {
    return {
      background: "bg-purple-900/80",
      border: "border-purple-500",
      text: "text-purple-100",
      icon: "text-purple-300",
    };
  }

  // Handle Child types
  if (typeof entityType === "object" && "Child" in entityType) {
    const childType = entityType.Child.toLowerCase();

    switch (childType) {
      case "office":
        return {
          background: "bg-blue-900/80",
          border: "border-blue-500",
          text: "text-blue-100",
          icon: "text-blue-300",
        };
      case "room":
        return {
          background: "bg-green-900/80",
          border: "border-green-500",
          text: "text-green-100",
          icon: "text-green-300",
        };
      case "department":
        return {
          background: "bg-orange-900/80",
          border: "border-orange-500",
          text: "text-orange-100",
          icon: "text-orange-300",
        };
      case "team":
        return {
          background: "bg-cyan-900/80",
          border: "border-cyan-500",
          text: "text-cyan-100",
          icon: "text-cyan-300",
        };
      case "project":
        return {
          background: "bg-pink-900/80",
          border: "border-pink-500",
          text: "text-pink-100",
          icon: "text-pink-300",
        };
      default:
        return {
          background: "bg-slate-800/80",
          border: "border-slate-500",
          text: "text-slate-100",
          icon: "text-slate-300",
        };
    }
  }

  // Fallback
  return {
    background: "bg-slate-800/80",
    border: "border-slate-500",
    text: "text-slate-100",
    icon: "text-slate-300",
  };
}

/**
 * Get display name for an entity type
 */
export function getEntityTypeDisplayName(entityType: NodeEntityType): string {
  if (entityType === "Workspace") {
    return "Workspace";
  }
  if (typeof entityType === "object" && "Child" in entityType) {
    return entityType.Child;
  }
  return "Unknown";
}

/**
 * Create a Child entity type
 */
export function createChildEntityType(name: string): NodeEntityType {
  return { Child: name };
}
