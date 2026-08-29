/**
 * The two actions at the top of the members list.
 *
 * There was one, and it was the wrong one to have alone: "find people already
 * in this workspace". The product had no answer at all to "get somebody into
 * this workspace" — no invite link, no share surface, no copy button — so the
 * first person to set one up, wanting their teammate in, found nothing.
 *
 * Two verbs, because they are two different things and a user with neither
 * cannot tell which they need.
 */

import { Share2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MembersHeaderActionsProps {
  onDiscover: () => void;
  onInvite: () => void;
}

const ACTION_CLASS: "h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground" =
  'h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground';

export function MembersHeaderActions({ onDiscover, onInvite }: MembersHeaderActionsProps): JSX.Element {
  return (
    <div className="flex items-center" data-testid="members-header-actions">
      <Button
        variant="ghost"
        size="icon"
        className={ACTION_CLASS}
        onClick={onDiscover}
        aria-label="Find people already in this workspace"
        title="Find people already in this workspace"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={ACTION_CLASS}
        onClick={onInvite}
        aria-label="Invite someone to this workspace"
        title="Invite someone to this workspace"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
