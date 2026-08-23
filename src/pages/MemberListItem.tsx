import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, UserPlus, Star } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { UserRole } from '@/types/workspace-entities';
import { interactive } from '@/lib/a11y';

export interface MemberDisplay {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role?: UserRole;
  isOnline: boolean;
  lastActive: number;
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
  // `interactive` rather than a <button>: this row already contains buttons, and
  // nesting them is invalid HTML. It supplies role/tabIndex/Enter/Space together,
  // and ignores keys that bubbled up from those inner controls.
  return (
    <div
      {...interactive(() => onSelect(member.id))}
      aria-label={`View profile for ${member.displayName}`}
      className="flex items-center justify-between p-4 hover:bg-card transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      <div className="flex items-center space-x-3">
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
                : member.isOnline ? 'Online' : `Last active ${formatRelativeTime(member.lastActive)}`}
            </span>
          </div>
        </div>
      </div>
      <div className="flex space-x-2">
        {variant === 'favorites' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-purple-400 hover:text-foreground hover:bg-gray-700"
          >
            <Star className="h-4 w-4 fill-current" />
          </Button>
        )}
        {variant !== 'favorites' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-gray-700"
            onClick={(e) => { e.stopPropagation(); onInvite(member.id); }}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground hover:bg-gray-700"
          onClick={(e) => { e.stopPropagation(); onSendMessage(member.id); }}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
