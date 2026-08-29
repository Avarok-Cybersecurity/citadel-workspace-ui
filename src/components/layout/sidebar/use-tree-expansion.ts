import { useCallback, useEffect, useMemo, useRef, useState , type MutableRefObject } from 'react';
import { useRevealCreatedNodes } from './use-reveal-created-nodes';
import type { TreeNode } from './tree-node-types';

/**
 * Which nodes in the hierarchy are open.
 *
 * Split out of `TreeNodesSection`, which was at its length ceiling and held
 * this alongside deletion, navigation, search and rendering. Everything about
 * "what is open" lives here, and there are four rules, each of which was a bug
 * before it was a rule:
 *
 *  - **Auto-expand runs ONCE.** It used to run on every change of the tree's
 *    identity, and that identity is re-minted per keystroke and on half a dozen
 *    workspace events — so every collapse the user made was undone by typing a
 *    character, or by anyone saving a document anywhere in the workspace.
 *  - **A newly created node opens its whole ancestor chain**, not just its
 *    parent. See `use-reveal-created-nodes`.
 *  - **Search-driven expansion is derived, not stored.** Opening ancestors of a
 *    match is a property of the query, so clearing the box restores exactly the
 *    shape the user had.
 *  - **The tree is read through a ref** by the reveal listener, so a tree that
 *    changes constantly does not resubscribe it.
 */
export function useTreeExpansion({
  treeData,
  filteredTreeData,
  searchQuery,
  initialExpandedIds,
}: {
  treeData: TreeNode | null;
  filteredTreeData: TreeNode | null;
  searchQuery: string;
  initialExpandedIds: string[];
}): { effectiveExpanded: Set<string>; toggleExpand: (nodeId: string) => void } {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial: Set<string> = new Set<string>(initialExpandedIds);
    if (treeData) initial.add(treeData.node.id);
    return initial;
  });

  const hasAutoExpanded: MutableRefObject<boolean> = useRef(false);
  useEffect(() => {
    if (hasAutoExpanded.current || !treeData) return;
    hasAutoExpanded.current = true;
    setExpandedNodes((prev) => {
      const next: Set<string> = new Set(prev);
      next.add(treeData.node.id);
      for (const child of treeData.children) {
        if (child.children.length > 0) next.add(child.node.id);
      }
      return next;
    });
  }, [treeData]);

  const treeRef: MutableRefObject<TreeNode | null> = useRef<TreeNode | null>(treeData);
  treeRef.current = treeData;
  useRevealCreatedNodes(setExpandedNodes, treeRef);

  const effectiveExpanded: Set<string> = useMemo(() => {
    if (!searchQuery.trim() || !filteredTreeData) return expandedNodes;
    const withMatches: Set<string> = new Set(expandedNodes);
    const openAncestors = (tn: TreeNode): void => {
      if (tn.children.length > 0) {
        withMatches.add(tn.node.id);
        tn.children.forEach(openAncestors);
      }
    };
    openAncestors(filteredTreeData);
    return withMatches;
  }, [expandedNodes, filteredTreeData, searchQuery]);

  const toggleExpand: (nodeId: string) => void = useCallback((nodeId: string): void => {
    setExpandedNodes((prev) => {
      const next: Set<string> = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  return { effectiveExpanded, toggleExpand };
}
