/**
 * The member-action gate for one domain, from your role and your RemoveUsers answer there.
 *
 * Wiring only: the rule is `memberActionBlocks`, tested without a store.
 */
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Permission } from '@/contexts/PermissionsContext';
import { usePermission } from '@/hooks/use-permission';
import { memberActionBlocks, type MemberActionBlocks } from './member-actions-gate';

export function useMemberActionBlocks(domainId: string): MemberActionBlocks {
  const { state } = useWorkspace();
  return memberActionBlocks(state.currentUser?.role, usePermission(domainId, Permission.RemoveUsers));
}
