/**
 * Workspace Service - Member Operations
 *
 * Methods for member management: add, get, update, remove, list,
 * and permission management.
 */

import type {
  WorkspaceProtocolRequestTS,
  PermissionTS,
  UpdateOperationTS,
  UserRoleTS,
} from '@/types/workspace-protocol';
import { workspaceResponseHandler } from '@/lib/workspace-response-handler';
import type { ProtocolSender } from './workspace-operations';

/**
 * Add a member to a domain node
 */
export async function addMember(
  sender: ProtocolSender,
  userId: string,
  role: UserRoleTS,
  domainId?: string,
  metadata?: Uint8Array
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    AddMember: {
      user_id: userId,
      domain_id: domainId,
      role,
      metadata: metadata ? Array.from(metadata) : undefined
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get a member by ID
 */
export async function getMember(sender: ProtocolSender, userId: string): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetMember: { user_id: userId }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Update a member's role
 */
export async function updateMemberRole(
  sender: ProtocolSender,
  userId: string,
  role: string,
  metadata?: Uint8Array
): Promise<unknown> {
  const requestPart = {
    UpdateMemberRole: {
      user_id: userId,
      role,
      metadata: metadata ? Array.from(metadata) : undefined
    }
  } as WorkspaceProtocolRequestTS;
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Update a member's permissions
 */
export async function updateMemberPermissions(
  sender: ProtocolSender,
  userId: string,
  domainId: string,
  permissions: PermissionTS[],
  operation: UpdateOperationTS
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    UpdateMemberPermissions: {
      user_id: userId,
      domain_id: domainId,
      permissions,
      operation
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Remove a member from a domain node
 */
export async function removeMember(
  sender: ProtocolSender,
  userId: string,
  domainId?: string
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    RemoveMember: {
      user_id: userId,
      domain_id: domainId
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * List members in a workspace or domain node
 */
export async function listMembers(sender: ProtocolSender, domainId?: string): Promise<void> {
  // Same dead-flag problem as ListNodes: nothing ever emitted 'members:loading',
  // so every member list rendered its empty state as a statement of fact while
  // the request was still on the wire.
  workspaceResponseHandler.emitLoadingEvent('members:loading', { domainId });
  const requestPart: WorkspaceProtocolRequestTS = {
    ListMembers: { domain_id: domainId }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get a user's permissions for a specific domain
 */
export async function getUserPermissions(
  sender: ProtocolSender,
  userId: string,
  domainId: string
): Promise<void> {
  const requestPart = {
    GetUserPermissions: {
      user_id: userId,
      domain_id: domainId
    }
  } as WorkspaceProtocolRequestTS;
  return sender.sendProtocolRequest(requestPart);
}
