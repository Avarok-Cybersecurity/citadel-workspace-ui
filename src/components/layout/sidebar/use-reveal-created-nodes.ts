import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { eventEmitter } from '@/lib/event-emitter';

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
 * The parent only, never the new node: expanding the thing you just created
 * would move whatever is below it, which nobody asked for.
 */
export function useRevealCreatedNodes(
  setExpandedNodes: Dispatch<SetStateAction<Set<string>>>,
): void {
  useEffect(() => {
    const reveal = (payload: { node: { parent_id: string | null } }): void => {
      const parentId: string | null = payload.node.parent_id;
      if (!parentId) return;
      setExpandedNodes((prev) => (prev.has(parentId) ? prev : new Set(prev).add(parentId)));
    };
    eventEmitter.on('node:loaded', reveal);
    return (): void => eventEmitter.off('node:loaded', reveal);
  }, [setExpandedNodes]);
}
