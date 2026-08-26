import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import type { DomainNode, TreeNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { runAsyncSetup } from './event-setup-utils';
import { setTreeSchema } from '@/lib/entity-type-registry';
import { armLoadingDeadline, cancelLoadingDeadline } from '@/lib/loading-flag-timeout';

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
        // listNodes resolves when the request is SENT. If the response never
        // arrives the flag would stay raised and the tree would spin forever, so
        // fall back to the empty state rather than an unresolvable spinner.
        armLoadingDeadline('nodes', () =>
          setState(prev => ({ ...prev, loading: { ...prev.loading, nodes: false } }))
        );
      });

      // Multiple nodes loaded
      await workspaceEvents.onNodeEvent('nodes:loaded', (payload: { nodes: DomainNode[]; connection: ConnectionInfo }) => {
        cancelLoadingDeadline('nodes');
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
          };
        });
      });

      // Single node loaded (create/get/update)
      await workspaceEvents.onNodeEvent('node:loaded', (payload: { node: DomainNode; connection: ConnectionInfo }) => {
        setState(prev => ({
          ...prev,
          nodes: { ...prev.nodes, [payload.node.id]: payload.node },
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
          };
        });
      });

      // Someone ELSE saved this node's content. The server broadcasts to every
      // member except the editor, so without this the rest of the workspace kept
      // rendering the copy they loaded — a document could be edited and nobody
      // watching it would see the change until they navigated away and back.
      await workspaceEvents.onNodeEvent('node:content-updated', (payload: { nodeId: string; mdxContent: string; updatedBy: string; timestamp: number; connection: ConnectionInfo }) => {
        setState(prev => {
          const node = prev.nodes[payload.nodeId];
          // Not a node this client knows about; nothing to refresh.
          if (!node) return prev;
          return {
            ...prev,
            nodes: {
              ...prev.nodes,
              [payload.nodeId]: { ...node, mdx_content: payload.mdxContent },
            },
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
          };
        });
      });

      // Tree schema loaded — feed to entity-type-registry (SSOT) and state
      await workspaceEvents.onNodeEvent('tree:schema:loaded', (payload: { schema: TreeSchema; connection: ConnectionInfo }) => {
        setTreeSchema(payload.schema);
        setState(prev => ({
          ...prev,
          treeSchema: payload.schema,
        }));
      });
    };

    runAsyncSetup(setupNodeListeners);
  }, [setState]);
}
