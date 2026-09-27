/**
 * What a workspace-settings save sends: only the fields the owner changed.
 *
 * Unchanged fields stay out of the request. Sending the name back untouched would overwrite a
 * colleague's rename made while the dialog was open. The icon is checked against the server's
 * limit (citadel-workspace-server-kernel `workspace_logo.rs`), so an oversized one is explained
 * here rather than refused after the upload.
 */
import type { WorkspaceProfileChange } from '@/lib/workspace-service/workspace-profile';
import { readyIcon, type IconResult } from '@/lib/workspace-metadata/workspace-icon';

export { MAX_ICON_BYTES } from '@/lib/workspace-metadata/workspace-icon';
/** The server's name limit (MAX_WORKSPACE_NAME_CHARS). */
export const MAX_NAME_CHARS: number = 64;
/** The server's description limit (MAX_WORKSPACE_DESCRIPTION_CHARS). */
export const MAX_DESCRIPTION_CHARS: number = 500;

export interface ProfileForm {
  name: string;
  description: string;
  /** A data URL or bare base64 (what the uploader emits), or null for no icon. */
  icon: string | null;
}

export type ProfileChangeResult = { ok: true; change: WorkspaceProfileChange | null } | { ok: false; reason: string };

export function profileChangeFrom(original: ProfileForm, edited: ProfileForm): ProfileChangeResult {
  const change: WorkspaceProfileChange = {};
  const name: string = edited.name.trim();
  if (name !== original.name.trim()) {
    if (name.length === 0) return { ok: false, reason: 'The workspace needs a name.' };
    change.name = name;
  }
  const description: string = edited.description.trim();
  if (description !== original.description.trim()) change.description = description;

  if (edited.icon === null) {
    if (original.icon !== null) change.logo = 'Clear';
  } else {
    const icon: IconResult = readyIcon(edited.icon);
    if (!icon.ok) return { ok: false, reason: icon.reason };
    if (icon.dataUrl !== original.icon) change.logo = { Set: { data_url: icon.dataUrl } };
  }
  return { ok: true, change: Object.keys(change).length === 0 ? null : change };
}
