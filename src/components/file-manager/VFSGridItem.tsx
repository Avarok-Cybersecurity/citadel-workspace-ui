import { useState } from "react";
import { Folder, FolderLock } from "lucide-react";
import { RevfsFileState, PROTECTED_DIRS , type RevfsNode } from "@/types/revfs-types";
import type { SelectMode } from "@/hooks/useVFSSelection";
import { VFSContextMenu } from "./VFSContextMenu";
import { VFSRenameInput } from "./VFSRenameInput";
import { cn } from "@/lib/utils";
import { getFileIcon, formatSize, stateConfig, type FileIcon, type FileStateStyle } from "./vfs-content-helpers";
import { activateOnKey } from '@/lib/a11y';

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
}: GridItemProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const isDir: boolean = node.type === 'directory';
  const isProtected: boolean = PROTECTED_DIRS.has(node.path);
  const isRoot: boolean = node.path === '/';
  const canModify: boolean = !isProtected && !isRoot;

  const Icon: FileIcon = isDir
    ? (isProtected ? FolderLock : Folder)
    : getFileIcon(node.name);

  const handleDoubleClick = (): void => {
    if (isDir) onNavigate(node.path);
  };

  /**
   * Opening a folder was double-click ONLY.
   *
   * Keyboard activation ran `handleClick`, which selects — so a keyboard user
   * could select a folder and never enter it. And a synthesized `dblclick` is
   * unreliable on iOS, so on touch the grid was effectively navigation-dead;
   * the tree sidebar was the only way to move around, and it lists directories
   * alone.
   *
   * Enter opens, Space selects — the convention every file manager uses.
   */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (isDir && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(node.path);
      return;
    }
    activateOnKey(handleClick)(e);
  };

  // A single tap opens a folder where there is no hover and no reliable
  // double-tap. Guarded on the pointer, not on viewport width: a tablet at
  // desktop width still has no mouse.
  const isCoarsePointer: boolean =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none)').matches;

  const handleClickOrOpen = (e: React.MouseEvent): void => {
    if (isDir && isCoarsePointer) {
      handleDoubleClick();
      return;
    }
    handleClick(e);
  };

  // Widened from MouseEvent: this is now also the keyboard activation handler,
  // and every property it reads (stopPropagation, ctrlKey/metaKey/shiftKey for
  // the selection mode) exists on both event types.
  const handleClick = (e: React.MouseEvent | React.KeyboardEvent): void => {
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

  const handleDragOver = (e: React.DragEvent): void => {
    if (isDir) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    }
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (isDir && e.dataTransfer.files.length > 0) {
      onDrop(node.path, e.dataTransfer.files);
    }
  };

  const state: FileStateStyle | null = node.fileState ? stateConfig[node.fileState] : null;
  // NOT annotated. `StateIcon` is checked as the guard for rendering the badge,
  // and since TS 4.4 an unannotated `const` holding that check narrows `state`
  // along with it -- so `state.title` and `state.color` below are reachable
  // only while this stays bare. Annotating it breaks the alias and takes the
  // two of them with it.
  const StateIcon = state?.icon;

  return (
    <VFSContextMenu
      node={node}
      onNewFolder={() => onNewFolder(isDir ? node.path : '/')}
      onDelete={() => onDelete(node)}
      onDownload={() => onDownload(node)}
      onUploadFile={() => onUploadFile(isDir ? node.path : '/')}
      onInfo={() => onInfo(node)}
      onRename={canModify ? (): void => onRename(node) : undefined}
      onCut={canModify ? (): void => onCut(node) : undefined}
      onCopy={canModify ? (): void => onCopy(node) : undefined}
      onPaste={isDir && hasPasteItems ? (): void => onPaste(node) : undefined}
      hasPasteItems={hasPasteItems}
    >
      <div
        className={cn(
          "relative flex flex-col items-center justify-center p-3 rounded-lg cursor-pointer",
          "hover:bg-card transition-colors select-none",
          dragOver && "bg-success/15 ring-1 ring-success",
          isCutItem && "opacity-50",
          isSelected && "bg-primary/40 ring-1 ring-ring",
        )}
        onClick={handleClickOrOpen}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Icon className={cn(
          "h-10 w-10 mb-1.5",
          isDir ? (isProtected ? "text-muted-foreground" : "text-warning-emphasis") : "text-foreground/80",
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
          <span className="text-xs text-muted-foreground">{formatSize(node.fileMetadata.fileSize)}</span>
        )}
      </div>
    </VFSContextMenu>
  );
}
