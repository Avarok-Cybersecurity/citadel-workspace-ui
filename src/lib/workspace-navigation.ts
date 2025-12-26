/**
 * Workspace Navigation Service
 *
 * Manages the active workspace ID for navigation.
 * Provides a centralized way to navigate to the workspace route
 * with the correct workspace ID.
 */

class WorkspaceNavigation {
  private static instance: WorkspaceNavigation;
  private activeWorkspaceId: string = 'root';

  private constructor() {}

  public static getInstance(): WorkspaceNavigation {
    if (!WorkspaceNavigation.instance) {
      WorkspaceNavigation.instance = new WorkspaceNavigation();
    }
    return WorkspaceNavigation.instance;
  }

  /**
   * Get the current active workspace ID
   */
  public getActiveWorkspaceId(): string {
    return this.activeWorkspaceId;
  }

  /**
   * Set the active workspace ID
   */
  public setActiveWorkspaceId(id: string): void {
    this.activeWorkspaceId = id;
  }

  /**
   * Get the workspace route path with the current active workspace ID
   * @param additionalParams Optional additional query parameters
   */
  public getWorkspacePath(additionalParams?: Record<string, string>): string {
    const params = new URLSearchParams();
    params.set('id', this.activeWorkspaceId);

    if (additionalParams) {
      for (const [key, value] of Object.entries(additionalParams)) {
        params.set(key, value);
      }
    }

    return `/workspace?${params.toString()}`;
  }

  /**
   * Build workspace path preserving existing query params but ensuring id is set
   * @param existingParams URLSearchParams from current location
   */
  public buildWorkspacePath(existingParams?: URLSearchParams): string {
    const params = existingParams ? new URLSearchParams(existingParams) : new URLSearchParams();

    // Always ensure the workspace id is set
    if (!params.has('id')) {
      params.set('id', this.activeWorkspaceId);
    }

    return `/workspace?${params.toString()}`;
  }
}

// Export singleton instance
export const workspaceNavigation = WorkspaceNavigation.getInstance();

// Export helper function for convenience
export function getWorkspacePath(additionalParams?: Record<string, string>): string {
  return workspaceNavigation.getWorkspacePath(additionalParams);
}

export function buildWorkspacePath(existingParams?: URLSearchParams): string {
  return workspaceNavigation.buildWorkspacePath(existingParams);
}
