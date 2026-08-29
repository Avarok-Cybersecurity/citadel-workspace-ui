import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { ancestorIds, type AncestorWalkable } from './ancestor-chain';

/**
 * Reveal what somebody just created.
 *
 * Creating a child is an explicit act, and hiding the result of it is never
 * right. The tree's first-level auto-expand runs ONCE, so anything created
 * inside a node that was collapsed -- or inside an office created after the
 * tree first loaded -- landed somewhere invisible: the write succeeded, a
 * success toast appeared, and the sidebar showed nothing. Measured in CI as
 *
 *   ✓ Success toast visible (1 toast(s))
 *   Room created: false
 *
 * which reads as a broken write and is a hidden one.
 *
 * Never the new node itself: expanding the thing you just created would move
 * whatever is below it, which nobody asked for.
 *
 * But the whole chain ABOVE it, not only its parent. Opening the parent is
 * enough while the parent is already on screen, and stops being enough the
 * moment something is created two levels below a collapsed node -- the parent
 * opens inside a grandparent that is still shut, and the result is invisible
 * again. CI measured exactly that boundary in a five-deep tree: the fourth
 * level was reachable and the fifth was not, reported as "node not found",
 * which reads as a write that never happened.
 */
export function useRevealCreatedNodes(
  setExpandedNodes: Dispatch<SetStateAction<Set<string>>>,
  /**
   * The tree as it stands, for walking up from the new node's parent. Read
   * through a ref so a tree that changes on every keystroke does not
   * resubscribe this listener.
   */
  treeRef: MutableRefObject<AncestorWalkable | null>,
): void {
  const seen: MutableRefObject<Set<string>> = useRef<Set<string>>(new Set());

  useEffect(() => {
    const reveal = (payload: { node: { id: string; parent_id: string | null } }): void => {
      const parentId: string | null = payload.node.parent_id;
      if (!parentId) return;
      // Seen before: this is a load, not an arrival, and opening its branch
      // would undo whatever the user has collapsed since.
      if (seen.current.has(payload.node.id)) return;
      seen.current.add(payload.node.id);
      // The parent, and everything it is inside. A parent opened within a shut
      // grandparent is still not on screen.
      const toOpen: string[] = [...ancestorIds(treeRef.current, parentId), parentId];
      setExpandedNodes((prev) => {
        if (toOpen.every((id) => prev.has(id))) return prev;
        const next: Set<string> = new Set(prev);
        for (const id of toOpen) next.add(id);
        return next;
      });
    };
    eventEmitter.on('node:loaded', reveal);
    return (): void => eventEmitter.off('node:loaded', reveal);
  }, [setExpandedNodes, treeRef]);
}
