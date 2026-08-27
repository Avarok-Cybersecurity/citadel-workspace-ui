/**
 * Workspace / member response handlers: workspace CRUD, members, permissions,
 * success/error and server capabilities. Tree nodes go to node-handlers.ts.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { describeWorkspaceError } from './describe-error';
import { handleGeneratedVariants } from './generated-variant-handlers';
import { debugLog } from '@/lib/debug-config';
import type { WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';

import { handleNodeVariants } from './node-handlers';

// Re-exported for callers that import via this module's public surface.
export { mapWasmMember, type MappedMember } from './member-mapping';

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
      // Both channels: `workspace:error` has never had a subscriber, so
      // permission-denied was dropped; `operation:error` reaches ErrorDisplay.
      eventEmitter.emit('workspace:error', { error: wsError, connection: connectionInfo });
      eventEmitter.emit('operation:error', {
        message: describeWorkspaceError(wsError),
        connection: connectionInfo,
      });
    }
    return true;
  }

  return false;
}

// ─── Generated-type Variants (via isVariant) ────────────────────────
