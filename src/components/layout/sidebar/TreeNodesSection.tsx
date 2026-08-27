import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { debugLog } from '@/lib/debug-config';
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getEntityTypeString } from "@/lib/entity-type-registry";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
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
  onMoveNode?: (node: DomainNode) => void;
  title?: string;
  isLoading?: boolean;
  /**
   * Whether the tree schema has arrived. Creating a node needs it (the allowed
   * child types come from there), so until it does the create button cannot
   * succeed — it can only raise a "schema is still loading" error. Offering a
   * control whose only outcome is an error message is worse than not offering
   * it yet, so the button is disabled and says why.
   */
  canCreate?: boolean;
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
  onMoveNode,
  title = "HIERARCHY",
  isLoading = false,
  canCreate = true,
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

  // Search filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter tree based on search query
  const filteredTreeData = useMemo(() => {
    if (!treeData || !searchQuery.trim()) return treeData;
    const query = searchQuery.toLowerCase();

    function filterNode(tn: TreeNode): TreeNode | null {
      const nameMatches = tn.node.name.toLowerCase().includes(query);
      const filteredChildren = tn.children
        .map(filterNode)
        .filter((c): c is TreeNode => c !== null);

      if (nameMatches || filteredChildren.length > 0) {
        return { ...tn, children: filteredChildren };
      }
      return null;
    }

    return filterNode(treeData);
  }, [treeData, searchQuery]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>(initialExpandedIds);
    if (treeData) {
      initial.add(treeData.node.id);
    }
    return initial;
  });

  // Expand the first level ONCE, when the tree first arrives.
  //
  // This used to expand every node with children, on every change of
  // `treeData` OR `filteredTreeData` identity — and both change constantly.
  // `filteredTreeData` is a fresh object per keystroke and reverts to
  // `treeData` when the box is cleared, and `state.nodes` is re-minted on
  // node:loaded / nodes:loaded / node:deleted / node:content-updated /
  // node:moved. So every collapse the user made was undone by typing one
  // character and deleting it, or by anyone saving a document anywhere in the
  // workspace. A large workspace also opened fully expanded into a 50vh
  // unvirtualised scroll area, with three tab stops per row.
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (hasAutoExpanded.current || !treeData) return;
    hasAutoExpanded.current = true;
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add(treeData.node.id);
      for (const child of treeData.children) {
        if (child.children.length > 0) next.add(child.node.id);
      }
      return next;
    });
  }, [treeData]);

  /**
   * What is actually rendered as expanded.
   *
   * While filtering, every ancestor of a match must be open or the match is
   * invisible — but that is a property of the QUERY, not a decision the user
   * made, so it is derived rather than written into `expandedNodes`. Clearing
   * the box therefore restores exactly the shape the user had.
   */
  const effectiveExpanded = useMemo(() => {
    if (!searchQuery.trim() || !filteredTreeData) return expandedNodes;
    const withMatches = new Set(expandedNodes);
    function openAncestors(tn: TreeNode) {
      if (tn.children.length > 0) {
        withMatches.add(tn.node.id);
        tn.children.forEach(openAncestors);
      }
    }
    openAncestors(filteredTreeData);
    return withMatches;
  }, [expandedNodes, filteredTreeData, searchQuery]);

  const [nodeToDelete, setNodeToDelete] = useState<DomainNode | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setDeleteError(null);
    try {
      await onNodeDelete(nodeToDelete);
      // Closed only on success. The dialog used to close in a `finally`, so a
      // failed delete looked exactly like a successful one — the confirmation
      // disappeared while the node stayed in the tree, and debugLog, a no-op
      // outside dev, said nothing. That is worse than silence: it reports the
      // opposite of what happened.
      setNodeToDelete(null);
    } catch (error) {
      debugLog('TreeNodesSection', 'Error deleting node:', error);
      setDeleteError('Could not delete this node. It may need permissions you do not have.');
    }
  }, [nodeToDelete, onNodeDelete]);

  const handleCreateRoot = useCallback(() => {
    if (onNodeCreate) {
      onNodeCreate(null);
    }
  }, [onNodeCreate]);

  // Empty state
  // Display data uses filtered tree when searching
  const displayTreeData = searchQuery.trim() ? filteredTreeData : treeData;

  if (!isLoading && !treeData) {
    return (
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-primary-accent font-semibold m-0 px-0">
            {title}
          </SidebarGroupLabel>
          {onNodeCreate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground"
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
          <SidebarGroupLabel className="text-primary-accent font-semibold m-0 px-0">
            {title}
          </SidebarGroupLabel>
          {onNodeCreate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground disabled:opacity-40"
              onClick={handleCreateRoot}
              disabled={canCreate === false}
              data-testid="add-node-button"
              aria-label={canCreate === false ? 'Add node (waiting for workspace schema)' : 'Add node'}
              title={canCreate === false ? 'Waiting for the workspace schema to load' : 'Add node'}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Search filter */}
        {treeData && treeData.children.length > 0 && (
          <div className="px-3 mb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-7 text-xs bg-surface border-surface text-foreground/80 placeholder:text-muted-foreground"
                data-testid="tree-search-input"
              />
            </div>
          </div>
        )}
        <SidebarGroupContent>
          <ScrollArea style={{ maxHeight }}>
            <SidebarMenu>
              {isLoading ? (
                <SidebarMenuItem className="px-3 py-2 text-sm text-muted-foreground">
                  Loading...
                </SidebarMenuItem>
              ) : searchQuery.trim() && !displayTreeData ? (
                <SidebarMenuItem className="px-3 py-2 text-sm text-muted-foreground">
                  No matching nodes
                </SidebarMenuItem>
              ) : (
                displayTreeData && (
                  <TreeNodeItem
                    treeNode={displayTreeData}
                    depth={0}
                    selectedNodeId={selectedNodeId}
                    expandedNodes={effectiveExpanded}
                    onToggleExpand={handleToggleExpand}
                    onNodeSelect={handleNodeSelect}
                    onNodeEdit={onNodeEdit}
                    onNodeDelete={handleNodeDelete}
                    onNodeCreate={onNodeCreate}
                    onAdminSettings={onAdminSettings}
                    onSetDefault={onSetDefault}
                    onMoveNode={onMoveNode}
                  />
                )
              )}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      <ConfirmDeleteDialog
        open={!!nodeToDelete}
        onOpenChange={() => {
          setNodeToDelete(null);
          setDeleteError(null);
        }}
        title={`Delete ${nodeToDelete ? getEntityTypeString(nodeToDelete.entity_type) : "Node"}`}
        description={
          <>
            Are you sure you want to delete &quot;{nodeToDelete?.name}&quot;? This
            action cannot be undone.
            {nodeToDelete?.children && nodeToDelete.children.length > 0 && (
              <span className="block mt-2 text-warning">
                Warning: This will also delete {nodeToDelete.children.length}{" "}
                child node(s) and all their content.
              </span>
            )}
            {deleteError && (
              <span role="alert" className="block mt-3 text-destructive-emphasis">
                {deleteError}
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
