/**
 * Workspace Response Handler - Workspace / Member Handlers
 *
 * Handles workspace CRUD, member management, permission, success/error,
 * and server-capabilities WorkspaceProtocolResponse variants.
 * Tree node variants are delegated to node-handlers.ts.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';
import { isVariant } from 'citadel-workspace-client-ts';
import type { WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';

import { handleNodeVariants } from './node-handlers';

/** Minimal connection context attached to every emitted event. */
export interface ConnectionInfo {
  cid: number;
  request_id: string;
}

export function buildConnectionInfo(): ConnectionInfo {
  return {
    cid: 0,
    request_id: crypto.randomUUID(),
  };
}

/**
 * Try to handle workspace, member, node, permission, success/error, and
 * server-capabilities response variants.
 *
 * Returns `true` if the response was handled.
 */
export function handleWorkspaceVariants(
  response: WorkspaceProtocolResponse,
  connectionInfo: ConnectionInfo,
): boolean {
  // --- String literal responses (e.g. "WorkspaceNotInitialized") ---
  if (typeof response === 'string') {
    return handleStringResponse(response, connectionInfo);
  }

  // TYPE-GAP variants (runtime-only, not in generated type) checked via 'in'
  if (handleTypeGapVariants(response, connectionInfo)) return true;

  // Generated-type variants checked via isVariant()
  if (handleGeneratedVariants(response, connectionInfo)) return true;

  // Tree node variants (delegated)
  if (handleNodeVariants(response, connectionInfo)) return true;

  return false;
}

// ─── String Literals ────────────────────────────────────────────────

function handleStringResponse(response: string, connectionInfo: ConnectionInfo): boolean {
  if (response === 'WorkspaceNotInitialized') {
    debugLog('WorkspaceResponseHandler', 'Workspace not initialized (string literal)');
    eventEmitter.emit('workspace:not-initialized', connectionInfo);
  } else {
    debugLog('WorkspaceResponseHandler', 'Unhandled string response:', response);
  }
  return true;
}

// ─── TYPE-GAP Variants (runtime-only) ───────────────────────────────

function handleTypeGapVariants(
  response: Exclude<WorkspaceProtocolResponse, string>,
  connectionInfo: ConnectionInfo,
): boolean {
  const rec = response as Record<string, Record<string, unknown>>;

  if ('CreateWorkspace' in response) {
    const ws = rec.CreateWorkspace;
    debugLog('WorkspaceResponseHandler', 'CreateWorkspace response', ws);
    const payload = {
      workspace: { id: ws.id, name: ws.name, description: ws.description, metadata: ws.metadata || [] },
      connection: connectionInfo,
    };
    eventEmitter.emit('workspace:created', payload);
    eventEmitter.emit('workspace:loaded', payload);
    return true;
  }

  if ('AddMember' in response) {
    const member = rec.AddMember;
    debugLog('WorkspaceResponseHandler', 'AddMember response', member);
    eventEmitter.emit('member:added', { member, connection: connectionInfo });
    eventEmitter.emit('members:reload', connectionInfo);
    return true;
  }

  if ('UpdateMemberRole' in response) {
    const data = rec.UpdateMemberRole;
    debugLog('WorkspaceResponseHandler', 'UpdateMemberRole response', data);
    eventEmitter.emit('member:role-updated', {
      userId: data.user_id, role: data.role, connection: connectionInfo,
    });
    eventEmitter.emit('members:reload', connectionInfo);
    return true;
  }

  if ('RemoveMember' in response) {
    const data = rec.RemoveMember;
    debugLog('WorkspaceResponseHandler', 'RemoveMember response', data);
    eventEmitter.emit('member:removed', { userId: data.user_id, connection: connectionInfo });
    eventEmitter.emit('members:reload', connectionInfo);
    return true;
  }

  if ('WorkspaceError' in response) {
    const wsError = (response as Record<string, unknown>).WorkspaceError;
    if (wsError === 'WorkspaceNotInitialized') {
      eventEmitter.emit('workspace:not-initialized', connectionInfo);
    } else {
      eventEmitter.emit('workspace:error', { error: wsError, connection: connectionInfo });
    }
    return true;
  }

  return false;
}

// ─── Generated-type Variants (via isVariant) ────────────────────────

function handleGeneratedVariants(
  response: WorkspaceProtocolResponse,
  connectionInfo: ConnectionInfo,
): boolean {
  if (isVariant(response, 'Workspaces')) {
    eventEmitter.emit('workspaces:listed', {
      workspaces: response.Workspaces, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'Workspace')) {
    eventEmitter.emit('workspace:loaded', {
      workspace: {
        id: response.Workspace.id,
        name: response.Workspace.name,
        description: response.Workspace.description,
        metadata: response.Workspace.metadata || [],
      },
      connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'Members')) {
    eventEmitter.emit('members:loaded', {
      members: response.Members, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'Member')) {
    eventEmitter.emit('member:loaded', {
      member: response.Member, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'Success')) {
    eventEmitter.emit('operation:success', connectionInfo);
    if (response.Success.includes('deleted')) {
      eventEmitter.emit('operation:deleted', connectionInfo);
    }
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'Error')) {
    eventEmitter.emit('operation:error', {
      message: response.Error, connection: connectionInfo,
    });
    eventEmitter.emit('workspace:raw-response', response);
    return true;
  }

  if (isVariant(response, 'UserPermissions')) {
    const { user_id, role, permissions, domain_id } = response.UserPermissions;
    debugLog('WorkspaceResponseHandler', 'UserPermissions received', { user_id, role, domain_id });
    eventEmitter.emit('user:permissions:loaded', {
      userId: user_id, role, permissions, domainId: domain_id, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'MemberRoleUpdated')) {
    const { user_id, new_role } = response.MemberRoleUpdated;
    debugLog('WorkspaceResponseHandler', 'MemberRoleUpdated received', { user_id, new_role });
    eventEmitter.emit('member:role-updated', {
      userId: user_id, role: new_role, connection: connectionInfo,
    });
    return true;
  }

  if (isVariant(response, 'UserProfileUpdated')) {
    const user = response.UserProfileUpdated;
    debugLog('WorkspaceResponseHandler', 'UserProfileUpdated received', {
      userId: user.id, name: user.name,
    });
    eventEmitter.emit('user:profile-updated', { user, connection: connectionInfo });
    return true;
  }

  if (isVariant(response, 'ServerCapabilities')) {
    const caps = response.ServerCapabilities;
    debugLog('WorkspaceResponseHandler', 'ServerCapabilities received', caps);
    eventEmitter.emit('server:capabilities:loaded', {
      allowServerFileTransfer: caps.allow_server_file_transfer,
      allowServerRevfsStorage: caps.allow_server_revfs_storage,
      maxFileTransferSizeMb: Number(caps.max_file_transfer_size_mb),
      revfsStorageQuotaMb: Number(caps.revfs_storage_quota_mb),
      connection: connectionInfo,
    });
    return true;
  }

  return false;
}
