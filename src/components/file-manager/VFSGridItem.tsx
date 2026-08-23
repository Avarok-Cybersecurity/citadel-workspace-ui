import { useState } from "react";
import { Folder, FolderLock } from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import { RevfsFileState, PROTECTED_DIRS } from "@/types/revfs-types";
import type { SelectMode } from "@/hooks/useVFSSelection";
import { VFSContextMenu } from "./VFSContextMenu";
import { VFSRenameInput } from "./VFSRenameInput";
import { cn } from "@/lib/utils";
import { getFileIcon, formatSize, stateConfig } from "./vfs-content-helpers";

export interface GridItemProps {
  node: RevfsNode;
  isRenaming: boolean;
  isCutItem: boolean;
  isSelected: boolean;
  onNavigate: (path: string) => void;
  onNewFolder: (parentPath: string) => void;
  onDelete: (node: RevfsNode) => void;
  onDownload: (node: RevfsNode) => void;
  onUploadFile: (dirPath: string) => void;
  onInfo: (node: RevfsNode) => void;
  onRename: (node: RevfsNode) => void;
  onRenameConfirm: (node: RevfsNode, newName: string) => void;
  onRenameCancel: () => void;
  onCut: (node: RevfsNode) => void;
  onCopy: (node: RevfsNode) => void;
  onPaste: (node: RevfsNode) => void;
  onDrop: (targetPath: string, files: FileList) => void;
  onSelect: (path: string, mode: SelectMode) => void;
  hasPasteItems: boolean;
}

export function GridItem({
  node,
  isRenaming,
  isCutItem,
  isSelected,
  onNavigate,
  onNewFolder,
  onDelete,
  onDownload,
  onUploadFile,
  onInfo,
  onRename,
  onRenameConfirm,
  onRenameCancel,
  onCut,
  onCopy,
  onPaste,
  onDrop,
  onSelect,
  hasPasteItems,
}: GridItemProps) {
  const [dragOver, setDragOver] = useState(false);
  const isDir = node.type === 'directory';
  const isProtected = PROTECTED_DIRS.has(node.path);
  const isRoot = node.path === '/';
  const canModify = !isProtected && !isRoot;

  const Icon = isDir
    ? (isProtected ? FolderLock : Folder)
    : getFileIcon(node.name);

  const handleDoubleClick = () => {
    if (isDir) onNavigate(node.path);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    let mode: SelectMode = 'replace';
    if (e.ctrlKey || e.metaKey) {
      mode = 'toggle';
    } else if (e.shiftKey) {
      mode = 'range';
    }
    onSelect(node.path, mode);

    if (mode === 'replace' && !isDir && (node.fileState === RevfsFileState.Remote || node.fileState === RevfsFileState.Received)) {
      onDownload(node);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isDir) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (isDir && e.dataTransfer.files.length > 0) {
      onDrop(node.path, e.dataTransfer.files);
    }
  };

  const state = node.fileState ? stateConfig[node.fileState] : null;
  const StateIcon = state?.icon;

  return (
    <VFSContextMenu
      node={node}
      onNewFolder={() => onNewFolder(isDir ? node.path : '/')}
      onDelete={() => onDelete(node)}
      onDownload={() => onDownload(node)}
      onUploadFile={() => onUploadFile(isDir ? node.path : '/')}
      onInfo={() => onInfo(node)}
      onRename={canModify ? () => onRename(node) : undefined}
      onCut={canModify ? () => onCut(node) : undefined}
      onCopy={canModify ? () => onCopy(node) : undefined}
      onPaste={isDir && hasPasteItems ? () => onPaste(node) : undefined}
      hasPasteItems={hasPasteItems}
    >
      <div
        className={cn(
          "relative flex flex-col items-center justify-center p-3 rounded-lg cursor-pointer",
          "hover:bg-card transition-colors select-none",
          dragOver && "bg-green-900/30 ring-1 ring-green-500",
          isCutItem && "opacity-50",
          isSelected && "bg-purple-700/40 ring-1 ring-purple-500",
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Icon className={cn(
          "h-10 w-10 mb-1.5",
          isDir ? (isProtected ? "text-muted-foreground" : "text-yellow-400") : "text-foreground/80",
        )} />

        {StateIcon && (
          <span title={state.title} className={cn("absolute top-2 right-2", state.color)}>
            <StateIcon className="h-3.5 w-3.5" />
          </span>
        )}

        {isRenaming ? (
          <VFSRenameInput
            currentName={node.name}
            onConfirm={(newName) => onRenameConfirm(node, newName)}
            onCancel={onRenameCancel}
            isDirectory={isDir}
          />
        ) : (
          <span className="text-xs text-foreground text-center truncate w-full">{node.name}</span>
        )}

        {node.fileMetadata && !isRenaming && (
          <span className="text-[10px] text-muted-foreground">{formatSize(node.fileMetadata.fileSize)}</span>
        )}
      </div>
    </VFSContextMenu>
  );
}
