/**
 * Post-Auth Setup — Single source of truth for workspace initialization after authentication.
 *
 * Consolidates the duplicated setConnectionId → loadWorkspace → listNodes → getTreeSchema
 * pattern that was previously scattered across 5+ files.
 *
 * All callers (login, join, workspace-loader, workspace-switcher, session-redirect)
 * should use this function instead of manually orchestrating these steps.
 */

import WorkspaceService from '@/lib/workspace-service';
import { debugLog } from '@/lib/debug-config';

/**
 * Performs the complete post-authentication workspace setup sequence.
 *
 * @param cid - The connection ID (CID) from the authenticated session.
 * @param options - Optional configuration.
 * @param options.skipTreeSchema - If true, skip fetching tree schema (used by callers that don't need it).
 * @throws If any step fails. Callers should handle errors and display appropriate UI.
 */
export async function postAuthSetup(
  cid: bigint,
  options?: { skipTreeSchema?: boolean }
): Promise<void> {
  debugLog('PostAuthSetup', 'Starting workspace setup for CID:', cid.toString());

  // Step 1: Set the connection ID on the workspace service
  WorkspaceService.setConnectionId(cid);

  // Step 2: Load workspace metadata
  await WorkspaceService.loadWorkspace();

  // Step 3: Load the node hierarchy
  await WorkspaceService.listNodes();

  // Step 4: Load the tree schema (defines entity types and nesting rules)
  if (!options?.skipTreeSchema) {
    await WorkspaceService.getTreeSchema();
  }

  debugLog('PostAuthSetup', 'Workspace setup complete for CID:', cid.toString());
}
