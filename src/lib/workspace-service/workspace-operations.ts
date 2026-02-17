/**
 * Workspace Service - Workspace Operations
 *
 * Methods for workspace CRUD: load, get, list, create, update.
 */

import type { WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';
import { workspaceResponseHandler } from '@/lib/workspace-response-handler';
import { debugLog } from '@/lib/debug-config';

/** Interface matching WorkspaceService's protocol-send method */
export interface ProtocolSender {
  sendProtocolRequest(request: WorkspaceProtocolRequestTS): Promise<void>;
  readonly currentCid: bigint | null;
}

/**
 * Load workspace data.
 * Triggers a workspace:loaded event when complete.
 */
export async function loadWorkspace(sender: ProtocolSender): Promise<void> {
  debugLog('WorkspaceService', '[WorkspaceService] loadWorkspace called with CID:', sender.currentCid?.toString());
  workspaceResponseHandler.emitLoadingEvent('workspace:loading');
  const requestPart: WorkspaceProtocolRequestTS = { GetWorkspace: null };
  debugLog('WorkspaceService', '[WorkspaceService] Sending GetWorkspace request');
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Get a workspace by ID (defaults to sentinel root workspace)
 */
export async function getWorkspace(sender: ProtocolSender, workspaceId?: string): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    GetWorkspace: { workspace_id: workspaceId ?? null }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * List all workspaces the current user has access to
 */
export async function listWorkspaces(sender: ProtocolSender): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = { ListWorkspaces: null };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Create a new workspace
 */
export async function createWorkspace(
  sender: ProtocolSender,
  name: string,
  description: string,
  masterPassword: string,
  metadata?: Uint8Array
): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = {
    CreateWorkspace: {
      name,
      description,
      workspace_master_password: masterPassword,
      metadata: metadata ? Array.from(metadata) : undefined
    }
  };
  return sender.sendProtocolRequest(requestPart);
}

/**
 * Update an existing workspace
 */
export async function updateWorkspace(
  sender: ProtocolSender,
  name?: string,
  description?: string,
  masterPassword?: string,
  metadata?: Uint8Array
): Promise<void> {
  const requestPart = {
    UpdateWorkspace: {
      name,
      description,
      workspace_master_password: masterPassword,
      metadata: metadata ? Array.from(metadata) : undefined
    }
  } as WorkspaceProtocolRequestTS;
  return sender.sendProtocolRequest(requestPart);
}
