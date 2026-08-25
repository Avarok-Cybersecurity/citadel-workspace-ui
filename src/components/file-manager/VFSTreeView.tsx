import { useState, useCallback } from "react";
import {
  Folder,
  FolderLock,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import { PROTECTED_DIRS } from "@/types/revfs-types";
import { VFSContextMenu } from "./VFSContextMenu";
import { VFSStorageUsage } from "./VFSStorageUsage";
import { cn } from "@/lib/utils";
import { activateOnKey } from '@/lib/a11y';

// ============================================================================
// Sidebar Tree Node (directories only)
// ============================================================================

interface SidebarNodeProps {
  node: RevfsNode;
  depth: number;
  expanded: boolean;
  isActive: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  onNewFolder: (parentPath: string) => void;
  onDelete: (node: RevfsNode) => void;
  onUploadFile: (dirPath: string) => void;
  onDrop: (targetPath: string, files: FileList) => void;
}

function SidebarNode({
  node,
  depth,
  expanded,
  isActive,
  onToggle,
  onNavigate,
  onNewFolder,
  onDelete,
  onUploadFile,
  onDrop,
}: SidebarNodeProps) {
  const [dragOver, setDragOver] = useState(false);
  const isProtected = PROTECTED_DIRS.has(node.path);
  const FolderIcon = isProtected ? FolderLock : expanded ? FolderOpen : Folder;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onDrop(node.path, e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    onNavigate(node.path);
    if (!expanded) onToggle();
  };

  // Widened from MouseEvent: also the keyboard activation handler, and it only
  // uses stopPropagation, which both event types have.
  const handleChevronClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onToggle();
  };

  return (
    <VFSContextMenu
      node={node}
      onNewFolder={() => onNewFolder(node.path)}
      onDelete={() => onDelete(node)}
      onDownload={() => {}}
      onUploadFile={() => onUploadFile(node.path)}
      onInfo={() => {}}
    >
      <div
        className={cn(
          "flex items-center py-1 px-1 cursor-pointer rounded text-sm text-foreground/80 hover:bg-card",
          isActive && "bg-primary/50 text-primary-foreground",
          dragOver && "bg-success/15 ring-1 ring-success",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={activateOnKey(handleClick)}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span
          className="mr-0.5 text-muted-foreground hover:text-foreground"
          onClick={handleChevronClick}
          role="button"
          tabIndex={0}
          onKeyDown={activateOnKey(handleChevronClick)}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <FolderIcon className={cn("h-4 w-4 mr-1.5 shrink-0", isProtected ? "text-muted-foreground" : "text-warning")} />
        <span className="truncate text-xs">{node.name}</span>
      </div>
    </VFSContextMenu>
  );
}

// ============================================================================
// VFSTreeView (Sidebar — folders only)
// ============================================================================

interface VFSTreeViewProps {
  tree: RevfsNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  onNewFolder: (parentPath: string) => void;
  onDelete: (node: RevfsNode) => void;
  onUploadFile: (dirPath: string) => void;
  onDrop: (targetPath: string, files: FileList) => void;
  /** Storage currently used (bytes) */
  storageUsed?: number;
  /** Storage quota limit (bytes) */
  storageQuota?: number;
  /** Label for storage display (e.g., "Server" or peer name) */
  storageLabel?: string;
}

export function VFSTreeView({
  tree,
  currentPath,
  onNavigate,
  onNewFolder,
  onDelete,
  onUploadFile,
  onDrop,
  storageUsed,
  storageQuota,
  storageLabel,
}: VFSTreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/']));

  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const renderNode = (node: RevfsNode, depth: number): React.ReactNode[] => {
    if (node.type !== 'directory') return [];

    const rows: React.ReactNode[] = [];

    if (node.path !== '/') {
      rows.push(
        <SidebarNode
          key={node.path}
          node={node}
          depth={depth}
          expanded={expanded.has(node.path)}
          isActive={currentPath === node.path}
          onToggle={() => toggleExpand(node.path)}
          onNavigate={onNavigate}
          onNewFolder={onNewFolder}
          onDelete={onDelete}
          onUploadFile={onUploadFile}
          onDrop={onDrop}
        />
      );
    }

    if (expanded.has(node.path) && node.children) {
      const dirs = node.children
        .filter(c => c.type === 'directory')
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of dirs) {
        rows.push(...renderNode(child, node.path === '/' ? 0 : depth + 1));
      }
    }

    return rows;
  };

  const showStorageUsage = storageUsed !== undefined && storageQuota !== undefined;

  return (
    <div className="w-52 shrink-0 border-r border-border flex flex-col bg-surface">
      {/* Scrollable tree area */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Root entry */}
        <div
          className={cn(
            "flex items-center py-1 px-2 cursor-pointer rounded text-xs text-muted-foreground hover:bg-card mx-1 mb-0.5",
            currentPath === '/' && "bg-primary/50 text-primary-foreground",
          )}
          onClick={() => onNavigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={activateOnKey(() => { (() => onNavigate('/'))(); })}
        >
          <Folder className="h-3.5 w-3.5 mr-1.5 text-warning" />
          <span>Root</span>
        </div>
        {renderNode(tree, 0)}
      </div>

      {/* Storage usage bar (fixed at bottom) */}
      {showStorageUsage && (
        <VFSStorageUsage
          usedBytes={storageUsed}
          quotaBytes={storageQuota}
          label={storageLabel}
        />
      )}
    </div>
  );
}
