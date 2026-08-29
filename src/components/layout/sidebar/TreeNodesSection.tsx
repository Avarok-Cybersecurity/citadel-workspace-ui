import { useState, useCallback, useMemo } from "react";
import { matchesSearch } from '@/lib/fold-for-search';
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
import { useTreeExpansion } from './use-tree-expansion';
import type { NavigateFunction } from 'react-router';

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
}: TreeNodesSectionProps): JSX.Element {
  const location: ReturnType<typeof useLocation> = useLocation();
  const navigate: NavigateFunction = useNavigate();
  const { setOpenMobile } = useSidebar();

  const treeData: TreeNode | null = useMemo((): TreeNode | null => {
    if (tree) return tree;
    if (nodes) return buildTreeFromNodes(nodes);
    return null;
  }, [tree, nodes]);

  // Search filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter tree based on search query
  const filteredTreeData: TreeNode | null = useMemo((): TreeNode | null => {
    if (!treeData || !searchQuery.trim()) return treeData;
    // Folded, not merely lower-cased: "jose" has to find "José". The sort
    // beside this already uses localeCompare, so without folding a list could
    // show two neighbours one of which the obvious query could not reach.
    const query: string = searchQuery;

    function filterNode(tn: TreeNode): TreeNode | null {
      const nameMatches: boolean = matchesSearch(tn.node.name, query);
      const filteredChildren: TreeNode[] = tn.children
        .map(filterNode)
        .filter((c): c is TreeNode => c !== null);

      if (nameMatches || filteredChildren.length > 0) {
        return { ...tn, children: filteredChildren };
      }
      return null;
    }

    return filterNode(treeData);
  }, [treeData, searchQuery]);

  const { effectiveExpanded, toggleExpand } = useTreeExpansion({
    treeData,
    filteredTreeData,
    searchQuery,
    initialExpandedIds,
  });

  const [nodeToDelete, setNodeToDelete] = useState<DomainNode | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleNodeSelect: (nodeId: string) => void = useCallback(
    (nodeId: string) => {
      if (onNodeSelect) {
        onNodeSelect(nodeId);
      } else {
        const params: URLSearchParams = new URLSearchParams(location.search);
        params.set("nodeId", nodeId);
        params.delete("section");
        navigate(buildWorkspacePath(params));
      }
      setOpenMobile(false);
    },
    [onNodeSelect, location.search, navigate, setOpenMobile]
  );

  const handleNodeDelete: (node: DomainNode) => void = useCallback(
    (node: DomainNode) => {
      if (onNodeDelete) {
        setNodeToDelete(node);
      }
    },
    [onNodeDelete]
  );

  const confirmDelete: () => Promise<void> = useCallback(async (): Promise<void> => {
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

  const handleCreateRoot: () => void = useCallback((): void => {
    if (onNodeCreate) {
      onNodeCreate(null);
    }
  }, [onNodeCreate]);

  // Empty state
  // Display data uses filtered tree when searching
  const displayTreeData: TreeNode | null = searchQuery.trim() ? filteredTreeData : treeData;

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
              className="tap-target h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground"
              onClick={handleCreateRoot}
              data-testid="add-root-node-button"
              aria-label="Add to this workspace"
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
              className="tap-target h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground disabled:opacity-40"
              onClick={handleCreateRoot}
              disabled={canCreate === false}
              data-testid="add-node-button"
              aria-label={canCreate === false ? 'Add to this workspace (still loading)' : 'Add to this workspace'}
              title={canCreate === false ? 'Waiting for the workspace to finish loading' : 'Add to this workspace'}
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
                placeholder="Filter..."
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
                    onToggleExpand={toggleExpand}
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
              <span className="block mt-2 text-warning-emphasis">
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
