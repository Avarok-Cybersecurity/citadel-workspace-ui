/**
 * Drag-Reparent Proximity Heuristic
 *
 * Pure functions used by `TreeGraphEditor` to decide whether the user's
 * drag-end position lands close enough to another node to count as a
 * reparent action. Lives in its own module so it can be unit-tested
 * without pulling in React Flow / dagre and to keep `tree-graph-utils.ts`
 * focused on conversion + cycle detection.
 */

/**
 * Default node dimensions when React Flow has not yet measured a node.
 *
 * These match the values reserved by `applyDagreLayout` (240 × 80) so the
 * proximity heuristic produces sensible results for un-measured nodes
 * during the very first frames of a drag, before React Flow's measurement
 * pass has populated `node.measured`.
 *
 * The PREVIOUS implementation hard-coded 160 × 40 here, which both didn't
 * match the dagre layout AND ignored measured dimensions entirely - so
 * any node with a longer-than-average label produced wrong centers and
 * either missed or accidentally triggered reparenting.
 */
export const DEFAULT_NODE_WIDTH = 240;
export const DEFAULT_NODE_HEIGHT = 80;

/**
 * Multiplier applied to the larger of two adjacent node dimensions to
 * derive the proximity threshold. ~0.6 means the dragged node's center
 * has to come within roughly 60% of a node's own height/width before it
 * is considered a reparent target. Scaling with node size keeps the
 * heuristic consistent across small and large nodes.
 */
export const REPARENT_THRESHOLD_RATIO = 0.6;

/**
 * Subset of React Flow's `Node` shape needed by the proximity heuristic.
 * Decoupling lets us unit-test `findReparentTarget` without the full RF
 * runtime.
 */
export interface ReparentCandidateNode {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
}

/**
 * Pure proximity heuristic: given the current React Flow node positions
 * and the drag-end position of the dragged node, return the id of the
 * closest other node within the proximity threshold, or `null` if none.
 *
 * Uses `node.measured?.width / height` when React Flow has measured the
 * node (post-layout) and falls back to the dagre layout defaults
 * otherwise. The threshold scales with node size via
 * `REPARENT_THRESHOLD_RATIO`.
 *
 * The dragged node itself is excluded. When two candidates are
 * equidistant, the iteration order is the one in `nodes`, which is
 * stable across renders.
 */
export function findReparentTarget(
  nodes: ReparentCandidateNode[],
  draggedNode: ReparentCandidateNode,
): string | null {
  const draggedWidth = draggedNode.measured?.width ?? DEFAULT_NODE_WIDTH;
  const draggedHeight = draggedNode.measured?.height ?? DEFAULT_NODE_HEIGHT;
  const draggedCenterX = draggedNode.position.x + draggedWidth / 2;
  const draggedCenterY = draggedNode.position.y + draggedHeight / 2;

  let closestId: string | null = null;
  let closestDist = Infinity;

  for (const candidate of nodes) {
    if (candidate.id === draggedNode.id) continue;
    const w = candidate.measured?.width ?? DEFAULT_NODE_WIDTH;
    const h = candidate.measured?.height ?? DEFAULT_NODE_HEIGHT;
    const dx = candidate.position.x + w / 2 - draggedCenterX;
    const dy = candidate.position.y + h / 2 - draggedCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = Math.max(w, h) * REPARENT_THRESHOLD_RATIO;
    if (dist < threshold && dist < closestDist) {
      closestDist = dist;
      closestId = candidate.id;
    }
  }

  return closestId;
}
