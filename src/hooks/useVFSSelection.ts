/**
 * useVFSSelection Hook
 *
 * Manages multi-select state for file manager items.
 * Supports click, Ctrl+click (toggle), and Shift+click (range) selection.
 */

import { useState, useCallback, useMemo } from 'react';
import { findNodeByPath } from '@/lib/revfs/tree-operations';
import type { RevfsNode } from '@/types/revfs-types';

export type SelectMode = 'replace' | 'toggle' | 'range';

interface UseVFSSelectionResult {
  selectedPaths: Set<string>;
  lastSelectedPath: string | null;
  select: (path: string, mode: SelectMode, allPaths?: string[]) => void;
  selectAll: (paths: string[]) => void;
  clearSelection: () => void;
  isSelected: (path: string) => boolean;
  selectionCount: number;
  getSelectedNodes: (tree: RevfsNode) => RevfsNode[];
}

export function useVFSSelection(): UseVFSSelectionResult {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  const select = useCallback((path: string, mode: SelectMode, allPaths?: string[]) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);

      switch (mode) {
        case 'replace':
          next.clear();
          next.add(path);
          break;

        case 'toggle':
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          break;

        case 'range':
          if (lastSelectedPath && allPaths) {
            const startIdx = allPaths.indexOf(lastSelectedPath);
            const endIdx = allPaths.indexOf(path);
            if (startIdx !== -1 && endIdx !== -1) {
              const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
              for (let i = from; i <= to; i++) {
                next.add(allPaths[i]);
              }
            }
          } else {
            next.add(path);
          }
          break;
      }

      return next;
    });

    if (mode !== 'toggle' || !selectedPaths.has(path)) {
      setLastSelectedPath(path);
    }
  }, [lastSelectedPath, selectedPaths]);

  const selectAll = useCallback((paths: string[]) => {
    setSelectedPaths(new Set(paths));
    if (paths.length > 0) {
      setLastSelectedPath(paths[paths.length - 1]);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }, []);

  const isSelected = useCallback((path: string) => {
    return selectedPaths.has(path);
  }, [selectedPaths]);

  const selectionCount = useMemo(() => selectedPaths.size, [selectedPaths]);

  const getSelectedNodes = useCallback((tree: RevfsNode): RevfsNode[] => {
    const nodes: RevfsNode[] = [];
    for (const path of selectedPaths) {
      const node = findNodeByPath(tree, path);
      if (node) nodes.push(node);
    }
    return nodes;
  }, [selectedPaths]);

  return {
    selectedPaths,
    lastSelectedPath,
    select,
    selectAll,
    clearSelection,
    isSelected,
    selectionCount,
    getSelectedNodes,
  };
}
