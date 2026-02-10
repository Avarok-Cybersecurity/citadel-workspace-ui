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
  requestId?: string,
): void {
  setState(prev => ({
    ...prev,
    loading: { ...prev.loading, [key]: loading },
    ...(requestId !== undefined ? { lastRequestId: requestId } : {}),
  }));
}

/** Track a request ID without changing other state. */
export function trackRequest(setState: SetState, requestId?: string): void {
  if (requestId !== undefined) {
    setState(prev => ({ ...prev, lastRequestId: requestId }));
  }
}

/** Upsert an entity into the offices or rooms map by its id. */
export function upsertEntity(
  setState: SetState,
  stateKey: 'offices' | 'rooms',
  entity: { id: string },
  requestId?: string,
): void {
  setState(prev => ({
    ...prev,
    [stateKey]: { ...prev[stateKey], [entity.id]: entity },
    ...(requestId !== undefined ? { lastRequestId: requestId } : {}),
  }));
}

/** Remove an entity from the offices or rooms map by id. */
export function removeEntity(
  setState: SetState,
  stateKey: 'offices' | 'rooms',
  entityId: string,
  requestId?: string,
): void {
  setState(prev => {
    const updated = { ...prev[stateKey] };
    delete updated[entityId];
    return {
      ...prev,
      [stateKey]: updated,
      ...(requestId !== undefined ? { lastRequestId: requestId } : {}),
    };
  });
}

/** Upsert a DomainNode into the nodes map by its id. */
export function upsertNode(
  setState: SetState,
  node: DomainNode,
  requestId?: string,
): void {
  setState(prev => ({
    ...prev,
    nodes: { ...prev.nodes, [node.id]: node },
    ...(requestId !== undefined ? { lastRequestId: requestId } : {}),
  }));
}

/** Remove a node and its cascaded children from the nodes map. */
export function removeNode(
  setState: SetState,
  nodeId: string,
  childrenDeleted: string[],
  requestId?: string,
): void {
  setState(prev => {
    const updated = { ...prev.nodes };
    delete updated[nodeId];
    for (const childId of childrenDeleted) {
      delete updated[childId];
    }
    return {
      ...prev,
      nodes: updated,
      ...(requestId !== undefined ? { lastRequestId: requestId } : {}),
    };
  });
}
