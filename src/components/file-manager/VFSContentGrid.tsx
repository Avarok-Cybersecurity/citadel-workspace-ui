import { useState, useCallback } from "react";
import { matchesSearch } from '@/lib/fold-for-search';
import { FolderOpen } from "lucide-react";
import type { RevfsNode } from "@/types/revfs-types";
import type { SelectMode } from "@/hooks/useVFSSelection";
import { VFSContextMenu } from "./VFSContextMenu";
import { GridItem } from "./VFSGridItem";
import { cn } from "@/lib/utils";
import { findNodeByPath, type SortField, type SortDirection } from "./vfs-content-helpers";
import { useVFSKeyboardShortcuts } from "./useVFSKeyboardShortcuts";
import { activateOnKey } from '@/lib/a11y';

export type { SortField, SortDirection };

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
  tree, currentPath, onNavigate, onNewFolder,
  onDelete, onDeleteMultiple, onDownload, onUploadFile, onInfo, onRename,
  onCut, onCutMultiple, onCopy, onCopyMultiple, onPaste, onDrop,
  cutItemPaths = new Set(), hasPasteItems = false,
  selectedPaths = new Set(), onSelect, onSelectAll, onClearSelection,
  sortField = 'name', sortDirection = 'asc', filterText = '',
}: VFSContentGridProps) {
  const [rootDragOver, setRootDragOver] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  useVFSKeyboardShortcuts({
    tree, selectedPaths, renamingPath, currentPath, hasPasteItems,
    setRenamingPath, onDelete, onDeleteMultiple, onCopy, onCopyMultiple,
    onCut, onCutMultiple, onPaste, onSelectAll, onClearSelection,
  });

  const currentNode = findNodeByPath(tree, currentPath);
  const allChildren: RevfsNode[] = currentNode?.children ?? [];
  const children: RevfsNode[] = filterText
    ? allChildren.filter(n => matchesSearch(n.name, filterText))
    : allChildren;

  const handleBackgroundClick = useCallback((): void => { onClearSelection?.(); }, [onClearSelection]);
  const handleRename = useCallback((node: RevfsNode): void => { setRenamingPath(node.path); }, []);
  const handleRenameConfirm = useCallback(async (node: RevfsNode, newName: string): Promise<void> => {
    setRenamingPath(null); await onRename(node.path, newName);
  }, [onRename]);
  const handleRenameCancel = useCallback((): void => { setRenamingPath(null); }, []);
  const handlePasteItem = useCallback(async (node: RevfsNode): Promise<void> => { await onPaste(node.path); }, [onPaste]);

  const sorted: RevfsNode[] = [...children].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    let cmp: number = 0;
    switch (sortField) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'date': cmp = a.updatedAt - b.updatedAt; break;
      case 'size': cmp = (a.fileMetadata?.fileSize ?? 0) - (b.fileMetadata?.fileSize ?? 0); break;
      case 'type': {
        const eA: string = a.type === 'file' ? (a.name.split('.').pop()?.toLowerCase() ?? '') : '';
        const eB: string = b.type === 'file' ? (b.name.split('.').pop()?.toLowerCase() ?? '') : '';
        cmp = eA.localeCompare(eB); break;
      }
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const onRootDragOver = (e: React.DragEvent): void => { e.preventDefault(); setRootDragOver(true); };
  const onRootDrop = (e: React.DragEvent): void => {
    e.preventDefault(); setRootDragOver(false);
    if (e.dataTransfer.files.length > 0) onDrop(currentPath, e.dataTransfer.files);
  };

  const emptyContextProps = {
    node: null as RevfsNode | null,
    onNewFolder: (): void => onNewFolder(currentPath),
    onDelete: (): void => {}, onDownload: (): void => {},
    onUploadFile: (): void => onUploadFile(currentPath), onInfo: (): void => {},
    onPaste: hasPasteItems ? async (): Promise<void> => { await onPaste(currentPath); } : undefined,
    hasPasteItems,
  };

  if (sorted.length === 0) {
    return (
      <VFSContextMenu {...emptyContextProps}>
        <div
          className={cn("flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm", rootDragOver && "bg-success/10")}
          onDragOver={onRootDragOver} onDragLeave={() => setRootDragOver(false)} onDrop={onRootDrop}
        >
          <FolderOpen className="h-12 w-12 mb-3 text-muted-foreground" />
          {/* "Empty" and "nothing matched your filter" are different facts, and
              stating the first when the second is true tells the user their
              files are gone. */}
          {filterText ? (
            <>
              <p>Nothing here matches &ldquo;{filterText}&rdquo;</p>
              <p className="text-xs text-muted-foreground mt-1">
                Clear the filter to see everything in this folder.
              </p>
            </>
          ) : (
            <>
              <p>This folder is empty</p>
              <p className="text-xs text-muted-foreground mt-1">Drag files here or right-click to create a folder</p>
            </>
          )}
        </div>
      </VFSContextMenu>
    );
  }

  return (
    <VFSContextMenu {...emptyContextProps}>
      <div
        className={cn("flex-1 overflow-y-auto p-4", rootDragOver && "bg-success/10")}
        onClick={handleBackgroundClick}
        role="button"
        tabIndex={0}
        onKeyDown={activateOnKey(handleBackgroundClick)}
        onDragOver={onRootDragOver} onDragLeave={() => setRootDragOver(false)} onDrop={onRootDrop}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
          {sorted.map(node => (
            <GridItem
              key={node.path} node={node}
              isRenaming={renamingPath === node.path}
              isCutItem={cutItemPaths.has(node.path)}
              isSelected={selectedPaths.has(node.path)}
              onNavigate={onNavigate} onNewFolder={onNewFolder}
              onDelete={onDelete} onDownload={onDownload}
              onUploadFile={onUploadFile} onInfo={onInfo}
              onRename={handleRename} onRenameConfirm={handleRenameConfirm}
              onRenameCancel={handleRenameCancel}
              onCut={onCut} onCopy={onCopy} onPaste={handlePasteItem}
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
