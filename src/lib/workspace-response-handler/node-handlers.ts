/**
 * Workspace Response Handler - Tree Node Handlers
 *
 * Handles Node, Nodes, TreeStructure, TreeSchema, NodeTypes,
 * NodeDeleted, and NodeMoved response variants.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import { isVariant } from 'citadel-workspace-client-ts';
import type { WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';
import type { ConnectionInfo } from './workspace-handlers';

/**
 * Try to handle tree-node response variants.
 *
 * Returns `true` if the response was handled.
 */
export function handleNodeVariants(
  response: WorkspaceProtocolResponse,
  connectionInfo: ConnectionInfo,
): boolean {
  if (isVariant(response, 'Node')) {
    const node = response.Node;
    debugLog('WorkspaceResponseHandler', 'Node response received', {
      id: node.id, name: node.name, entityType: node.entity_type,
    });
    eventEmitter.emit('node:loaded', { node, connection: connectionInfo });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'Nodes')) {
    debugLog('WorkspaceResponseHandler', 'Nodes response received', { count: response.Nodes.length });
    eventEmitter.emit('nodes:loaded', { nodes: response.Nodes, connection: connectionInfo });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'TreeStructure')) {
    debugLog('WorkspaceResponseHandler', 'TreeStructure response received');
    eventEmitter.emit('tree:structure:loaded', {
      root: response.TreeStructure.root, connection: connectionInfo,
    });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'TreeSchema')) {
    debugLog('WorkspaceResponseHandler', 'TreeSchema response received');
    eventEmitter.emit('tree:schema:loaded', {
      schema: response.TreeSchema, connection: connectionInfo,
    });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'NodeTypes')) {
    debugLog('WorkspaceResponseHandler', 'NodeTypes response received', { count: response.NodeTypes.length });
    eventEmitter.emit('node:types:loaded', {
      nodeTypes: response.NodeTypes, connection: connectionInfo,
    });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'NodeDeleted')) {
    const { node_id, children_deleted } = response.NodeDeleted;
    debugLog('WorkspaceResponseHandler', 'NodeDeleted response received', {
      node_id, childrenDeleted: children_deleted.length,
    });
    eventEmitter.emit('node:deleted', {
      nodeId: node_id, childrenDeleted: children_deleted, connection: connectionInfo,
    });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'NodeMoved')) {
    const { node_id, old_parent_id, new_parent_id } = response.NodeMoved;
    debugLog('WorkspaceResponseHandler', 'NodeMoved response received', {
      node_id, old_parent_id, new_parent_id,
    });
    eventEmitter.emit('node:moved', {
      nodeId: node_id, oldParentId: old_parent_id, newParentId: new_parent_id, connection: connectionInfo,
    });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  return false;
}
