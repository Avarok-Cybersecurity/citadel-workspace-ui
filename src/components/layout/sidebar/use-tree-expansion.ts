import { useCallback, useEffect, useMemo, useRef, useState , type MutableRefObject } from 'react';
import { useRevealCreatedNodes } from './use-reveal-created-nodes';
import { readExpanded, rememberExpanded } from './expansion-memory';
import { ancestorIds } from './ancestor-chain';
import { getCurrentCid } from '@/lib/p2p/current-cid';
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
 *  - **What was open survives a reload.** See `expansion-memory`: without it a
 *    refresh collapsed a deep workspace back to the two levels auto-expand
 *    opens, and there is no way to reach a node whose branch is shut except by
 *    opening every ancestor by hand.
 */
export function useTreeExpansion({
  treeData,
  filteredTreeData,
  searchQuery,
  initialExpandedIds,
  selectedNodeId,
}: {
  treeData: TreeNode | null;
  filteredTreeData: TreeNode | null;
  searchQuery: string;
  initialExpandedIds: string[];
  /** Where the user is, so the tree can show it. */
  selectedNodeId?: string | undefined;
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

  // Restore, then record. The CID arrives asynchronously, so the stored shape
  // is MERGED into whatever auto-expand has already opened rather than
  // replacing it -- the two are both "open this", and neither is a closure.
  const cidRef: MutableRefObject<bigint | null> = useRef<bigint | null>(null);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let abandoned: boolean = false;
    void getCurrentCid().then((cid: bigint | null): void => {
      if (abandoned) return;
      cidRef.current = cid;
      if (cid !== null) {
        const stored: string[] = readExpanded(cid);
        if (stored.length > 0) {
          setExpandedNodes((prev) => {
            if (stored.every((id: string) => prev.has(id))) return prev;
            const next: Set<string> = new Set(prev);
            for (const id of stored) next.add(id);
            return next;
          });
        }
      }
      // Set last: writing before the restore lands would persist a set that
      // does not yet contain what was read, and the next reload would find it.
      setRestored(true);
    });
    return (): void => { abandoned = true; };
  }, []);

  useEffect(() => {
    const cid: bigint | null = cidRef.current;
    if (!restored || cid === null) return;
    rememberExpanded(cid, [...expandedNodes]);
  }, [restored, expandedNodes]);

  // Show where the user IS.
  //
  // A node reached by URL -- a shared link, a restored last location, a reload
  // on a deep page -- was selected without anything opening its branch, so the
  // sidebar highlighted nothing and gave no clue where in the workspace the
  // content on screen came from. Ancestors only: opening the selected node's
  // own children would move everything below it, which nobody asked for.
  useEffect(() => {
    if (!selectedNodeId || !treeData) return;
    const toOpen: string[] = ancestorIds(treeData, selectedNodeId);
    if (toOpen.length === 0) return;
    setExpandedNodes((prev) => {
      if (toOpen.every((id: string) => prev.has(id))) return prev;
      const next: Set<string> = new Set(prev);
      for (const id of toOpen) next.add(id);
      return next;
    });
  }, [selectedNodeId, treeData]);

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
