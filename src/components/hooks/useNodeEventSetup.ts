import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import type { DomainNode, TreeNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { runAsyncSetup } from './event-setup-utils';

interface UseNodeEventSetupProps {
  setState: React.Dispatch<React.SetStateAction<WorkspaceEventState>>;
}

/** Flatten a TreeNode into a flat array of DomainNodes. */
function flattenTree(treeNode: TreeNode): DomainNode[] {
  const result: DomainNode[] = [treeNode.node];
  for (const child of treeNode.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

export function useNodeEventSetup({ setState }: UseNodeEventSetupProps): void {
  useEffect(() => {
    const setupNodeListeners = async () => {
      // Loading state
      await workspaceEvents.onNodeEvent('nodes:loading', (_connectionInfo: ConnectionInfo) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, nodes: true },
        }));
      });

      // Multiple nodes loaded
      await workspaceEvents.onNodeEvent('nodes:loaded', (payload: { nodes: DomainNode[]; connection: ConnectionInfo }) => {
        setState(prev => {
          const updatedNodes = { ...prev.nodes };
          for (const node of payload.nodes) {
            updatedNodes[node.id] = node;
          }

          broadcastChannelService.broadcastStateSync({
            type: 'nodes',
            data: updatedNodes,
          });

          return {
            ...prev,
            nodes: updatedNodes,
            loading: { ...prev.loading, nodes: false },
            lastRequestId: payload.connection.request_id,
          };
        });
      });

      // Single node loaded (create/get/update)
      await workspaceEvents.onNodeEvent('node:loaded', (payload: { node: DomainNode; connection: ConnectionInfo }) => {
        setState(prev => ({
          ...prev,
          nodes: { ...prev.nodes, [payload.node.id]: payload.node },
          lastRequestId: payload.connection.request_id,
        }));
      });

      // Node deleted (with cascaded children)
      await workspaceEvents.onNodeEvent('node:deleted', (payload: { nodeId: string; childrenDeleted: string[]; connection: ConnectionInfo }) => {
        setState(prev => {
          const updatedNodes = { ...prev.nodes };
          delete updatedNodes[payload.nodeId];
          for (const childId of payload.childrenDeleted) {
            delete updatedNodes[childId];
          }
          return {
            ...prev,
            nodes: updatedNodes,
            lastRequestId: payload.connection.request_id,
          };
        });
      });

      // Node moved (reparented)
      await workspaceEvents.onNodeEvent('node:moved', (payload: { nodeId: string; oldParentId: string | null; newParentId: string | null; connection: ConnectionInfo }) => {
        setState(prev => {
          const node = prev.nodes[payload.nodeId];
          if (!node) return prev;
          return {
            ...prev,
            nodes: {
              ...prev.nodes,
              [payload.nodeId]: { ...node, parent_id: payload.newParentId },
            },
            lastRequestId: payload.connection.request_id,
          };
        });
      });

      // Full tree structure loaded — flatten into the nodes map
      await workspaceEvents.onNodeEvent('tree:structure:loaded', (payload: { root: TreeNode; connection: ConnectionInfo }) => {
        const flatNodes = flattenTree(payload.root);
        setState(prev => {
          const updatedNodes: Record<string, DomainNode> = {};
          for (const node of flatNodes) {
            updatedNodes[node.id] = node;
          }
          return {
            ...prev,
            nodes: updatedNodes,
            loading: { ...prev.loading, nodes: false },
            lastRequestId: payload.connection.request_id,
          };
        });
      });

      // Tree schema loaded
      await workspaceEvents.onNodeEvent('tree:schema:loaded', (payload: { schema: TreeSchema; connection: ConnectionInfo }) => {
        setState(prev => ({
          ...prev,
          treeSchema: payload.schema,
          lastRequestId: payload.connection.request_id,
        }));
      });
    };

    runAsyncSetup(setupNodeListeners);
  }, [setState]);
}
