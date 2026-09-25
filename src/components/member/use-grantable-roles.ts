/**
 * The role options the member dialog may offer this caller.
 *
 * Every role was offered to everyone, and `ensure_may_grant_role` refused the
 * ones above the caller -- after they had typed a username and pressed Add.
 * The rule lives in lib/role-grant.ts, mirrored from the server; this hook only
 * gathers what it needs: the caller's workspace role and what it holds (the
 * root's GetUserPermissions answer, from the permissions service) and the roles the root roster already
 * holds, which decide whether a seat above the caller is vacant.
 */
import { useMemo } from 'react';
import { useDomainMembers, type DomainMembers } from '@/hooks/use-domain-members';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import { mayGrantRole, type GrantContext } from '@/lib/role-grant';
import { normalizeRole } from '@/lib/role-predicate';
import { permissionsService, type DomainPermissions } from '@/lib/permissions-service';
import type { User as WorkspaceMember } from '@/types/workspace-entities';

export interface RoleOption {
  value: string;
  label: string;
}

/** `options`, less the roles this caller cannot grant. Asks for the roster only while `active`. */
export function useGrantableRoles(options: readonly RoleOption[], active: boolean): RoleOption[] {
  const roster: DomainMembers = useDomainMembers(active ? WORKSPACE_ROOT_ID : null);
  // The service, not the context: read when the dialog renders, which is when
  // it opens. The Add button's own AddUsers check has fetched the root by then.
  const root: DomainPermissions | null = permissionsService.getPermissions(WORKSPACE_ROOT_ID);
  const actorRole: GrantContext['actorRole'] = root ? root.role : null;
  const rosterKnown: boolean = active && !roster.isLoadingMembers && !roster.membersUnavailable;

  return useMemo((): RoleOption[] => {
    const occupiedRoles: Set<string> | null = rosterKnown
      ? new Set(
          roster.members
            .map((member: WorkspaceMember): string | null => normalizeRole(member.role))
            .filter((role: string | null): role is string => role !== null),
        )
      : null;
    const context: GrantContext = {
      actorRole,
      actorPermissions: root ? root.permissions : null,
      occupiedRoles,
    };
    return options.filter((option: RoleOption): boolean => mayGrantRole(option.value, context));
  }, [options, actorRole, root, rosterKnown, roster.members]);
}
