/**
 * MemberRow sub-component for MembersTab.
 * Renders a single member row with avatar, role selector, and actions.
 */

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserMinus, Shield } from 'lucide-react';
import { getUserInitials } from '@/lib/workspace-metadata-service';
import type { MemberData, UserRole } from '../types';
import { USER_ROLES } from '../types';

const ROLE_COLORS: Record<UserRole, string> = {
  Admin: 'bg-red-500',
  Owner: 'bg-orange-500',
  Member: 'bg-blue-500',
  Guest: 'bg-gray-500',
  Banned: 'bg-black',
};

interface MemberRowProps {
  member: MemberData;
  showAdvanced: boolean;
  isUpdatingRole: boolean;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  onAdvancedPermissions: (member: MemberData) => void;
  onRemove: (member: MemberData) => void;
}

export { ROLE_COLORS };

export function MemberRow({
  member,
  showAdvanced,
  isUpdatingRole,
  onRoleChange,
  onAdvancedPermissions,
  onRemove,
}: MemberRowProps) {
  return (
    <div
      className="flex items-center justify-between p-3 bg-card rounded-lg"
      data-testid={`member-row-${member.userId}`}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.avatarUrl || ''} />
          <AvatarFallback className="bg-card text-foreground">
            {getUserInitials(member.name || member.username)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="text-foreground font-medium">
            {member.name || member.username}
          </div>
          {member.name && (
            <div className="text-muted-foreground text-sm">@{member.username}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showAdvanced ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdvancedPermissions(member)}
            className="border-purple-600 text-purple-400 hover:bg-purple-600/20"
            data-testid={`member-permissions-${member.userId}`}
          >
            <Shield className="h-4 w-4 mr-1" />
            Permissions
          </Button>
        ) : (
          <Select
            value={member.role}
            onValueChange={(value) => onRoleChange(member.userId, value as UserRole)}
            disabled={isUpdatingRole}
          >
            <SelectTrigger
              className="w-32 bg-card border-gray-600 text-foreground"
              data-testid={`member-role-select-${member.userId}`}
            >
              {isUpdatingRole ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent className="bg-card border-gray-600">
              {USER_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${ROLE_COLORS[role]}`} />
                    {role}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(member)}
          className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
          data-testid={`member-remove-${member.userId}`}
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
