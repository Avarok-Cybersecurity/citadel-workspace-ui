import { SidebarMenuItem } from '@/components/ui/sidebar';
import { MembersEmptyState } from './MembersEmptyState';
import { MemberListItems } from './MemberListItems';
import type { User as WorkspaceMember } from '@/types/workspace-entities';

interface MemberListBodyProps {
  isLoading: boolean;
  /** `null` when no node is selected — see the note below. */
  activeDomainId: string | null;
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
 * Extracted from MembersSection, which had reached the 250-line limit. The four
 * outcomes are one decision — loading, not-asked, empty, or a list — and the
 * rule that governs them is easy to get wrong in exactly one direction:
 *
 *   NOT-ASKED IS NOT EMPTY.
 *
 * `use-domain-members.ts` states that rule for NOT-LOADED ("Not-yet-loaded is
 * not empty") and applies it to the members array. It did not cover the absence
 * of a domain to ask about. `activeDomainId` is `params.get("nodeId")`, so it is
 * null before a node is chosen and across a route change; with no domain,
 * `isLoadingMembers` initialises FALSE — correctly, nothing is loading — and
 * `members` is empty, so the empty branch fired and told the user "Nobody else
 * is here yet" about a workspace nobody had asked about.
 *
 * member-list-loading.spec.ts reproduces it on a node switch, where the null is
 * momentary and the sentence is simply false.
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
  // Nothing has been asked. Say nothing, rather than something false.
  if (activeDomainId === null) return null;
  if (members.length === 0 && peerCount === 0) {
    return <MembersEmptyState unavailable={membersUnavailable} />;
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
