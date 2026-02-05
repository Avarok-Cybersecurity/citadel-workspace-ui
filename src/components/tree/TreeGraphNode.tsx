/**
 * TreeGraphNode Component
 *
 * Custom React Flow node component for displaying workspace hierarchy nodes.
 * Displays name, type, description preview with color-coding by entity type.
 */

import React, { memo, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Building2,
  Home,
  DoorOpen,
  Users,
  FolderKanban,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeNodeData, NodeEntityType } from "./tree-graph-types";
import { getNodeColorConfig, getEntityTypeDisplayName } from "./tree-graph-types";

/**
 * Props passed to the custom node component by React Flow
 */
interface TreeGraphNodeProps {
  id: string;
  data: TreeNodeData;
}

/**
 * Get the appropriate icon for an entity type
 */
function getEntityTypeIcon(entityType: NodeEntityType): React.ReactNode {
  if (entityType === "Workspace") {
    return <Building2 className="h-4 w-4" />;
  }

  if (typeof entityType === "object" && "Child" in entityType) {
    const childType = entityType.Child.toLowerCase();

    switch (childType) {
      case "office":
        return <Home className="h-4 w-4" />;
      case "room":
        return <DoorOpen className="h-4 w-4" />;
      case "department":
        return <Users className="h-4 w-4" />;
      case "team":
        return <Users className="h-4 w-4" />;
      case "project":
        return <FolderKanban className="h-4 w-4" />;
      default:
        return <Layers className="h-4 w-4" />;
    }
  }

  return <Layers className="h-4 w-4" />;
}

/**
 * Custom node component for the tree graph
 */
function TreeGraphNodeComponent({ data, id }: TreeGraphNodeProps) {
  const {
    label,
    description,
    entityType,
    depth,
    childCount,
    isSelected,
    canEdit,
    onSelect,
    onContextMenu,
  } = data;

  const colorConfig = getNodeColorConfig(entityType);
  const displayName = getEntityTypeDisplayName(entityType);
  const icon = getEntityTypeIcon(entityType);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onSelect(id);
    },
    [id, onSelect]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onContextMenu(id, event);
    },
    [id, onContextMenu]
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 shadow-lg transition-all duration-200",
        "min-w-[200px] max-w-[280px]",
        colorConfig.background,
        colorConfig.border,
        isSelected && "ring-2 ring-white ring-offset-2 ring-offset-transparent",
        canEdit && "cursor-grab active:cursor-grabbing",
        !canEdit && "cursor-pointer"
      )}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Top handle for incoming edges (except for root) */}
      {depth > 0 && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-indigo-500 !border-indigo-300 !w-3 !h-3"
        />
      )}

      {/* Node content */}
      <div className="p-3">
        {/* Header with type badge and icon */}
        <div className="flex items-center justify-between mb-2">
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
              colorConfig.background,
              colorConfig.text
            )}
          >
            <span className={colorConfig.icon}>{icon}</span>
            <span>{displayName}</span>
          </div>
          {childCount > 0 && (
            <span className="text-xs text-slate-400">
              {childCount} {childCount === 1 ? "child" : "children"}
            </span>
          )}
        </div>

        {/* Node name */}
        <h3
          className={cn(
            "text-sm font-semibold truncate",
            colorConfig.text
          )}
          title={label}
        >
          {label}
        </h3>

        {/* Description preview */}
        {description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
            {description}
          </p>
        )}
      </div>

      {/* Bottom handle for outgoing edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !border-indigo-300 !w-3 !h-3"
      />

      {/* Edit indicator */}
      {canEdit && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-green-300" />
      )}
    </div>
  );
}

export const TreeGraphNode = memo(TreeGraphNodeComponent);
