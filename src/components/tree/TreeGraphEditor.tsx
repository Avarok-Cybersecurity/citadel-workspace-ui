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
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TreeGraphContextMenu } from "./TreeGraphContextMenu";
import {
  treeNodeToFlowElements,
  applyDagreLayout,
  wouldCreateCycle,
  findNodeInTree,
} from "./tree-graph-utils";
import { findReparentTarget } from "./tree-reparent";
import type { TreeGraphEditorProps, ContextMenuState } from "./tree-graph-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { debugLog } from '@/lib/debug-config';
import { nodeTypes, getMinimapNodeColor } from "./tree-graph-node-types";

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
        debugLog('TreeGraphEditor', 'Cannot move node: would create a cycle');
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

  // Handle node drag end for potential reparenting.
  //
  // Decision logic (proximity + size-aware threshold) lives in the pure
  // `findReparentTarget` helper so it can be unit-tested. This component
  // only orchestrates the side effects: cycle check and async move call.
  const handleNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      if (!canEdit || !onNodeMove) return;
      const targetId = findReparentTarget(nodes, node);
      if (targetId && !wouldCreateCycle(treeStructure, node.id, targetId)) {
        await onNodeMove(node.id, targetId);
      }
    },
    [canEdit, onNodeMove, nodes, treeStructure]
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
    // Trigger selection, which opens the edit modal in the parent
    onNodeSelect?.(contextMenu.nodeId);
    handleContextMenuClose();
  }, [contextMenu.nodeId, onNodeSelect, handleContextMenuClose]);

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
