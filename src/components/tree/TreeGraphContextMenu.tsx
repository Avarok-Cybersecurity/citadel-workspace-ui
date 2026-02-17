/**
 * TreeGraphContextMenu Component
 *
 * Context menu for tree node operations: create, edit, delete, move.
 * Permission-aware: disables editing operations for non-admins.
 * Child type options derived from entity-type-registry (SSOT).
 */

import React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Plus,
  Pencil,
  Trash2,
  Move,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getEntityMetadata } from "@/lib/entity-type-registry";
import type { ContextMenuState } from "./tree-graph-types";

interface TreeGraphContextMenuProps {
  menuState: ContextMenuState;
  canEdit: boolean;
  isWorkspaceNode: boolean;
  /** Allowed child types from the node's schema or tree schema rules */
  allowedChildTypes?: string[];
  onClose: () => void;
  onCreateChild: (entityType: string) => void;
  onEdit: () => void;
  onDelete: (cascade: boolean) => void;
  onMove: () => void;
  children: React.ReactNode;
}

export const TreeGraphContextMenu: React.FC<TreeGraphContextMenuProps> = ({
  menuState,
  canEdit,
  isWorkspaceNode,
  allowedChildTypes,
  onClose,
  onCreateChild,
  onEdit,
  onDelete,
  onMove,
  children,
}) => {
  // Derive child type options from entity-type-registry
  const childTypeOptions = (allowedChildTypes ?? []).map(typeName => {
    const metadata = getEntityMetadata(typeName);
    return { name: typeName, icon: metadata.icon };
  });

  return (
    <ContextMenu onOpenChange={(open) => !open && onClose()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      {menuState.isOpen && (
        <ContextMenuContent
          className="w-56 bg-slate-800 border-slate-600"
          style={{
            position: "fixed",
            left: menuState.x,
            top: menuState.y,
          }}
        >
          {/* Create child node */}
          {canEdit && childTypeOptions.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="flex items-center gap-2 text-slate-100 hover:bg-slate-700 focus:bg-slate-700">
                <Plus className="h-4 w-4 text-green-400" />
                <span>Create Child</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-slate-800 border-slate-600">
                {childTypeOptions.map(({ name, icon: Icon }) => (
                  <ContextMenuItem
                    key={name}
                    className="flex items-center gap-2 text-slate-100 hover:bg-slate-700 focus:bg-slate-700"
                    onClick={() => onCreateChild(name)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{name}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

          {/* Edit node */}
          <ContextMenuItem
            className={cn(
              "flex items-center gap-2 text-slate-100",
              canEdit
                ? "hover:bg-slate-700 focus:bg-slate-700"
                : "opacity-50 cursor-not-allowed"
            )}
            disabled={!canEdit}
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4 text-blue-400" />
            <span>Edit Node</span>
          </ContextMenuItem>

          {/* Move node (only for non-workspace nodes) */}
          {!isWorkspaceNode && (
            <ContextMenuItem
              className={cn(
                "flex items-center gap-2 text-slate-100",
                canEdit
                  ? "hover:bg-slate-700 focus:bg-slate-700"
                  : "opacity-50 cursor-not-allowed"
              )}
              disabled={!canEdit}
              onClick={onMove}
            >
              <Move className="h-4 w-4 text-yellow-400" />
              <span>Move Node</span>
            </ContextMenuItem>
          )}

          <ContextMenuSeparator className="bg-slate-600" />

          {/* Delete node (only for non-workspace nodes) */}
          {!isWorkspaceNode && (
            <ContextMenuSub>
              <ContextMenuSubTrigger
                className={cn(
                  "flex items-center gap-2 text-red-400",
                  canEdit
                    ? "hover:bg-slate-700 focus:bg-slate-700"
                    : "opacity-50 cursor-not-allowed"
                )}
                disabled={!canEdit}
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Node</span>
              </ContextMenuSubTrigger>
              {canEdit && (
                <ContextMenuSubContent className="bg-slate-800 border-slate-600">
                  <ContextMenuItem
                    className="flex items-center gap-2 text-slate-100 hover:bg-slate-700 focus:bg-slate-700"
                    onClick={() => onDelete(false)}
                  >
                    <span>Delete (orphan children)</span>
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="flex items-center gap-2 text-red-400 hover:bg-red-900/50 focus:bg-red-900/50"
                    onClick={() => onDelete(true)}
                  >
                    <span>Delete + All Children</span>
                  </ContextMenuItem>
                </ContextMenuSubContent>
              )}
            </ContextMenuSub>
          )}

          {/* Info for non-editors */}
          {!canEdit && (
            <>
              <ContextMenuSeparator className="bg-slate-600" />
              <div className="px-2 py-1.5 text-xs text-slate-400">
                EditTreeStructure permission required
              </div>
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
};
