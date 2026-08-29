import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import type { DomainNode } from '@/components/layout/sidebar/TreeNodesSection';
// Re-export runAsyncSetup from canonical location for backward compatibility
export { runAsyncSetup } from '@/lib/utils/async-utils';

type SetState = React.Dispatch<React.SetStateAction<WorkspaceEventState>>;

/** Set a loading flag and optionally track the request ID. */
export function setLoading(
  setState: SetState,
  key: keyof WorkspaceEventState['loading'],
  loading: boolean,
): void {
  setState(prev => ({
    ...prev,
    loading: { ...prev.loading, [key]: loading },
  }));
}

/**
 * No-op kept as a call site marker.
 *
 * This used to write the request id into `lastRequestId`, a field written in
 * 24 places and read in none — so "track a request ID without changing other
 * state" was a root re-render of every useWorkspace() consumer in exchange for
 * nothing. The parameters stay so the call sites still document which events
 * carry a request id.
 */
export function trackRequest(_setState: SetState, _requestId?: string): void {
  // Intentionally empty.
}

/** Upsert a DomainNode into the nodes map by its id. */
export function upsertNode(
  setState: SetState,
  node: DomainNode,
): void {
  setState(prev => ({
    ...prev,
    nodes: { ...prev.nodes, [node.id]: node },
  }));
}

/** Remove a node and its cascaded children from the nodes map. */
export function removeNode(
  setState: SetState,
  nodeId: string,
  childrenDeleted: string[],
): void {
  setState(prev => {
    const updated: { [x: string]: DomainNode; } = { ...prev.nodes };
    delete updated[nodeId];
    for (const childId of childrenDeleted) {
      delete updated[childId];
    }
    return {
      ...prev,
      nodes: updated,
    };
  });
}
