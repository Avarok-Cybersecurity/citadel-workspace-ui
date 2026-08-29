/**
 * UI presentation for the permission model.
 *
 * The model itself is not defined here. `Permission`, `PERMISSION_LABELS`,
 * `PERMISSION_CATEGORIES` and `ROLE_DEFAULT_PERMISSIONS` live in
 * `lib/permissions-service/types.ts`, which mirrors the Rust enum in
 * citadel-workspace-types. This file adds the one thing that is genuinely
 * UI-only — a sentence of explanatory copy per permission — and reshapes the
 * canonical categories into what the permission matrix renders.
 *
 * It used to hold a second, hand-written copy of both the category list and the
 * role defaults, and both had drifted: the categories covered 16 of the 27
 * permissions, so the matrix could not grant the rest at all, and the defaults
 * offered Member `EditContent`, which the server refuses. An administrator was
 * shown a role that did not exist. scripts/check-permission-parity.mjs now fails
 * the build if the mirror and the Rust enum disagree.
 */
import {
  Permission,
  PERMISSION_LABELS,
  PERMISSION_CATEGORIES as CANONICAL_CATEGORIES,
  ROLE_DEFAULT_PERMISSIONS,
} from '@/lib/permissions-service/types';

/** Permission definition for UI display. */
export interface PermissionDefinition {
  id: string;
  label: string;
  description: string;
}

/** What each permission lets someone do, in a sentence. */
const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  [Permission.All]: 'Every permission, including any added later',
  [Permission.ViewContent]: 'Can view content in this domain',
  [Permission.EditContent]: 'Can modify content',
  [Permission.EditMdx]: 'Can edit MDX documents',
  [Permission.SendMessages]: 'Can send messages',
  [Permission.ReadMessages]: 'Can read messages',
  [Permission.UploadFiles]: 'Can upload files',
  [Permission.DownloadFiles]: 'Can download files',
  [Permission.CreateNode]: 'Can create new nodes',
  [Permission.DeleteNode]: 'Can delete nodes',
  [Permission.UpdateNode]: 'Can update node settings',
  [Permission.AddNode]: 'Can add nodes to this domain',
  [Permission.EditNodeConfig]: 'Can change a node’s configuration',
  [Permission.UpdateNodeSettings]: 'Can change a node’s settings',
  [Permission.ManageNodeMembers]: 'Can add and remove a node’s members',
  [Permission.EditTreeStructure]: 'Can move, nest and reorder nodes',
  [Permission.ManageNodeTypes]: 'Can define which node types exist',
  [Permission.CreateWorkspace]: 'Can create workspaces',
  [Permission.UpdateWorkspace]: 'Can rename and update the workspace',
  [Permission.DeleteWorkspace]: 'Can delete the workspace',
  [Permission.EditWorkspaceConfig]: 'Can change workspace configuration',
  [Permission.Themes]: 'Can change the theme every member sees',
  [Permission.AddUsers]: 'Can add new members',
  [Permission.RemoveUsers]: 'Can remove members',
  [Permission.BanUser]: 'Can ban users from the domain',
  [Permission.ManageDomains]: 'Full domain management',
  [Permission.ConfigureSystem]: 'Server-level configuration',
};

/**
 * Organized permission categories for the PermissionManager UI, keyed by the
 * heading the matrix shows. Derived from the canonical grouping so a new
 * permission appears in the matrix as soon as it is categorised.
 */
export const PERMISSION_CATEGORIES: Record<string, PermissionDefinition[]> =
  Object.fromEntries(
    Object.values(CANONICAL_CATEGORIES).map((category) => [
      category.label,
      category.permissions.map((permission) => ({
        id: permission,
        label: PERMISSION_LABELS[permission],
        description: PERMISSION_DESCRIPTIONS[permission],
      })),
    ]),
  );

/** Visual role hierarchy for the role selector dropdown. */
export const ROLE_HIERARCHY: { value: string; label: string; color: string; }[] = [
  { value: 'Admin', label: 'Administrator', color: 'bg-destructive' },
  { value: 'Owner', label: 'Owner', color: 'bg-warning' },
  { value: 'Member', label: 'Member', color: 'bg-primary-accent' },
  { value: 'Guest', label: 'Guest', color: 'bg-muted-foreground' },
];

/**
 * Returns the default permission IDs granted to a given role.
 *
 * These are the server's own role defaults, so what the matrix pre-ticks is what
 * the role actually means rather than a second opinion about it.
 */
export function getRoleDefaultPermissions(role: string): string[] {
  return ROLE_DEFAULT_PERMISSIONS[role] ?? [];
}
