import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, UserPlus, Star } from 'lucide-react';
import { formatPresence } from '@/lib/date-utils';
import { UserRole } from '@/types/workspace-entities';

export interface MemberDisplay {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role?: UserRole;
  isOnline: boolean;
  lastActive?: number;
}

function getRoleBadgeClass(role?: UserRole): string {
  switch (role) {
    case UserRole.Owner:
      return 'bg-purple-500 hover:bg-purple-600';
    case UserRole.Admin:
      return 'bg-blue-500 hover:bg-blue-600';
    case UserRole.Member:
      return 'bg-green-500 hover:bg-green-600';
    case UserRole.Guest:
      return 'bg-gray-500 hover:bg-gray-600';
    default:
      return 'bg-gray-500 hover:bg-gray-600';
  }
}

export { getRoleBadgeClass };

interface MemberListItemProps {
  member: MemberDisplay;
  variant: 'all' | 'online' | 'favorites';
  onSendMessage: (userId: string) => void;
  onInvite: (userId: string) => void;
  /** Show this member in the profile panel. Required — see the note below. */
  onSelect: (userId: string) => void;
}

export function MemberListItem({ member, variant, onSendMessage, onInvite, onSelect }: MemberListItemProps) {
  // The row is selectable. It was not before, while UserProfileCard sat beside it
  // saying "Click on a user or search to view their profile" — so the panel could
  // only ever be filled from the search box, and clicking a name did nothing.
  //
  // The identity half of the row is the button; the action buttons are its
  // siblings, not its children.
  //
  // Making the whole row role="button" tabIndex={0} looked reasonable — it was
  // one clickable row — but a control with focusable descendants is the
  // nested-interactive pattern, and screen readers do not agree on how to
  // present it: the row claims to be one button while containing two more.
  // Splitting it keeps every control reachable and unambiguous, and means the
  // inner buttons no longer need stopPropagation to avoid also selecting.
  return (
    <div className="flex items-center justify-between p-4 hover:bg-card transition-colors">
      <button
        type="button"
        onClick={() => onSelect(member.id)}
        aria-label={`View profile for ${member.displayName}`}
        className="flex items-center space-x-3 flex-1 min-w-0 text-left cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <Avatar className="h-10 w-10 relative">
          <AvatarImage src={member.avatarUrl} />
          <AvatarFallback className="bg-purple-900">{member.displayName.charAt(0)}</AvatarFallback>
          {member.isOnline && (
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card" />
          )}
        </Avatar>
        <div>
          <h3 className="font-medium text-foreground">{member.displayName}</h3>
          <div className="flex items-center space-x-2">
            {member.role && (
              <Badge className={`text-xs ${getRoleBadgeClass(member.role)}`}>
                {member.role}
              </Badge>
            )}
            <span className={`text-xs ${variant === 'online' ? 'text-green-400' : 'text-muted-foreground'}`}>
              {variant === 'online'
                ? 'Online now'
                : formatPresence(member.isOnline, member.lastActive)}
            </span>
          </div>
        </div>
      </button>
      <div className="flex space-x-2">
        {variant === 'favorites' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-purple-400 hover:text-foreground hover:bg-gray-700"
            aria-label={`Unfavourite ${member.displayName}`}
          >
            <Star className="h-4 w-4 fill-current" aria-hidden="true" />
          </Button>
        )}
        {variant !== 'favorites' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-gray-700"
            onClick={() => onInvite(member.id)}
            aria-label={`Send a connection request to ${member.displayName}`}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground hover:bg-gray-700"
          onClick={() => onSendMessage(member.id)}
          aria-label={`Message ${member.displayName}`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
