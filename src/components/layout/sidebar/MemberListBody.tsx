import { SidebarMenuItem } from '@/components/ui/sidebar';
import { MembersEmptyState } from './MembersEmptyState';
import { MemberListItems } from './MemberListItems';
import type { User as WorkspaceMember } from '@/types/workspace-entities';

interface MemberListBodyProps {
  isLoading: boolean;
  /** The domain the list is for: the selected node, or the workspace root. */
  activeDomainId: string;
  members: WorkspaceMember[];
  peerCount: number;
  membersUnavailable: boolean;
  currentUsername: string | undefined;
  onEditMember: (member: WorkspaceMember) => void;
  onRemoveMember: (member: WorkspaceMember) => void;
  onManagePermissions: (member: WorkspaceMember) => void;
  onShowAllMembers: () => void;
}

/**
 * What the member list shows, given what is known so far.
 *
 * Extracted from MembersSection, which had reached the 250-line limit. The
 * outcomes are one decision — loading, empty, or a list.
 *
 * There is always a domain. `activeDomainId` was `params.get("nodeId")` alone,
 * so on /workspace with no node selected -- the view everyone lands on after
 * signing in -- it was null, nothing was asked, and a guard here rendered
 * nothing at all: no spinner, no empty state, no members. That guard existed
 * because an earlier revision rendered "Nobody else is here yet" for the same
 * null. Both were answers to a question that should not arise: with no node
 * selected the view IS the workspace root, and MembersSection now asks for it.
 */
export function MemberListBody({
  isLoading,
  activeDomainId,
  members,
  peerCount,
  membersUnavailable,
  currentUsername,
  onEditMember,
  onRemoveMember,
  onManagePermissions,
  onShowAllMembers,
}: MemberListBodyProps): JSX.Element | null {
  if (isLoading) {
    return (
      // Named, so a failure can say WHICH of the three branches was on screen.
      // member-list-loading.spec.ts reports the DOM at the moment it sees the
      // empty state, and "loading was absent" and "loading has no testid" are
      // otherwise the same observation.
      <SidebarMenuItem className="px-3 py-2 text-sm text-muted-foreground" data-testid="members-loading">
        Loading members...
      </SidebarMenuItem>
    );
  }
  if (members.length === 0 && peerCount === 0) {
    return <MembersEmptyState unavailable={membersUnavailable} domainId={activeDomainId} />;
  }
  if (members.length === 0) return null;
  return (
    <MemberListItems
      members={members}
      currentUsername={currentUsername}
      onEditMember={onEditMember}
      onRemoveMember={onRemoveMember}
      onManagePermissions={onManagePermissions}
      onShowAllMembers={onShowAllMembers}
    />
  );
}
