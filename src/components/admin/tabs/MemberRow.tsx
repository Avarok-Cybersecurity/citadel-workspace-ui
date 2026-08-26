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

/**
 * Dot colours, not badge classes — these tint a small indicator that carries no
 * text, which is why they stay fills rather than going through roleBadgeClass.
 *
 * `bg-black` was a literal that survived the palette migration because black is
 * not a hue name in the lint guard's list; in a light theme it was the only
 * pure-black mark on the screen. `foreground` is the theme's own ink.
 */
const ROLE_COLORS: Record<UserRole, string> = {
  Admin: 'bg-destructive',
  Owner: 'bg-warning',
  Member: 'bg-primary',
  Guest: 'bg-muted-foreground',
  Banned: 'bg-foreground',
};

interface MemberRowProps {
  member: MemberData;
  showAdvanced: boolean;
  isUpdatingRole: boolean;
  /**
   * This member is the workspace's only administrator.
   *
   * Demoting or removing them leaves nobody able to manage the workspace, and
   * there is no way back: promotion requires an admin. The server refuses both
   * operations, so this only decides whether the controls look available —
   * offering an action that will be rejected is worse than not offering it.
   */
  isOnlyAdmin: boolean;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  onAdvancedPermissions: (member: MemberData) => void;
  onRemove: (member: MemberData) => void;
}

export { ROLE_COLORS };

export function MemberRow({
  member,
  showAdvanced,
  isUpdatingRole,
  isOnlyAdmin,
  onRoleChange,
  onAdvancedPermissions,
  onRemove,
}: MemberRowProps) {
  const lastAdminReason =
    'This is the only administrator. Promote another member to Admin first.';
  return (
    <div
      className="flex items-center justify-between p-3 bg-card rounded-lg"
      data-testid={`member-row-${member.userId}`}
    >
      {/* min-w-0 + truncate here, shrink-0 on the controls opposite.
          A flex child's min-width defaults to its content, so a long username —
          generated handles here run past 20 characters — refused to shrink and
          pushed the role selector and the remove button off a 375px screen. The
          controls are the entire point of the row, so they are the last thing
          that may give way. Same reasoning as the TopBar header group. */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={member.avatarUrl || ''} />
          <AvatarFallback className="bg-card text-foreground">
            {getUserInitials(member.name || member.username)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-foreground font-medium truncate">
            {member.name || member.username}
          </div>
          {member.name && (
            <div className="text-muted-foreground text-sm truncate">@{member.username}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showAdvanced ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdvancedPermissions(member)}
            className="border-primary-accent text-primary-accent hover:bg-primary-accent/20"
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
              className="w-32 bg-card border-border text-foreground"
              data-testid={`member-role-select-${member.userId}`}
            >
              {isUpdatingRole ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {USER_ROLES.map((role) => (
                <SelectItem
                  key={role}
                  value={role}
                  // Every role but Admin is a demotion for the last admin, and
                  // the server rejects it. Leaving Admin selectable keeps the
                  // current value visible in the trigger.
                  disabled={isOnlyAdmin && role !== 'Admin'}
                >
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
          disabled={isOnlyAdmin}
          title={isOnlyAdmin ? lastAdminReason : `Remove ${member.username}`}
          aria-label={isOnlyAdmin ? lastAdminReason : `Remove ${member.username}`}
          className="text-destructive hover:text-destructive hover:bg-destructive/15"
          data-testid={`member-remove-${member.userId}`}
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
