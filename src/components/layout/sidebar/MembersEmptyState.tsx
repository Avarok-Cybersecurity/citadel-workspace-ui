import { SidebarMenuItem } from '@/components/ui/sidebar';

/**
 * What the member list says when it has nobody to show.
 *
 * Two different situations, and they were rendered as one. An empty list drew
 * "Nobody else is here yet. Invite someone with the share button above" — a
 * claim about the workspace — and a member load that FAILED left the list empty
 * too, so a request that never arrived was reported as a fact about who is in
 * the room.
 *
 * `use-domain-members` already carries the distinction: its timeout note frames
 * the choice as an indefinite spinner versus that empty state, and there is a
 * third answer, which is to say what happened.
 */
export function MembersEmptyState({ unavailable }: { unavailable: boolean }): JSX.Element {
  if (unavailable) {
    return (
      <SidebarMenuItem
        className="px-3 py-2 text-sm text-muted-foreground"
        data-testid="members-unavailable"
      >
        The people in this workspace could not be loaded. Nobody has been ruled out — open
        another node and come back, or reload, to try again.
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem className="px-3 py-2 text-sm text-muted-foreground" data-testid="members-empty">
      Nobody else is here yet. Invite someone with the share button above, or use the add
      button to find people who have already joined.
    </SidebarMenuItem>
  );
}
