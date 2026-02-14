import { useState, useCallback, useEffect } from "react";
import {
  Folder,
  FolderLock,
  FolderOpen,
  FileText,
  FileImage,
  FileCode,
  Monitor,
  Cloud,
  Upload,
  Download,
} from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import { RevfsFileState, PROTECTED_DIRS } from "@/types/revfs-types";
import { VFSContextMenu } from "./VFSContextMenu";
import { VFSRenameInput } from "./VFSRenameInput";
import { cn } from "@/lib/utils";

// ============================================================================
// Helpers
// ============================================================================

function findNodeByPath(tree: RevfsNode, path: string): RevfsNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml'];
  if (imageExts.includes(ext)) return FileImage;
  if (codeExts.includes(ext)) return FileCode;
  return FileText;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const stateConfig: Record<RevfsFileState, { icon: typeof Monitor; color: string; title: string }> = {
  [RevfsFileState.Hosted]: { icon: Monitor, color: 'text-gray-400', title: 'Hosted (stored for peer)' },
  [RevfsFileState.Remote]: { icon: Cloud, color: 'text-blue-400', title: 'Remote (downloadable)' },
  [RevfsFileState.Sent]: { icon: Upload, color: 'text-green-400', title: 'Sent' },
  [RevfsFileState.Received]: { icon: Download, color: 'text-purple-400', title: 'Received' },
  [RevfsFileState.ServerStored]: { icon: Cloud, color: 'text-cyan-400', title: 'Server stored (downloadable)' },
};

// ============================================================================
// Grid Item
// ============================================================================

import type { SelectMode } from '@/hooks/useVFSSelection';

interface GridItemProps {
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

function GridItem({
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
    // Determine selection mode based on modifier keys
    let mode: SelectMode = 'replace';
    if (e.ctrlKey || e.metaKey) {
      mode = 'toggle';
    } else if (e.shiftKey) {
      mode = 'range';
    }
    onSelect(node.path, mode);

    // If single click on file and not multi-selecting, also trigger download
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
          "hover:bg-[#444A6C] transition-colors select-none",
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
        {/* Icon */}
        <Icon className={cn(
          "h-10 w-10 mb-1.5",
          isDir ? (isProtected ? "text-gray-400" : "text-yellow-400") : "text-gray-300",
        )} />

        {/* State badge */}
        {StateIcon && (
          <span title={state.title} className={cn("absolute top-2 right-2", state.color)}>
            <StateIcon className="h-3.5 w-3.5" />
          </span>
        )}

        {/* Name (or rename input) */}
        {isRenaming ? (
          <VFSRenameInput
            currentName={node.name}
            onConfirm={(newName) => onRenameConfirm(node, newName)}
            onCancel={onRenameCancel}
            isDirectory={isDir}
          />
        ) : (
          <span className="text-xs text-gray-200 text-center truncate w-full">{node.name}</span>
        )}

        {/* Size */}
        {node.fileMetadata && !isRenaming && (
          <span className="text-[10px] text-gray-500">{formatSize(node.fileMetadata.fileSize)}</span>
        )}
      </div>
    </VFSContextMenu>
  );
}

// ============================================================================
// VFSContentGrid
// ============================================================================

export type SortField = 'name' | 'date' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';

interface VFSContentGridProps {
  tree: RevfsNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  onNewFolder: (parentPath: string) => void;
  onDelete: (node: RevfsNode) => void;
  onDeleteMultiple?: (nodes: RevfsNode[]) => void;
  onDownload: (node: RevfsNode) => void;
  onUploadFile: (dirPath: string) => void;
  onInfo: (node: RevfsNode) => void;
  onRename: (path: string, newName: string) => Promise<void>;
  onCut: (node: RevfsNode) => void;
  onCutMultiple?: (nodes: RevfsNode[]) => void;
  onCopy: (node: RevfsNode) => void;
  onCopyMultiple?: (nodes: RevfsNode[]) => void;
  onPaste: (destPath: string) => Promise<void>;
  onDrop: (targetPath: string, files: FileList) => void;
  cutItemPaths?: Set<string>;
  hasPasteItems?: boolean;
  selectedPaths?: Set<string>;
  onSelect?: (path: string, mode: SelectMode) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  filterText?: string;
}

export function VFSContentGrid({
  tree,
  currentPath,
  onNavigate,
  onNewFolder,
  onDelete,
  onDeleteMultiple,
  onDownload,
  onUploadFile,
  onInfo,
  onRename,
  onCut,
  onCutMultiple,
  onCopy,
  onCopyMultiple,
  onPaste,
  onDrop,
  cutItemPaths = new Set(),
  hasPasteItems = false,
  selectedPaths = new Set(),
  onSelect,
  onSelectAll,
  onClearSelection,
  sortField = 'name',
  sortDirection = 'asc',
  filterText = '',
}: VFSContentGridProps) {
  const [rootDragOver, setRootDragOver] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const currentNode = findNodeByPath(tree, currentPath);
  const allChildren = currentNode?.children ?? [];

  // Filter children by name
  const children = filterText
    ? allChildren.filter(n => n.name.toLowerCase().includes(filterText.toLowerCase()))
    : allChildren;

  // Get selected nodes
  const getSelectedNodes = useCallback((): RevfsNode[] => {
    return Array.from(selectedPaths)
      .map(path => findNodeByPath(tree, path))
      .filter((n): n is RevfsNode => n !== null);
  }, [selectedPaths, tree]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if in rename mode or typing in an input
      if (renamingPath || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      const selected = getSelectedNodes();

      switch (e.key) {
        case 'F2':
          // Rename first selected item
          if (selected.length === 1 && !PROTECTED_DIRS.has(selected[0].path) && selected[0].path !== '/') {
            e.preventDefault();
            setRenamingPath(selected[0].path);
          }
          break;

        case 'Delete':
        case 'Backspace':
          // Delete selected items
          if (selected.length > 0) {
            e.preventDefault();
            const deletable = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
            if (deletable.length > 1 && onDeleteMultiple) {
              onDeleteMultiple(deletable);
            } else if (deletable.length === 1) {
              onDelete(deletable[0]);
            }
          }
          break;

        case 'c':
          // Copy
          if (isMod && selected.length > 0) {
            e.preventDefault();
            const copyable = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
            if (copyable.length > 1 && onCopyMultiple) {
              onCopyMultiple(copyable);
            } else if (copyable.length === 1) {
              onCopy(copyable[0]);
            }
          }
          break;

        case 'x':
          // Cut
          if (isMod && selected.length > 0) {
            e.preventDefault();
            const cutable = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
            if (cutable.length > 1 && onCutMultiple) {
              onCutMultiple(cutable);
            } else if (cutable.length === 1) {
              onCut(cutable[0]);
            }
          }
          break;

        case 'v':
          // Paste
          if (isMod && hasPasteItems) {
            e.preventDefault();
            void onPaste(currentPath);
          }
          break;

        case 'a':
          // Select all
          if (isMod) {
            e.preventDefault();
            onSelectAll?.();
          }
          break;

        case 'Escape':
          // Clear selection
          e.preventDefault();
          onClearSelection?.();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    renamingPath, getSelectedNodes, currentPath, hasPasteItems,
    onDelete, onDeleteMultiple, onCopy, onCopyMultiple,
    onCut, onCutMultiple, onPaste, onSelectAll, onClearSelection,
  ]);

  const handleBackgroundClick = useCallback(() => {
    onClearSelection?.();
  }, [onClearSelection]);

  const handleRename = useCallback((node: RevfsNode) => {
    setRenamingPath(node.path);
  }, []);

  const handleRenameConfirm = useCallback(async (node: RevfsNode, newName: string) => {
    setRenamingPath(null);
    await onRename(node.path, newName);
  }, [onRename]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handlePaste = useCallback(async (node: RevfsNode) => {
    await onPaste(node.path);
  }, [onPaste]);

  // Sort children with directories always first
  const sorted = [...children].sort((a, b) => {
    // Directories always come first
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;

    let comparison = 0;
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        comparison = a.updatedAt - b.updatedAt;
        break;
      case 'size':
        comparison = (a.fileMetadata?.fileSize ?? 0) - (b.fileMetadata?.fileSize ?? 0);
        break;
      case 'type': {
        const extA = a.type === 'file' ? (a.name.split('.').pop()?.toLowerCase() ?? '') : '';
        const extB = b.type === 'file' ? (b.name.split('.').pop()?.toLowerCase() ?? '') : '';
        comparison = extA.localeCompare(extB);
        break;
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(true);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onDrop(currentPath, e.dataTransfer.files);
    }
  };

  if (sorted.length === 0) {
    return (
      <VFSContextMenu
        node={null}
        onNewFolder={() => onNewFolder(currentPath)}
        onDelete={() => {}}
        onDownload={() => {}}
        onUploadFile={() => onUploadFile(currentPath)}
        onInfo={() => {}}
        onPaste={hasPasteItems ? async () => { await onPaste(currentPath); } : undefined}
        hasPasteItems={hasPasteItems}
      >
        <div
          className={cn(
            "flex-1 flex flex-col items-center justify-center text-gray-500 text-sm",
            rootDragOver && "bg-green-900/10",
          )}
          onDragOver={handleRootDragOver}
          onDragLeave={() => setRootDragOver(false)}
          onDrop={handleRootDrop}
        >
          <FolderOpen className="h-12 w-12 mb-3 text-gray-600" />
          <p>This folder is empty</p>
          <p className="text-xs text-gray-600 mt-1">Drag files here or right-click to create a folder</p>
        </div>
      </VFSContextMenu>
    );
  }

  return (
    <VFSContextMenu
      node={null}
      onNewFolder={() => onNewFolder(currentPath)}
      onDelete={() => {}}
      onDownload={() => {}}
      onUploadFile={() => onUploadFile(currentPath)}
      onInfo={() => {}}
      onPaste={hasPasteItems ? async () => { await onPaste(currentPath); } : undefined}
      hasPasteItems={hasPasteItems}
    >
      <div
        className={cn(
          "flex-1 overflow-y-auto p-4",
          rootDragOver && "bg-green-900/10",
        )}
        onClick={handleBackgroundClick}
        onDragOver={handleRootDragOver}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={handleRootDrop}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
          {sorted.map(node => (
            <GridItem
              key={node.path}
              node={node}
              isRenaming={renamingPath === node.path}
              isCutItem={cutItemPaths.has(node.path)}
              isSelected={selectedPaths.has(node.path)}
              onNavigate={onNavigate}
              onNewFolder={onNewFolder}
              onDelete={onDelete}
              onDownload={onDownload}
              onUploadFile={onUploadFile}
              onInfo={onInfo}
              onRename={handleRename}
              onRenameConfirm={handleRenameConfirm}
              onRenameCancel={handleRenameCancel}
              onCut={onCut}
              onCopy={onCopy}
              onPaste={handlePaste}
              onDrop={onDrop}
              onSelect={(path, mode) => onSelect?.(path, mode)}
              hasPasteItems={hasPasteItems}
            />
          ))}
        </div>
      </div>
    </VFSContextMenu>
  );
}
