import { debugLog } from '@/lib/debug-config';

/**
 * Which branches of the hierarchy a person had open, across a reload.
 *
 * The tree had no memory at all. Auto-expand opens the root and the first level
 * that has children, once, and everything else is a click — so a refresh
 * collapsed a five-deep workspace back to two levels, with no sign of where the
 * user had been. `initialExpandedIds` existed on `TreeNodesSection` for exactly
 * this and had no production caller: a prop read and never written.
 *
 * CI measured the boundary precisely. A five-level tree was created, the page
 * reloaded, and the sidebar reported:
 *
 *   [UI] Node "Alpha_…" exists: true
 *   [UI] Node "Beta_…"  exists: true
 *   [UI] Node "Charlie_…" exists: false
 *
 * Depth three and below were not merely collapsed but unreachable — there is no
 * "show me this node" path in the sidebar, so a node whose branch is shut can
 * only be found by opening every ancestor by hand.
 *
 * Per CID, beside `session_last_location` and `session_last_accessed`, because
 * "which branches are open" belongs to a person in a workspace and not to the
 * browser. A viewer with no stored shape gets the auto-expand, which is what
 * everybody got before.
 */

function keyFor(cid: bigint | string): string {
  return `sidebar_expanded_nodes_${cid.toString()}`;
}

/**
 * A bound on what is written back.
 *
 * Node ids are UUIDs and a large workspace has thousands; an unbounded list
 * would grow until `setItem` threw, at which point the store would stop
 * accepting anything else this key wrote. The most recently opened branches are
 * the ones worth keeping.
 */
export const MAX_REMEMBERED_NODES: 500 = 500;

export function rememberExpanded(cid: bigint | string, ids: readonly string[]): void {
  try {
    const kept: string[] = ids.slice(-MAX_REMEMBERED_NODES);
    localStorage.setItem(keyFor(cid), JSON.stringify(kept));
  } catch (error) {
    // Private mode, or a full store. Forgetting which branches were open costs
    // a few clicks; throwing here would take the sidebar down with it.
    debugLog('ExpansionMemory', 'could not record expanded nodes:', error);
  }
}

/** The branches this session had open, or an empty list when there is nothing. */
export function readExpanded(cid: bigint | string): string[] {
  try {
    const stored: string | null = localStorage.getItem(keyFor(cid));
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    // Written by an older build, or by hand. A malformed value must read as
    // "no memory" rather than putting a non-string into the expansion set,
    // where it would compare unequal to every node id and never be cleared.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id: unknown): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}
