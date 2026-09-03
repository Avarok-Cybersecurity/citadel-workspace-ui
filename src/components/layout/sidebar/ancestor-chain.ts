/**
 * Every node between a node and the root, by id.
 *
 * Revealing something that was just created means opening the whole chain above
 * it, not only its parent. Opening the parent is enough when the parent is
 * already on screen — which is true for the first child of a visible node, and
 * stops being true as soon as anything is created two levels below something
 * collapsed. The write succeeds, a success toast appears, and the sidebar shows
 * nothing.
 *
 * CI measured the boundary: in a five-deep chain, navigation to the fourth
 * level passed and the fifth failed. Nothing about that failure said "the
 * sidebar never opened the grandparent" — it said the node was not found, which
 * reads as a write that did not happen.
 *
 * Ids only, and no React: the walk is arithmetic over a tree and is tested as
 * such.
 */

/** The minimum a tree node has to be for this walk. */
export interface AncestorWalkable {
  node: { id: string };
  children: AncestorWalkable[];
}

/**
 * The ids of `targetId`'s ancestors, root first, excluding the node itself.
 *
 * An empty array means the node is the root, or is not in this tree at all —
 * both of which mean there is nothing to open.
 */
export function ancestorIds(tree: AncestorWalkable | null, targetId: string): string[] {
  if (!tree) return [];

  const walk = (current: AncestorWalkable, trail: string[]): string[] | null => {
    if (current.node.id === targetId) return trail;
    for (const child of current.children) {
      const found: string[] | null = walk(child, [...trail, current.node.id]);
      if (found) return found;
    }
    return null;
  };

  return walk(tree, []) ?? [];
}
