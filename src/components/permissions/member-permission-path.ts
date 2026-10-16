/**
 * Where one member's permissions come from, read off the server's answers.
 *
 * The server reports, for each level, what enforcement would allow there:
 * admin short-circuit, direct grant, then inheritance up the parent chain
 * (`GetUserPermissions` in the server kernel). Nothing here re-derives those
 * rules. It only lines the answers up along the path from the workspace down to
 * the node the editor was opened from, and asks which level is the highest one
 * already granting a permission: that level is where it comes from, because a
 * grant there reaches everything beneath it.
 *
 * Level names come from the live schema (`levelLabel`); nothing branches on
 * "Office" or "Room", which are only the default template's words.
 *
 * Pure: the nodes and the answers are the caller's.
 */
import type { DomainNode } from '@/components/layout/sidebar/tree-node-types';
import { workspaceRoot } from '@/components/layout/sidebar/tree-node-utils';
import { ancestorsOf } from '@/components/layout/sidebar/focused-view';
import { levelLabel } from '@/components/layout/sidebar/FocusedTree/level-labels';
import { getEntityMetadata } from '@/lib/entity-type-registry';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import type { PermissionsLoad } from './use-loaded-permissions';

/** One level on the path: its id, its own name, and the schema's name for its kind. */
export interface PermissionLevel {
  id: string;
  name: string;
  kind: string;
}

/** Where a permission the member holds at the edited level comes from — or that they do not hold it. */
export type GrantSource =
  | { kind: 'here' }
  | { kind: 'inherited'; from: PermissionLevel }
  | { kind: 'none' };

/** What an unknown level is called: the tree has not sent it, so there is no name to show. */
export const UNLISTED_LEVEL: string = 'a level not yet loaded';

/** "Office HQ"; just the name when the kind is unknown. */
export const levelPhrase = (level: PermissionLevel): string => [level.kind, level.name].filter(Boolean).join(' ');

const asLevel = (node: DomainNode): PermissionLevel => ({ id: node.id, name: node.name, kind: levelLabel(node) });

/**
 * The workspace first, down to `domainId`; the root itself is the workspace on
 * its own. A domain the tree does not hold stays the level edited -- under the
 * workspace, unnamed -- rather than quietly becoming the workspace.
 */
export function permissionPath(
  nodes: Readonly<Record<string, DomainNode>>,
  domainId: string,
  workspaceName: string,
): PermissionLevel[] {
  const root: DomainNode | null = workspaceRoot(Object.values(nodes), workspaceName);
  const workspace: PermissionLevel = root
    ? asLevel(root)
    : { id: WORKSPACE_ROOT_ID, name: workspaceName, kind: getEntityMetadata('Workspace').label };
  const node: DomainNode | undefined = nodes[domainId];
  // The id asked about is the id edited, whichever of the two names the workspace.
  if (domainId === WORKSPACE_ROOT_ID || domainId === workspace.id) return [{ ...workspace, id: domainId }];
  if (!root || !node) return [workspace, { id: domainId, name: UNLISTED_LEVEL, kind: '' }];
  return [workspace, ...ancestorsOf(nodes, node, root).slice(1).map(asLevel), asLevel(node)];
}

/** Every level answered; until then nothing is known about where a grant comes from. */
export function allLoaded(
  path: readonly PermissionLevel[],
  loads: Readonly<Record<string, PermissionsLoad>>,
): boolean {
  return path.every((level: PermissionLevel): boolean => loads[level.id]?.status === 'loaded');
}

const grants = (load: PermissionsLoad | undefined, permission: string): boolean =>
  load?.status === 'loaded' && load.permissions.has(permission);

/**
 * Where `permission` comes from at the last level of `path`: the highest level
 * above it that already grants it, else the level itself, else nowhere. Null
 * while any level is unanswered.
 */
export function grantSource(
  permission: string,
  path: readonly PermissionLevel[],
  loads: Readonly<Record<string, PermissionsLoad>>,
): GrantSource | null {
  if (!allLoaded(path, loads)) return null;
  const from: PermissionLevel | undefined = path.slice(0, -1).find((level: PermissionLevel): boolean => grants(loads[level.id], permission));
  if (from) return { kind: 'inherited', from };
  return grants(loads[path[path.length - 1].id], permission) ? { kind: 'here' } : { kind: 'none' };
}
