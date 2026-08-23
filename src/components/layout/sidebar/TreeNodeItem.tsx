import React from 'react';
import {
  Plus,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Settings,
  Star,
} from 'lucide-react';
import { getEntityMetadata, getEntityTypeString } from '@/lib/entity-type-registry';
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
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
}: TreeNodeItemProps) {
  const { node, children } = treeNode;
  const isSelected = selectedNodeId === node.id;
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = children.length > 0;
  const Icon = getEntityIcon(node.entity_type);
  const typeName = getEntityTypeName(node.entity_type);

  // Cap at 5 levels of indentation to keep deep hierarchies navigable
  const indentPx = Math.min(Math.max(0, depth - 1), 5) * 12;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.id);
  };

  const handleToggleKeyDown = (e: React.KeyboardEvent) => {
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
            className="absolute top-1/2 -translate-y-1/2 z-10 p-0.5 hover:bg-black/10 rounded flex-shrink-0 cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-purple-400"
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
          className={`text-primary-foreground hover:bg-purple-500/15 hover:text-primary-foreground transition-colors w-full pr-8 ${
            isSelected ? "bg-purple-500/20 text-purple-200" : ""
          }`}
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
                className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0"
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
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-card"
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
