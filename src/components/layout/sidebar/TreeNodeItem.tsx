import React from 'react';
import {
  Plus,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Settings,
  Star,
  FolderInput,
} from 'lucide-react';
import { getEntityMetadata, getEntityTypeString } from '@/lib/entity-type-registry';
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { rowClass } from './selected-row';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DomainNode, NodeEntityType, TreeNode } from './tree-node-types';

function getEntityIcon(entityType: NodeEntityType): React.ComponentType<{ className?: string }> {
  return getEntityMetadata(entityType).icon;
}

function getEntityTypeName(entityType: NodeEntityType): string {
  return getEntityTypeString(entityType);
}

export interface TreeNodeItemProps {
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
  onMoveNode?: (node: DomainNode) => void;
}

export function TreeNodeItem({
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
  onMoveNode,
}: TreeNodeItemProps): JSX.Element {
  const { node, children } = treeNode;
  const isSelected: boolean = selectedNodeId === node.id;
  const isExpanded: boolean = expandedNodes.has(node.id);
  const hasChildren: boolean = children.length > 0;
  const Icon: React.ComponentType<{ className?: string; }> = getEntityIcon(node.entity_type);
  const typeName: string = getEntityTypeName(node.entity_type);

  // Cap at 5 levels of indentation to keep deep hierarchies navigable
  const indentPx: number = Math.min(Math.max(0, depth - 1), 5) * 12;

  const handleToggle = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  const handleToggleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onToggleExpand(node.id);
    }
  };

  return (
    <>
      <SidebarMenuItem className="relative group">
        {/*
          The expand toggle is a SIBLING of the row button, not a child.

          It used to sit inside it as a <span role="button" tabIndex={0}>. That
          silenced React's validateDOMNesting warning about a button inside a
          button, but it did not fix the thing that warning was pointing at: a
          focusable, role="button" descendant of a button is still nested
          interactive content, which is what axe flags as `nested-interactive`
          and what leaves keyboard and screen-reader behaviour up to the
          individual client. Positioning it absolutely, the way the row's ⋯ menu
          already is, keeps the layout identical and makes the structure valid —
          so it is now a real <button> that carries its own expanded state.
        */}
        {hasChildren && (
          <button
            type="button"
            onClick={handleToggle}
            onKeyDown={handleToggleKeyDown}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isExpanded}
            className="absolute top-1/2 -translate-y-1/2 z-10 p-0.5 hover:bg-black/10 rounded flex-shrink-0 cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring"
            style={{ left: `${8 + indentPx}px` }}
            data-testid={`tree-node-toggle-${node.id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}

        <SidebarMenuButton
          // text-foreground, not text-primary-foreground: the latter is WHITE, the text colour that belongs on a primary FILL.
          // These rows sit on the page background, so in light mode it was white-on-white — the whole tree was invisible.
          // Dark mode hid it, because white happened to be right there.
          className={`${rowClass(isSelected)} w-full pr-8`}
          // The toggle now sits over this padding rather than inside the flow,
          // so the gap is reserved whether or not the node has children — which
          // is what the old `<span className="w-5" />` spacer was doing anyway.
          style={{ paddingLeft: `${8 + indentPx + 20}px` }}
          isActive={isSelected}
          onClick={() => onNodeSelect(node.id)}
          data-testid={`tree-node-${node.id}`}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="truncate flex items-center gap-1.5" title={node.name}>
            {node.name}
            {node.is_default && (
              <Star
                className="h-3 w-3 text-warning-emphasis fill-warning flex-shrink-0"
                aria-label={`Default ${typeName.toLowerCase()}`}
              />
            )}
          </span>
          {hasChildren && (
            <span className="ml-auto text-xs text-muted-foreground pr-6">
              {children.length}
            </span>
          )}
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 tap-target h-6 w-6 reveal-on-hover text-muted-foreground hover:text-foreground hover:bg-card"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Actions for ${node.name}`}
              data-testid={`tree-node-menu-${node.id}`}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
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
            {onMoveNode && (
              <DropdownMenuItem
                onClick={() => onMoveNode(node)}
                data-testid={`move-node-${node.id}`}
              >
                <FolderInput className="h-4 w-4 mr-2" />
                Move…
              </DropdownMenuItem>
            )}
            {onSetDefault && !node.is_default && (
              <DropdownMenuItem
                onClick={() => onSetDefault(node)}
                className="text-warning-emphasis hover:text-warning-emphasis"
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
                  className="text-destructive-emphasis hover:text-destructive-emphasis hover:bg-destructive/15"
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
            onMoveNode={onMoveNode}
          />
        ))}
    </>
  );
}
