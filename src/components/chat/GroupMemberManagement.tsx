/**
 * GroupMemberManagement Component
 *
 * Displays and manages group members with role assignment and kick functionality.
 * Respects role hierarchy for actions.
 */

import { useState, useMemo, useCallback } from 'react';
import { UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { GroupMemberWithRole } from '@/types/group';
import { useGroupPermissions } from '@/hooks/use-group-permissions';
import { getRoleIcon, getAvatarColor } from './GroupMemberManagementHelpers';
import type { GroupMemberManagementProps } from './GroupMemberManagementHelpers';
import { KickConfirmDialog } from './KickConfirmDialog';

// ============================================================================
// Component
// ============================================================================

export function GroupMemberManagement({
  group,
  onRoleChange,
  onKickMember,
}: GroupMemberManagementProps) {
  const { can, canManageMember, canAssignRole } = useGroupPermissions(group);
  const [memberToKick, setMemberToKick] = useState<GroupMemberWithRole | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  // Get members with resolved roles, sorted by hierarchy
  const sortedMembers = useMemo(() => {
    return [...group.members]
      .flatMap(member => {
        const role = group.settings.roles.find(r => r.id === member.roleId);
        if (!role) return [];
        return [{ ...member, role } as GroupMemberWithRole];
      })
      .sort((a, b) => {
        if (a.role.position !== b.role.position) {
          return b.role.position - a.role.position;
        }
        return a.username.localeCompare(b.username);
      });
  }, [group.members, group.settings.roles]);

  // Roles that can be assigned (excludes built-in owner role)
  const assignableRoles = useMemo(() => {
    return group.settings.roles
      .filter(r => !r.isBuiltIn)
      .sort((a, b) => b.position - a.position);
  }, [group.settings.roles]);

  // Handle role change
  const handleRoleChange = useCallback(
    async (member: GroupMemberWithRole, newRoleId: string) => {
      if (newRoleId !== member.roleId) {
        await onRoleChange(member.cid.toString(), newRoleId);
      }
    },
    [onRoleChange]
  );

  // Handle kick confirmation
  const handleKickConfirm = async () => {
    if (!memberToKick) return;

    setIsKicking(true);
    try {
      await onKickMember(memberToKick.cid.toString());
    } finally {
      setIsKicking(false);
      setMemberToKick(null);
    }
  };

  // Check what actions are available for a member
  const canKick = can('kickMembers');
  const canAssign = can('assignRoles');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Members ({group.members.length})
        </h3>
      </div>

      {/* Member Table */}
      <ScrollArea className="max-h-[400px]">
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground h-10">Member</TableHead>
                <TableHead className="text-muted-foreground h-10 w-40">Role</TableHead>
                {canKick && (
                  <TableHead className="text-muted-foreground h-10 w-20 text-right">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((member, index) => {
                const isOwnerMember = member.cid === group.ownerId;
                const canManageThis = canManageMember(member.cid);
                const canAssignThis = canAssign && canAssignRole(member.roleId);

                return (
                  <TableRow
                    key={member.cid}
                    className="border-border hover:bg-surface"
                  >
                    {/* Member Info */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-foreground"
                          style={{ backgroundColor: getAvatarColor(member, index) }}
                        >
                          {member.username[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground font-medium">
                            {member.username}
                          </span>
                          {getRoleIcon(member.role)}
                          {isOwnerMember && (
                            <span className="text-xs text-amber-500">(Owner)</span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Role Selector */}
                    <TableCell className="py-3">
                      {canAssignThis && !isOwnerMember ? (
                        <Select
                          value={member.roleId}
                          onValueChange={value => handleRoleChange(member, value)}
                        >
                          <SelectTrigger className="h-8 w-32 bg-surface border-border text-foreground text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border">
                            {assignableRoles
                              .filter(r => canAssignRole(r.id))
                              .map(r => (
                                <SelectItem
                                  key={r.id}
                                  value={r.id}
                                  className="text-foreground hover:bg-surface"
                                >
                                  <div className="flex items-center gap-2">
                                    {r.color && (
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: r.color }}
                                      />
                                    )}
                                    {r.name}
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-foreground/80">
                          {member.role.color && (
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: member.role.color }}
                            />
                          )}
                          {member.role.name}
                        </div>
                      )}
                    </TableCell>

                    {/* Actions */}
                    {canKick && (
                      <TableCell className="py-3 text-right">
                        {canManageThis && !isOwnerMember ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setMemberToKick(member)}
                            title="Kick member"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="h-7 w-7" />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>

      {/* Kick Confirmation Dialog */}
      <KickConfirmDialog
        member={memberToKick}
        isKicking={isKicking}
        onOpenChange={() => setMemberToKick(null)}
        onConfirm={handleKickConfirm}
      />
    </div>
  );
}

export default GroupMemberManagement;
