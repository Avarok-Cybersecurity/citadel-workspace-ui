import { useState, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  Briefcase,
  MessageSquare,
  Folder,
  Plus,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Settings,
  Star,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { useToast } from "@/hooks/use-toast";
import { buildWorkspacePath } from "@/lib/workspace-navigation";

// =============================================================================
// TREE HIERARCHY TYPES
// These types mirror the definitions in citadel-workspace-client-ts/src/types/workspace-types.ts
// Once the client package is rebuilt with tree types, these can be imported directly.
// =============================================================================

/**
 * Entity type for nodes in the workspace hierarchy tree.
 * Workspace is special (root only), all other nodes are Child types.
 */
export type NodeEntityType = "Workspace" | { Child: string };

/**
 * Default permissions for a domain
 */
export interface DomainPermissions {
  view_content: boolean;
  read_messages: boolean;
  download_files: boolean;
  edit_content: boolean;
  edit_mdx: boolean;
  send_messages: boolean;
  upload_files: boolean;
  create_room: boolean;
  delete_room: boolean;
  update_room: boolean;
  add_room: boolean;
  edit_room_config: boolean;
  update_room_settings: boolean;
  manage_room_members: boolean;
  create_office: boolean;
  delete_office: boolean;
  update_office: boolean;
  add_office: boolean;
  edit_office_config: boolean;
  update_office_settings: boolean;
  manage_office_members: boolean;
  create_workspace: boolean;
  update_workspace: boolean;
  delete_workspace: boolean;
  edit_workspace_config: boolean;
  add_users: boolean;
  remove_users: boolean;
  ban_user: boolean;
  manage_domains: boolean;
  configure_system: boolean;
  edit_tree_structure: boolean;
  manage_node_types: boolean;
}

/**
 * A unified node in the workspace hierarchy tree.
 * Replaces the separate Workspace/Office/Room structs with a single generalized type.
 */
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
  default_permissions: DomainPermissions;
  metadata: number[];
  allowed_child_types: string[] | null;
  is_default: boolean;
  created_at: bigint;
  updated_at: bigint;
}

/**
 * Recursive tree structure for representing the full hierarchy
 */
export interface TreeNode {
  node: DomainNode;
  children: TreeNode[];
}

// Icon mapping for entity types
const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Workspace: Building2,
  Office: Briefcase,
  Room: MessageSquare,
};

function getEntityIcon(entityType: NodeEntityType): React.ComponentType<{ className?: string }> {
  if (entityType === "Workspace") {
    return ENTITY_ICONS.Workspace;
  }
  if (typeof entityType === "object" && "Child" in entityType) {
    return ENTITY_ICONS[entityType.Child] ?? Folder;
  }
  return Folder;
}

function getEntityTypeName(entityType: NodeEntityType): string {
  if (entityType === "Workspace") {
    return "Workspace";
  }
  if (typeof entityType === "object" && "Child" in entityType) {
    return entityType.Child;
  }
  return "Node";
}

// Props for individual tree node rendering
interface TreeNodeItemProps {
  treeNode: TreeNode;
  depth: number;
  selectedNodeId?: string;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  onNodeSelect: (nodeId: string) => void;
  onNodeEdit?: (node: DomainNode) => void;
  onNodeDelete?: (node: DomainNode) => void;
  onNodeCreate?: (parentId: string) => void;
  onAdminSettings?: (node: DomainNode) => void;
  onSetDefault?: (node: DomainNode) => void;
}

function TreeNodeItem({
  treeNode,
  depth,
  selectedNodeId,
  expandedNodes,
  onToggleExpand,
  onNodeSelect,
  onNodeEdit,
  onNodeDelete,
  onNodeCreate,
  onAdminSettings,
  onSetDefault,
}: TreeNodeItemProps) {
  const { node, children } = treeNode;
  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = children.length > 0;
  const Icon = getEntityIcon(node.entity_type);
  const typeName = getEntityTypeName(node.entity_type);

  // Calculate indent based on depth (skip workspace root at depth 0)
  const indentPx = Math.max(0, depth - 1) * 16;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  return (
    <>
      <SidebarMenuItem className="relative group">
        <SidebarMenuButton
          className={`text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors w-full pr-8 ${
            isSelected ? "bg-[#E5DEFF] text-[#343A5C]" : ""
          }`}
          style={{ paddingLeft: `${8 + indentPx}px` }}
          isActive={isSelected}
          onClick={() => onNodeSelect(node.id)}
          data-testid={`tree-node-${node.id}`}
        >
          {hasChildren && (
            <button
              onClick={handleToggle}
              className="p-0.5 hover:bg-black/10 rounded mr-1 flex-shrink-0"
              aria-label={isExpanded ? "Collapse" : "Expand"}
              data-testid={`tree-node-toggle-${node.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <span className="w-5" />}
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="truncate flex items-center gap-1.5">
            {node.name}
            {node.is_default && (
              <Star
                className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0"
                aria-label={`Default ${typeName.toLowerCase()}`}
              />
            )}
          </span>
          {hasChildren && (
            <span className="ml-auto text-xs text-gray-400 pr-6">
              {children.length}
            </span>
          )}
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-[#444A6C]"
              onClick={(e) => e.stopPropagation()}
              data-testid={`tree-node-menu-${node.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            {onNodeEdit && (
              <DropdownMenuItem
                onClick={() => onNodeEdit(node)}
                data-testid={`edit-node-${node.id}`}
              >
                Edit {typeName}
              </DropdownMenuItem>
            )}
            {onAdminSettings && (
              <DropdownMenuItem
                onClick={() => onAdminSettings(node)}
                data-testid={`admin-settings-node-${node.id}`}
              >
                <Settings className="h-4 w-4 mr-2" />
                Admin Settings
              </DropdownMenuItem>
            )}
            {onNodeCreate && node.allowed_child_types && node.allowed_child_types.length > 0 && (
              <DropdownMenuItem
                onClick={() => onNodeCreate(node.id)}
                data-testid={`create-child-${node.id}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Child
              </DropdownMenuItem>
            )}
            {onSetDefault && !node.is_default && (
              <DropdownMenuItem
                onClick={() => onSetDefault(node)}
                className="text-yellow-400 hover:text-yellow-300"
                data-testid={`set-default-node-${node.id}`}
              >
                <Star className="h-4 w-4 mr-2" />
                Set as Default
              </DropdownMenuItem>
            )}
            {onNodeDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onNodeDelete(node)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                  data-testid={`delete-node-${node.id}`}
                >
                  Delete {typeName}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {/* Render children if expanded */}
      {isExpanded &&
        children.map((childNode) => (
          <TreeNodeItem
            key={childNode.node.id}
            treeNode={childNode}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            expandedNodes={expandedNodes}
            onToggleExpand={onToggleExpand}
            onNodeSelect={onNodeSelect}
            onNodeEdit={onNodeEdit}
            onNodeDelete={onNodeDelete}
            onNodeCreate={onNodeCreate}
            onAdminSettings={onAdminSettings}
            onSetDefault={onSetDefault}
          />
        ))}
    </>
  );
}

// Main component props
export interface TreeNodesSectionProps {
  /** The tree structure to render */
  tree?: TreeNode;
  /** Flat list of nodes (alternative to tree) */
  nodes?: DomainNode[];
  /** Currently selected node ID */
  selectedNodeId?: string;
  /** Callback when a node is selected */
  onNodeSelect?: (nodeId: string) => void;
  /** Callback when a node should be edited */
  onNodeEdit?: (node: DomainNode) => void;
  /** Callback when a node should be deleted */
  onNodeDelete?: (node: DomainNode) => void;
  /** Callback when a child node should be created under a parent */
  onNodeCreate?: (parentId: string | null) => void;
  /** Callback for admin settings on a node */
  onAdminSettings?: (node: DomainNode) => void;
  /** Callback to set a node as default */
  onSetDefault?: (node: DomainNode) => void;
  /** Section title */
  title?: string;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Initially expanded node IDs */
  initialExpandedIds?: string[];
  /** Maximum height for scroll area */
  maxHeight?: string;
}

/**
 * Builds a tree structure from a flat list of DomainNodes.
 * Groups nodes by parent_id and creates a recursive TreeNode structure.
 */
function buildTreeFromNodes(nodes: DomainNode[]): TreeNode | null {
  if (nodes.length === 0) return null;

  // Build lookup maps
  const nodeMap = new Map<string, DomainNode>();
  const childrenMap = new Map<string | null, DomainNode[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    const parentId = node.parent_id;
    const siblings = childrenMap.get(parentId) ?? [];
    siblings.push(node);
    childrenMap.set(parentId, siblings);
  }

  // Find root node (workspace - no parent)
  const roots = childrenMap.get(null) ?? [];
  if (roots.length === 0) return null;

  // Sort roots by name (should only be one workspace)
  roots.sort((a, b) => a.name.localeCompare(b.name));

  // Recursive function to build tree
  function buildNode(node: DomainNode): TreeNode {
    const nodeChildren = childrenMap.get(node.id) ?? [];
    // Sort children by name
    nodeChildren.sort((a, b) => a.name.localeCompare(b.name));

    return {
      node,
      children: nodeChildren.map(buildNode),
    };
  }

  // Return first root (workspace)
  return buildNode(roots[0]);
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
  const { toast } = useToast();

  // Build tree from flat nodes if tree not provided
  const treeData = useMemo(() => {
    if (tree) return tree;
    if (nodes) return buildTreeFromNodes(nodes);
    return null;
  }, [tree, nodes]);

  // Track expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>(initialExpandedIds);
    // Auto-expand root node
    if (treeData) {
      initial.add(treeData.node.id);
    }
    return initial;
  });

  // State for delete confirmation
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
        // Default navigation behavior
        const params = new URLSearchParams(location.search);
        params.set("nodeId", nodeId);
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
      toast({
        title: `${getEntityTypeName(nodeToDelete.entity_type)} Deleted`,
        description: `${nodeToDelete.name} has been deleted successfully`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });
    } catch (error) {
      console.error("Error deleting node:", error);
      toast({
        title: "Error",
        description: `Failed to delete ${getEntityTypeName(nodeToDelete.entity_type).toLowerCase()}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setNodeToDelete(null);
    }
  }, [nodeToDelete, onNodeDelete, toast]);

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
            {isLoading ? "Loading..." : "No nodes yet. Create one!"}
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={!!nodeToDelete}
        onOpenChange={() => setNodeToDelete(null)}
        title={`Delete ${nodeToDelete ? getEntityTypeName(nodeToDelete.entity_type) : "Node"}`}
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
