/**
 * Workspace Navigation Service
 *
 * Builds the `/workspace` route, preserving whatever query parameters the
 * caller already has.
 *
 * It used to stamp `?id=<activeWorkspaceId>` into every path it built. That
 * parameter was read by nobody — the only params anything in the app reads are
 * `nodeId`, `section`, `showP2P`, `channel`, `p2pUser` and `join` — and its
 * value was always the literal string `'root'`, because `setActiveWorkspaceId`
 * had no callers either. Both ends of the feature were absent; only the URL
 * pollution was real.
 *
 * That made every shared link actively wrong: `/workspace?id=root&nodeId=…`
 * looks like it identifies a workspace, so pasting one to a colleague in a
 * DIFFERENT workspace opened THEIR workspace with your node id — a link that
 * appears to address something specific and silently addresses whatever the
 * recipient happens to be in.
 *
 * Removed rather than wired up: a real workspace-scoped link needs the id in
 * the ROUTE and a loader that honours it, which is a routing change, not a
 * query parameter. Leaving a parameter that claims to identify something it
 * does not is worse than having none.
 */

class WorkspaceNavigation {
  private static instance: WorkspaceNavigation;

  private constructor() {}

  public static getInstance(): WorkspaceNavigation {
    if (!WorkspaceNavigation.instance) {
      WorkspaceNavigation.instance = new WorkspaceNavigation();
    }
    return WorkspaceNavigation.instance;
  }

  /**
   * The workspace route, with any additional query parameters.
   */
  public getWorkspacePath(additionalParams?: Record<string, string>): string {
    const params = new URLSearchParams(additionalParams);
    const query: string = params.toString();
    return query ? `/workspace?${query}` : '/workspace';
  }

  /**
   * The workspace route, preserving the caller's existing query parameters.
   */
  public buildWorkspacePath(existingParams?: URLSearchParams): string {
    const params = existingParams ? new URLSearchParams(existingParams) : new URLSearchParams();
    // A stale `id` from a link someone shared before this was removed would
    // otherwise ride along forever.
    params.delete('id');
    const query: string = params.toString();
    return query ? `/workspace?${query}` : '/workspace';
  }
}

// Export singleton instance
export const workspaceNavigation: WorkspaceNavigation = WorkspaceNavigation.getInstance();

// Export helper function for convenience
export function getWorkspacePath(additionalParams?: Record<string, string>): string {
  return workspaceNavigation.getWorkspacePath(additionalParams);
}

export function buildWorkspacePath(existingParams?: URLSearchParams): string {
  return workspaceNavigation.buildWorkspacePath(existingParams);
}
