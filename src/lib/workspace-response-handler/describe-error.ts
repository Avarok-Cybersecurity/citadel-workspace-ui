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
/**
 * Permission denials, as sentences rather than variant names.
 *
 * A refusal used to render as `PermissionDenied: EditTreeStructure required` —
 * the enum name, in a toast, to someone who has never seen the permission
 * matrix. It reads like compiler output and tells them nothing about what to do
 * (which is: ask an administrator). The permission NAMES also differ from the
 * labels the matrix itself shows, so even a user who had seen that screen could
 * not match the two.
 */
const PERMISSION_SENTENCE: Record<string, string> = {
  EditTreeStructure:
    'You do not have permission to add, rename, move or delete offices and rooms here. An administrator can grant it.',
  EditMdx:
    'You do not have permission to edit this document. An administrator can grant it.',
  ViewContent: 'You do not have permission to view this.',
  ManageMembers:
    'You do not have permission to manage members here. An administrator can grant it.',
  ManagePermissions:
    'You do not have permission to change permissions here. An administrator can grant it.',
  SendMessages: 'You do not have permission to post here.',
  ManageWorkspace:
    'You do not have permission to change workspace settings. An administrator can grant it.',
};

/** The permission a `PermissionDenied` detail names, if it names one. */
function permissionFrom(detail: string): string | undefined {
  return Object.keys(PERMISSION_SENTENCE).find((name) => detail.includes(name));
}

export function describeWorkspaceError(wsError: unknown): string {
  if (typeof wsError === 'string') return wsError;

  if (wsError && typeof wsError === 'object') {
    const [variant, detail] = Object.entries(wsError as Record<string, unknown>)[0] ?? [];

    if (variant === 'PermissionDenied' && typeof detail === 'string') {
      const permission: string | undefined = permissionFrom(detail);
      if (permission) return PERMISSION_SENTENCE[permission];
      return 'You do not have permission to do that here.';
    }

    if (variant && typeof detail === 'string' && detail) return `${variant}: ${detail}`;
    if (variant) return String(variant);
  }

  return 'The server rejected the request.';
}
