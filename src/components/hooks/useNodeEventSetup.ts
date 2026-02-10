import { useEffect } from 'react';
import { workspaceEvents, type ConnectionInfo } from '@/lib/workspace-events';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import type { DomainNode, DomainPermissions, NodeEntityType, TreeNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
import type { WorkspaceEventState } from '../WorkspaceEventHandler';
import { runAsyncSetup } from './event-setup-utils';
import type { Office, Room } from '@/types/workspace-entities';

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

/** Default permissions stub for synthetic DomainNode from legacy entities. */
const DEFAULT_PERMISSIONS: DomainPermissions = {
  view_content: true, read_messages: true, download_files: true,
  edit_content: false, edit_mdx: false, send_messages: true,
  upload_files: false, create_room: false, delete_room: false,
  update_room: false, add_room: false, edit_room_config: false,
  update_room_settings: false, manage_room_members: false,
  create_office: false, delete_office: false, update_office: false,
  add_office: false, edit_office_config: false, update_office_settings: false,
  manage_office_members: false, create_workspace: false,
  update_workspace: false, delete_workspace: false,
  edit_workspace_config: false, add_users: false, remove_users: false,
  ban_user: false, manage_domains: false, configure_system: false,
  edit_tree_structure: false, manage_node_types: false,
};

/** Convert a legacy Office to a synthetic DomainNode. */
function officeToNode(office: Office): DomainNode {
  return {
    id: office.id,
    parent_id: null,
    entity_type: { Child: 'Office' } as NodeEntityType,
    depth: 1,
    name: office.name,
    description: office.description ?? '',
    owner_id: office.ownerId ?? '',
    members: [],
    children: [],
    mdx_content: office.mdx_content ?? '',
    rules: office.rules ?? null,
    chat_enabled: office.chat_enabled,
    chat_channel_id: office.chat_channel_id ?? null,
    default_permissions: DEFAULT_PERMISSIONS,
    metadata: [],
    allowed_child_types: ['Room'],
    is_default: office.is_default ?? false,
    created_at: BigInt(0),
    updated_at: BigInt(0),
  };
}

/** Convert a legacy Room to a synthetic DomainNode. */
function roomToNode(room: Room): DomainNode {
  return {
    id: room.id,
    parent_id: room.officeId ?? null,
    entity_type: { Child: 'Room' } as NodeEntityType,
    depth: 2,
    name: room.name,
    description: room.description ?? '',
    owner_id: room.ownerId ?? '',
    members: [],
    children: [],
    mdx_content: room.mdx_content ?? '',
    rules: room.rules ?? null,
    chat_enabled: room.chat_enabled,
    chat_channel_id: room.chat_channel_id ?? null,
    default_permissions: DEFAULT_PERMISSIONS,
    metadata: [],
    allowed_child_types: null,
    is_default: false,
    created_at: BigInt(0),
    updated_at: BigInt(0),
  };
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

      // ========== Legacy event bridging ==========
      // The initial workspace load uses ListOffices/ListRooms (legacy endpoints),
      // which emit offices:loaded/rooms:loaded instead of nodes:loaded.
      // Bridge these into state.nodes so HierarchySidebar has data to render.

      await workspaceEvents.onOfficeEvent('offices:loaded', (payload: { offices: Office[]; connection: ConnectionInfo }) => {
        setState(prev => {
          const updatedNodes = { ...prev.nodes };
          for (const office of payload.offices) {
            // Only create synthetic node if we don't already have a real one
            if (!updatedNodes[office.id]) {
              updatedNodes[office.id] = officeToNode(office);
            }
          }
          return {
            ...prev,
            nodes: updatedNodes,
            loading: { ...prev.loading, nodes: false },
          };
        });
      });

      await workspaceEvents.onOfficeEvent('office:created', (payload: { office: Office; connection: ConnectionInfo }) => {
        setState(prev => {
          if (prev.nodes[payload.office.id]) return prev;
          return {
            ...prev,
            nodes: { ...prev.nodes, [payload.office.id]: officeToNode(payload.office) },
          };
        });
      });

      await workspaceEvents.onOfficeEvent('office:deleted', (payload: { officeId: string; connection: ConnectionInfo }) => {
        setState(prev => {
          const updatedNodes = { ...prev.nodes };
          delete updatedNodes[payload.officeId];
          return { ...prev, nodes: updatedNodes };
        });
      });

      await workspaceEvents.onRoomEvent('rooms:loaded', (payload: { rooms: Room[]; connection: ConnectionInfo }) => {
        setState(prev => {
          const updatedNodes = { ...prev.nodes };
          for (const room of payload.rooms) {
            if (!updatedNodes[room.id]) {
              updatedNodes[room.id] = roomToNode(room);
            }
          }
          return {
            ...prev,
            nodes: updatedNodes,
          };
        });
      });

      await workspaceEvents.onRoomEvent('room:created', (payload: { room: Room; connection: ConnectionInfo }) => {
        setState(prev => {
          if (prev.nodes[payload.room.id]) return prev;
          return {
            ...prev,
            nodes: { ...prev.nodes, [payload.room.id]: roomToNode(payload.room) },
          };
        });
      });

      await workspaceEvents.onRoomEvent('room:deleted', (payload: { roomId: string; connection: ConnectionInfo }) => {
        setState(prev => {
          const updatedNodes = { ...prev.nodes };
          delete updatedNodes[payload.roomId];
          return { ...prev, nodes: updatedNodes };
        });
      });
    };

    runAsyncSetup(setupNodeListeners);
  }, [setState]);
}
