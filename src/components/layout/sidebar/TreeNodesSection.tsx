import { useState, useCallback, useMemo } from "react";
import { searchMatcher } from '@/lib/fold-for-search';
import { debugLog } from '@/lib/debug-config';
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
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
import { AddNodeButton } from "./AddNodeButton";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { TreeNodeItem } from "./TreeNodeItem";
import { buildTreeFromNodes, descendantCount } from "./tree-node-utils";

// Re-export all types for backward compatibility
export type { NodeEntityType, DomainPermissions, DomainNode, TreeNode, TreeSchema, NestingRule, EntityTypeConfig } from "./tree-node-types";
import type { DomainNode, TreeNode } from "./tree-node-types";
import { useTreeExpansion } from './use-tree-expansion';
import type { NavigateFunction } from 'react-router';

export interface TreeNodesSectionProps {
  tree?: TreeNode;
  nodes?: DomainNode[];
  /** The workspace's name, for the parent shown above several top-level spaces. */
  workspaceName: string;
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
   * The node list's deadline expired without an answer.
   *
   * "Your workspace is empty. Click the + button to create your first space"
   * is advice, and following it after a failed load creates a duplicate space
   * in a workspace whose contents merely did not arrive.
   */
  unavailable?: boolean;
  /**
   * Null when creating can succeed; otherwise why it cannot (the schema has not
   * arrived, or the server would refuse this person). A control whose only
   * outcome is an error is disabled and says why; see AddNodeButton.
   */
  createBlockedReason?: string | null;
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
  unavailable = false,
  createBlockedReason = null,
  initialExpandedIds = [],
  maxHeight = "50vh",
  workspaceName,
}: TreeNodesSectionProps): JSX.Element {
  const location: ReturnType<typeof useLocation> = useLocation();
  const navigate: NavigateFunction = useNavigate();
  const { setOpenMobile } = useSidebar();

  const treeData: TreeNode | null = useMemo((): TreeNode | null => {
    if (tree) return tree;
    if (nodes) return buildTreeFromNodes(nodes, workspaceName);
    return null;
  }, [tree, nodes, workspaceName]);

  // Search filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter tree based on search query
  const filteredTreeData: TreeNode | null = useMemo((): TreeNode | null => {
    if (!treeData || !searchQuery.trim()) return treeData;
    // Folded, and folded ONCE — see fold-for-search.ts. `filterNode` recurses
    // over the whole tree, so a per-node fold is a per-node normalisation.
    const matches: (haystack: string) => boolean = searchMatcher(searchQuery);

    function filterNode(tn: TreeNode): TreeNode | null {
      const nameMatches: boolean = matches(tn.node.name);
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
    selectedNodeId,
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
      <SidebarGroup data-testid="hierarchy-section" className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-primary-accent font-semibold m-0 px-0">
            {title}
          </SidebarGroupLabel>
          {onNodeCreate && <AddNodeButton onClick={handleCreateRoot} blockedReason={createBlockedReason} testId="add-root-node-button" />}
        </div>
        <SidebarGroupContent>
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {isLoading ? (
              "Loading..."
            ) : unavailable ? (
              <span data-testid="tree-unavailable">
                Your spaces could not be loaded. Nothing has been deleted — reload, or open
                another workspace and come back, to try again.
              </span>
            ) : (
              <span data-testid="tree-empty">
                {createBlockedReason === null
                  ? 'Your workspace is empty. Click the + button to create your first space.'
                  : 'No spaces yet. An administrator adds the first one.'}
              </span>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup data-testid="hierarchy-section" className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-primary-accent font-semibold m-0 px-0">
            {title}
          </SidebarGroupLabel>
          {onNodeCreate && <AddNodeButton onClick={handleCreateRoot} blockedReason={createBlockedReason} testId="add-node-button" />}
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
                    // "Add Child" is the same request; not offered when it would be refused.
                    onNodeCreate={createBlockedReason === null ? onNodeCreate : undefined}
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
            {nodeToDelete && nodes && descendantCount(nodes, nodeToDelete.id) > 0 && (
              <span className="block mt-2 text-warning-emphasis">
                Warning: This will also delete {descendantCount(nodes, nodeToDelete.id)}{" "}
                space(s) inside it and all their content.
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
