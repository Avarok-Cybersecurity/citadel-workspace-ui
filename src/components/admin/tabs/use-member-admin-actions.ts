import { useCallback, useState } from 'react';
import WorkspaceService from '@/lib/workspace-service';
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
// The tab's own types, not local re-declarations: two structurally similar
// shapes would compile until one of them gained a field. There are two
// `UserRole`s in this tree and they are not interchangeable.
import type { MemberData, UserRole } from '../types';

/**
 * The two writes the admin members tab performs.
 *
 * Extracted to keep the tab under the file cap, and because both had the same
 * defect worth fixing in one place: the catch reported "Failed to update member
 * role" / "Failed to remove member" and sent the server's actual refusal to
 * `debugLog`, which is a no-op outside dev. `awaitWriteResponse` produces
 * precise rejections — "Permission denied: EditTreeStructure required", "Cannot
 * demote the only administrator" — and every one of them was being discarded in
 * favour of a sentence that says only that something went wrong. The user
 * retries forever, because nothing tells them retrying cannot work.
 */
export function useMemberAdminActions(
  entityId: string,
  setMembers: React.Dispatch<React.SetStateAction<MemberData[]>>,
) {
  const [updatingRoles, setUpdatingRoles] = useState<Set<string>>(new Set());

  const reason = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const changeRole = useCallback(
    async (userId: string, newRole: UserRole) => {
      setUpdatingRoles((prev) => new Set(prev).add(userId));
      try {
        await WorkspaceService.updateMemberRole(userId, newRole);
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m)),
        );
        toast({
          title: 'Role Updated',
          description: `Member role updated to ${newRole}`,
          variant: 'success',
        });
      } catch (error) {
        debugLog('MembersTab', 'Failed to update role:', error);
        toast({
          title: 'Could not change that role',
          description: reason(error, 'The server did not accept the change.'),
          variant: 'destructive',
        });
      } finally {
        setUpdatingRoles((prev) => {
          const next: Set<string> = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [setMembers],
  );

  const removeMember = useCallback(
    async (member: MemberData) => {
      try {
        await WorkspaceService.removeMember(member.userId, entityId);
        setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
        toast({
          title: 'Member Removed',
          description: `${member.name || member.username} has been removed`,
          variant: 'success',
        });
      } catch (error) {
        debugLog('MembersTab', 'Failed to remove member:', error);
        toast({
          title: 'Could not remove that member',
          description: reason(error, 'The server did not accept the change.'),
          variant: 'destructive',
        });
      }
    },
    [entityId, setMembers],
  );

  return { updatingRoles, changeRole, removeMember };
}
