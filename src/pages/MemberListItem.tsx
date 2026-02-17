import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, UserPlus, Star } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { UserRole } from '@/types/workspace-entities';

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
}

export function MemberListItem({ member, variant, onSendMessage, onInvite }: MemberListItemProps) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-[#444A6C] transition-colors">
      <div className="flex items-center space-x-3">
        <Avatar className="h-10 w-10 relative">
          <AvatarImage src={member.avatarUrl} />
          <AvatarFallback className="bg-purple-900">{member.displayName.charAt(0)}</AvatarFallback>
          {member.isOnline && (
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#343A5C]" />
          )}
        </Avatar>
        <div>
          <h3 className="font-medium text-white">{member.displayName}</h3>
          <div className="flex items-center space-x-2">
            {member.role && (
              <Badge className={`text-xs ${getRoleBadgeClass(member.role)}`}>
                {member.role}
              </Badge>
            )}
            <span className={`text-xs ${variant === 'online' ? 'text-green-400' : 'text-gray-400'}`}>
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
            className="text-purple-400 hover:text-white hover:bg-gray-700"
          >
            <Star className="h-4 w-4 fill-current" />
          </Button>
        )}
        {variant !== 'favorites' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white hover:bg-gray-700"
            onClick={() => onInvite(member.id)}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white hover:bg-gray-700"
          onClick={() => onSendMessage(member.id)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
