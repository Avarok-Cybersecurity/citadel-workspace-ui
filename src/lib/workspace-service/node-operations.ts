/**
 * Workspace Service - Node Operations
 *
 * Methods for generic tree node management: create, update, delete,
 * list, get tree structure, get tree schema, and server capabilities.
 */

import type { WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';
import { workspaceResponseHandler } from '@/lib/workspace-response-handler';
import type { ProtocolSender } from './workspace-operations';

/**
 * Create a node in the workspace hierarchy.
 */
export async function createNode(
  sender: ProtocolSender,
  parentId: string | null,
  entityType: { Child: string } | 'Workspace',
  name: string,
  description: string,
  options?: { mdxContent?: string; metadata?: Uint8Array; isDefault?: boolean },
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    CreateNode: {
      parent_id: parentId,
      entity_type: entityType,
      name,
      description,
      mdx_content: options?.mdxContent,
      metadata: options?.metadata ? Array.from(options.metadata) : undefined,
      is_default: options?.isDefault,
    },
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Update an existing node.
 */
export async function updateNode(
  sender: ProtocolSender,
  nodeId: string,
  updates: {
    name?: string;
    description?: string;
    mdxContent?: string;
    rules?: string;
    chatEnabled?: boolean;
    isDefault?: boolean;
  },
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    UpdateNode: {
      node_id: nodeId,
      name: updates.name,
      description: updates.description,
      mdx_content: updates.mdxContent,
      rules: updates.rules,
      chat_enabled: updates.chatEnabled,
      is_default: updates.isDefault,
    },
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Delete a node and optionally cascade-delete its children.
 */
export async function deleteNode(
  sender: ProtocolSender,
  nodeId: string,
  cascade: boolean = true
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    DeleteNode: { node_id: nodeId, cascade },
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * List nodes, optionally filtered by parent or entity types.
 */
export async function listNodes(
  sender: ProtocolSender,
  parentId?: string | null,
  entityTypes?: Array<{ Child: string } | 'Workspace'>,
): Promise<void> {
  // `state.loading.nodes` had no writer at all, so it was permanently false and
  // TreeNodesSection's guard — `if (!isLoading && !treeData)` — fired on every
  // workspace open, telling the user "Your workspace is empty. Click the + button
  // to create your first space." while the tree was still in flight. The
  // "Loading..." arm inside that branch is unreachable by construction, which is
  // why it read as correct.
  workspaceResponseHandler.emitLoadingEvent('nodes:loading');
  const requestPart: WorkspaceProtocolRequestTS = {
    ListNodes: {
      parent_id: parentId,
      entity_types: entityTypes,
    },
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get the full tree structure starting from a root node.
 */
export async function getTreeStructure(
  sender: ProtocolSender,
  rootId?: string,
  maxDepth?: number
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetTreeStructure: {
      root_id: rootId ?? null,
      max_depth: maxDepth,
    },
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get the current tree schema (nesting rules).
 */
export async function getTreeSchema(sender: ProtocolSender): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetTreeSchema: null,
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get server file transfer and storage capabilities
 */
export async function getServerCapabilities(sender: ProtocolSender): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetServerCapabilities: null
  };
  return sender.sendProtocolRequest(requestPart);
}
