/**
 * TreeGraphEditor Component
 *
 * Interactive React Flow-based visualization of the workspace hierarchy tree.
 * Features: drag-drop nodes, automatic layout, context menu operations,
 * zoom/pan controls, and minimap for large trees.
 */

import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TreeGraphNode } from "./TreeGraphNode";
import { TreeGraphContextMenu } from "./TreeGraphContextMenu";
import {
  treeNodeToFlowElements,
  applyDagreLayout,
  wouldCreateCycle,
  findNodeInTree,
} from "./tree-graph-utils";
import type { TreeGraphEditorProps, ContextMenuState, TreeFlowNode } from "./tree-graph-types";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { debugLog } from '@/lib/debug-config';
import { isVariant } from 'citadel-workspace-client-ts';

/**
 * Node types registry for React Flow.
 * Type assertion needed as TreeGraphNode has more specific types than NodeTypes expects.
 */
const nodeTypes = {
  treeNode: TreeGraphNode,
} as const;

/**
 * MiniMap node color function
 */
function getMinimapNodeColor(node: Node): string {
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

export const TreeGraphEditor: React.FC<TreeGraphEditorProps> = ({
  treeStructure,
  onNodeSelect,
  onNodeCreate,
  onNodeUpdate,
  onNodeDelete,
  onNodeMove,
  canEdit = false,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    nodeId: null,
    x: 0,
    y: 0,
    isOpen: false,
  });
  const [moveSourceNodeId, setMoveSourceNodeId] = useState<string | null>(null);

  // Handle move completion - defined before handleNodeSelect for proper hoisting
  const handleMoveComplete = useCallback(
    async (targetNodeId: string) => {
      if (!moveSourceNodeId || !onNodeMove) {
        setMoveSourceNodeId(null);
        return;
      }

      // Validate move does not create a cycle
      if (wouldCreateCycle(treeStructure, moveSourceNodeId, targetNodeId)) {
        console.error("Cannot move node: would create a cycle");
        setMoveSourceNodeId(null);
        return;
      }

      await onNodeMove(moveSourceNodeId, targetNodeId);
      setMoveSourceNodeId(null);
    },
    [moveSourceNodeId, onNodeMove, treeStructure]
  );

  // Handle node selection
  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      if (moveSourceNodeId) {
        // If in move mode, attempt to move the node
        void handleMoveComplete(nodeId);
        return;
      }

      setSelectedNodeId(nodeId);
      onNodeSelect?.(nodeId);
    },
    [moveSourceNodeId, onNodeSelect, handleMoveComplete]
  );

  // Handle context menu open
  const handleContextMenu = useCallback((nodeId: string, event: React.MouseEvent) => {
    setContextMenu({
      nodeId,
      x: event.clientX,
      y: event.clientY,
      isOpen: true,
    });
  }, []);

  // Convert tree structure to flow elements
  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes, edges } = treeNodeToFlowElements(treeStructure, {
      selectedNodeId,
      canEdit,
      onSelect: handleNodeSelect,
      onContextMenu: handleContextMenu,
    });

    const layoutedNodes = applyDagreLayout(nodes, edges);

    return { initialNodes: layoutedNodes, initialEdges: edges };
  }, [treeStructure, selectedNodeId, canEdit, handleNodeSelect, handleContextMenu]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when tree structure or selection changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Handle node drag end for potential reparenting
  const handleNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      if (!canEdit || !onNodeMove) return;
      // @human-review: Future enhancement - detect drag-over parent and trigger move
    },
    [canEdit, onNodeMove]
  );

  // Context menu handlers
  const handleContextMenuClose = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false, nodeId: null }));
  }, []);

  const handleCreateChild = useCallback(
    async (entityType: string) => {
      if (!contextMenu.nodeId || !onNodeCreate) return;
      await onNodeCreate(contextMenu.nodeId, entityType);
      handleContextMenuClose();
    },
    [contextMenu.nodeId, onNodeCreate, handleContextMenuClose]
  );

  const handleEdit = useCallback(() => {
    if (!contextMenu.nodeId) return;
    // @human-review: Trigger edit modal - integrate with NodeManagementModal
    debugLog('TreeGraphEditor', "Edit node:", contextMenu.nodeId);
    handleContextMenuClose();
  }, [contextMenu.nodeId, handleContextMenuClose]);

  const handleDelete = useCallback(
    async (cascade: boolean) => {
      if (!contextMenu.nodeId || !onNodeDelete) return;
      await onNodeDelete(contextMenu.nodeId, cascade);
      handleContextMenuClose();
    },
    [contextMenu.nodeId, onNodeDelete, handleContextMenuClose]
  );

  const handleMoveStart = useCallback(() => {
    if (!contextMenu.nodeId) return;
    setMoveSourceNodeId(contextMenu.nodeId);
    handleContextMenuClose();
  }, [contextMenu.nodeId, handleContextMenuClose]);

  const handleMoveCancel = useCallback(() => {
    setMoveSourceNodeId(null);
  }, []);

  // Check if context menu node is workspace and get its allowed child types
  const contextMenuNode = useMemo(() => {
    if (!contextMenu.nodeId) return null;
    return findNodeInTree(treeStructure, contextMenu.nodeId);
  }, [contextMenu.nodeId, treeStructure]);

  const isWorkspaceNode = contextMenuNode?.node.entity_type === "Workspace";
  const allowedChildTypes = contextMenuNode?.node.allowed_child_types ?? undefined;

  return (
    <div className="relative w-full h-full min-h-[500px] bg-slate-900 rounded-lg border border-slate-700">
      {/* Move mode indicator */}
      {moveSourceNodeId && (
        <Panel position="top-center" className="z-50">
          <div className="bg-yellow-900/90 text-yellow-100 px-4 py-2 rounded-lg border border-yellow-600 flex items-center gap-3">
            <span>Click a node to move to, or</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleMoveCancel}
              className="bg-transparent border-yellow-600 text-yellow-100 hover:bg-yellow-800"
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      <TreeGraphContextMenu
        menuState={contextMenu}
        canEdit={canEdit}
        isWorkspaceNode={isWorkspaceNode}
        allowedChildTypes={allowedChildTypes}
        onClose={handleContextMenuClose}
        onCreateChild={handleCreateChild}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onMove={handleMoveStart}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          className={cn(
            moveSourceNodeId && "cursor-crosshair"
          )}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#334155"
          />
          <Controls
            className="bg-slate-800 border-slate-600 [&>button]:bg-slate-700 [&>button]:border-slate-600 [&>button]:text-slate-100 [&>button:hover]:bg-slate-600"
          />
          <MiniMap
            nodeColor={getMinimapNodeColor}
            maskColor="rgba(15, 23, 42, 0.8)"
            className="bg-slate-800 border-slate-600"
          />
        </ReactFlow>
      </TreeGraphContextMenu>
    </div>
  );
};

export default TreeGraphEditor;
