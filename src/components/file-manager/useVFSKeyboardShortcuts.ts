import { useEffect, useCallback } from "react";
import type { RevfsNode } from "@/types/revfs-types";
import { PROTECTED_DIRS } from "@/types/revfs-types";
import { findNodeByPath } from "./vfs-content-helpers";

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
      if (renamingPath || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMod: boolean = e.ctrlKey || e.metaKey;
      const selected: RevfsNode[] = getSelectedNodes();

      switch (e.key) {
        case 'F2':
          if (selected.length === 1 && !PROTECTED_DIRS.has(selected[0].path) && selected[0].path !== '/') {
            e.preventDefault();
            setRenamingPath(selected[0].path);
          }
          break;
        case 'Delete':
        case 'Backspace': {
          if (selected.length > 0) {
            e.preventDefault();
            const deletable: RevfsNode[] = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
            if (deletable.length > 1 && onDeleteMultiple) onDeleteMultiple(deletable);
            else if (deletable.length === 1) onDelete(deletable[0]);
          }
          break;
        }
        case 'c':
          if (isMod && selected.length > 0) {
            e.preventDefault();
            const copyable: RevfsNode[] = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
            if (copyable.length > 1 && onCopyMultiple) onCopyMultiple(copyable);
            else if (copyable.length === 1) onCopy(copyable[0]);
          }
          break;
        case 'x':
          if (isMod && selected.length > 0) {
            e.preventDefault();
            const cutable: RevfsNode[] = selected.filter(n => !PROTECTED_DIRS.has(n.path) && n.path !== '/');
            if (cutable.length > 1 && onCutMultiple) onCutMultiple(cutable);
            else if (cutable.length === 1) onCut(cutable[0]);
          }
          break;
        case 'v':
          if (isMod && hasPasteItems) { e.preventDefault(); void onPaste(currentPath); }
          break;
        case 'a':
          if (isMod) { e.preventDefault(); onSelectAll?.(); }
          break;
        case 'Escape':
          e.preventDefault(); onClearSelection?.();
          break;
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
