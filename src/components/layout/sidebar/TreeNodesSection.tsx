import { useState, useCallback, useMemo, useEffect } from "react";
import { debugLog } from '@/lib/debug-config';
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { getEntityTypeString } from "@/lib/entity-type-registry";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { TreeNodeItem } from "./TreeNodeItem";
import { buildTreeFromNodes } from "./tree-node-utils";

// Re-export all types for backward compatibility
export type { NodeEntityType, DomainPermissions, DomainNode, TreeNode, TreeSchema, NestingRule, EntityTypeConfig } from "./tree-node-types";
import type { DomainNode, TreeNode } from "./tree-node-types";

export interface TreeNodesSectionProps {
  tree?: TreeNode;
  nodes?: DomainNode[];
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
  onNodeEdit?: (node: DomainNode) => void;
  onNodeDelete?: (node: DomainNode) => void;
  onNodeCreate?: (parentId: string | null) => void;
  onAdminSettings?: (node: DomainNode) => void;
  onSetDefault?: (node: DomainNode) => void;
  title?: string;
  isLoading?: boolean;
  initialExpandedIds?: string[];
  maxHeight?: string;
}

export function TreeNodesSection({
  tree,
  nodes,
  selectedNodeId,
  onNodeSelect,
  onNodeEdit,
  onNodeDelete,
  onNodeCreate,
  onAdminSettings,
  onSetDefault,
  title = "HIERARCHY",
  isLoading = false,
  initialExpandedIds = [],
  maxHeight = "50vh",
}: TreeNodesSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  const treeData = useMemo(() => {
    if (tree) return tree;
    if (nodes) return buildTreeFromNodes(nodes);
    return null;
  }, [tree, nodes]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>(initialExpandedIds);
    if (treeData) {
      initial.add(treeData.node.id);
    }
    return initial;
  });

  // Auto-expand parent nodes when tree data changes
  useEffect(() => {
    if (!treeData) return;
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      let changed = false;
      function autoExpand(tn: TreeNode) {
        if (tn.children.length > 0 && !next.has(tn.node.id)) {
          next.add(tn.node.id);
          changed = true;
        }
        tn.children.forEach(autoExpand);
      }
      autoExpand(treeData);
      return changed ? next : prev;
    });
  }, [treeData]);

  const [nodeToDelete, setNodeToDelete] = useState<DomainNode | null>(null);

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      if (onNodeSelect) {
        onNodeSelect(nodeId);
      } else {
        const params = new URLSearchParams(location.search);
        params.set("nodeId", nodeId);
        params.delete("section");
        navigate(buildWorkspacePath(params));
      }
      setOpenMobile(false);
    },
    [onNodeSelect, location.search, navigate, setOpenMobile]
  );

  const handleNodeDelete = useCallback(
    (node: DomainNode) => {
      if (onNodeDelete) {
        setNodeToDelete(node);
      }
    },
    [onNodeDelete]
  );

  const confirmDelete = useCallback(async () => {
    if (!nodeToDelete || !onNodeDelete) return;
    try {
      await onNodeDelete(nodeToDelete);
    } catch (error) {
      debugLog('TreeNodesSection', 'Error deleting node:', error);
    } finally {
      setNodeToDelete(null);
    }
  }, [nodeToDelete, onNodeDelete]);

  const handleCreateRoot = useCallback(() => {
    if (onNodeCreate) {
      onNodeCreate(null);
    }
  }, [onNodeCreate]);

  // Empty state
  if (!isLoading && !treeData) {
    return (
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-[#9b87f5] font-semibold m-0 px-0">
            {title}
          </SidebarGroupLabel>
          {onNodeCreate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C]"
              onClick={handleCreateRoot}
              data-testid="add-root-node-button"
              aria-label="Add node"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <SidebarGroupContent>
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {isLoading ? "Loading..." : "Your workspace is empty. Click the + button to create your first space."}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-[#9b87f5] font-semibold m-0 px-0">
            {title}
          </SidebarGroupLabel>
          {onNodeCreate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C]"
              onClick={handleCreateRoot}
              data-testid="add-node-button"
              aria-label="Add node"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <SidebarGroupContent>
          <ScrollArea style={{ maxHeight }}>
            <SidebarMenu>
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading...
                </div>
              ) : (
                treeData && (
                  <TreeNodeItem
                    treeNode={treeData}
                    depth={0}
                    selectedNodeId={selectedNodeId}
                    expandedNodes={expandedNodes}
                    onToggleExpand={handleToggleExpand}
                    onNodeSelect={handleNodeSelect}
                    onNodeEdit={onNodeEdit}
                    onNodeDelete={handleNodeDelete}
                    onNodeCreate={onNodeCreate}
                    onAdminSettings={onAdminSettings}
                    onSetDefault={onSetDefault}
                  />
                )
              )}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      <ConfirmDeleteDialog
        open={!!nodeToDelete}
        onOpenChange={() => setNodeToDelete(null)}
        title={`Delete ${nodeToDelete ? getEntityTypeString(nodeToDelete.entity_type) : "Node"}`}
        description={
          <>
            Are you sure you want to delete &quot;{nodeToDelete?.name}&quot;? This
            action cannot be undone.
            {nodeToDelete?.children && nodeToDelete.children.length > 0 && (
              <span className="block mt-2 text-yellow-400">
                Warning: This will also delete {nodeToDelete.children.length}{" "}
                child node(s) and all their content.
              </span>
            )}
          </>
        }
        onConfirm={confirmDelete}
      />
    </>
  );
}

export default TreeNodesSection;
