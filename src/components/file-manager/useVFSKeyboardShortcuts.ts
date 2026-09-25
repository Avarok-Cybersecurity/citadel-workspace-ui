import { useEffect, useCallback } from "react";
import { PROTECTED_DIRS , type RevfsNode } from "@/types/revfs-types";
import { findNodeByPath } from "./vfs-content-helpers";
import { VFS_SHORTCUTS, matchesShortcut, isForeignKeyTarget, type VfsShortcut } from "./vfs-shortcuts";

interface KeyboardShortcutsDeps {
  tree: RevfsNode;
  selectedPaths: Set<string>;
  renamingPath: string | null;
  currentPath: string;
  hasPasteItems: boolean;
  setRenamingPath: (path: string | null) => void;
  onDelete: (node: RevfsNode) => void;
  onDeleteMultiple?: (nodes: RevfsNode[]) => void;
  onCopy: (node: RevfsNode) => void;
  onCopyMultiple?: (nodes: RevfsNode[]) => void;
  onCut: (node: RevfsNode) => void;
  onCutMultiple?: (nodes: RevfsNode[]) => void;
  onPaste: (destPath: string) => Promise<void>;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
}

export function useVFSKeyboardShortcuts({
  tree, selectedPaths, renamingPath, currentPath, hasPasteItems,
  setRenamingPath, onDelete, onDeleteMultiple, onCopy, onCopyMultiple,
  onCut, onCutMultiple, onPaste, onSelectAll, onClearSelection,
}: KeyboardShortcutsDeps): void {
  const getSelectedNodes: () => RevfsNode[] = useCallback((): RevfsNode[] => {
    return Array.from(selectedPaths)
      .map(path => findNodeByPath(tree, path))
      .filter((n): n is RevfsNode => n !== null);
  }, [selectedPaths, tree]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (renamingPath || isForeignKeyTarget(e.target)) return;

      const selected: RevfsNode[] = getSelectedNodes();
      const modifiable: RevfsNode[] = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
      const on = (s: VfsShortcut): boolean => matchesShortcut(e, s);

      if (on(VFS_SHORTCUTS.rename)) {
        if (selected.length === 1 && modifiable.length === 1) {
          e.preventDefault();
          setRenamingPath(modifiable[0].path);
        }
      } else if (on(VFS_SHORTCUTS.remove)) {
        if (selected.length > 0) {
          e.preventDefault();
          if (modifiable.length > 1 && onDeleteMultiple) onDeleteMultiple(modifiable);
          else if (modifiable.length === 1) onDelete(modifiable[0]);
        }
      } else if (on(VFS_SHORTCUTS.copy)) {
        if (selected.length > 0) {
          e.preventDefault();
          if (modifiable.length > 1 && onCopyMultiple) onCopyMultiple(modifiable);
          else if (modifiable.length === 1) onCopy(modifiable[0]);
        }
      } else if (on(VFS_SHORTCUTS.cut)) {
        if (selected.length > 0) {
          e.preventDefault();
          if (modifiable.length > 1 && onCutMultiple) onCutMultiple(modifiable);
          else if (modifiable.length === 1) onCut(modifiable[0]);
        }
      } else if (on(VFS_SHORTCUTS.paste)) {
        if (hasPasteItems) { e.preventDefault(); void onPaste(currentPath); }
      } else if (on(VFS_SHORTCUTS.selectAll)) {
        e.preventDefault(); onSelectAll?.();
      } else if (on(VFS_SHORTCUTS.clear)) {
        e.preventDefault(); onClearSelection?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return (): void => document.removeEventListener('keydown', handleKeyDown);
  }, [
    renamingPath, getSelectedNodes, currentPath, hasPasteItems,
    onDelete, onDeleteMultiple, onCopy, onCopyMultiple,
    onCut, onCutMultiple, onPaste, onSelectAll, onClearSelection,
    setRenamingPath,
  ]);
}
