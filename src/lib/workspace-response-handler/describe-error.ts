/**
 * Rendering a server `WorkspaceError` for a human.
 *
 * Extracted from workspace-handlers.ts to keep that module under the repo's
 * 250-line cap.
 */
/**
 * A server `WorkspaceError` as a sentence a user can act on.
 *
 * The variant arrives either as a bare string ("PermissionDenied") or as a
 * single-key object carrying detail ({ PermissionDenied: "EditMdx required" }).
 * Both are rendered rather than stringified into "[object Object]".
 */
export function describeWorkspaceError(wsError: unknown): string {
  if (typeof wsError === 'string') return wsError;
  if (wsError && typeof wsError === 'object') {
    const [variant, detail] = Object.entries(wsError as Record<string, unknown>)[0] ?? [];
    if (variant && typeof detail === 'string' && detail) return `${variant}: ${detail}`;
    if (variant) return String(variant);
  }
  return 'The server rejected the request.';
}
