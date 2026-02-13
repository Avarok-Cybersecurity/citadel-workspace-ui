/**
 * GroupMemberManagement Component
 *
 * Displays and manages group members with role assignment and kick functionality.
 * Respects role hierarchy for actions.
 */

import { useState, useMemo, useCallback } from 'react';
import { UserMinus, Crown, Shield, User } from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { GroupConversation, GroupMemberWithRole, GroupRole } from '@/types/group';
import { useGroupPermissions } from '@/hooks/use-group-permissions';

// ============================================================================
// Types
// ============================================================================

interface GroupMemberManagementProps {
  group: GroupConversation;
  /** Callback when a member's role is changed */
  onRoleChange: (memberCid: string, roleId: string) => Promise<void>;
  /** Callback when a member is kicked */
  onKickMember: (memberCid: string) => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const AVATAR_COLORS = [
  '#FFD700', // Gold - Owner
  '#6E59A5', // Purple
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
];

// ============================================================================
// Component
// ============================================================================

export function GroupMemberManagement({
  group,
  onRoleChange,
  onKickMember,
}: GroupMemberManagementProps) {
  const { can, canManageMember, canAssignRole, isOwner } = useGroupPermissions(group);
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
        // Owner first (highest position)
        if (a.role.position !== b.role.position) {
          return b.role.position - a.role.position;
        }
        // Then alphabetical
        return a.username.localeCompare(b.username);
      });
  }, [group.members, group.settings.roles]);

  // Roles that can be assigned (excludes built-in owner role)
  const assignableRoles = useMemo(() => {
    return group.settings.roles
      .filter(r => !r.isBuiltIn)
      .sort((a, b) => b.position - a.position);
  }, [group.settings.roles]);

  // Get role icon based on position
  const getRoleIcon = (role: GroupRole) => {
    if (role.position >= 100) {
      return <Crown className="h-4 w-4 text-amber-500" />;
    }
    if (role.position >= 50) {
      return <Shield className="h-4 w-4 text-purple-400" />;
    }
    return <User className="h-4 w-4 text-gray-400" />;
  };

  // Get avatar color
  const getAvatarColor = (member: GroupMemberWithRole, index: number): string => {
    if (member.role?.color) return member.role.color;
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  };

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
        <h3 className="text-sm font-semibold text-white">
          Members ({group.members.length})
        </h3>
      </div>

      {/* Member Table */}
      <ScrollArea className="max-h-[400px]">
        <div className="rounded-md border border-[#2D3548] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#2D3548] hover:bg-transparent">
                <TableHead className="text-gray-400 h-10">Member</TableHead>
                <TableHead className="text-gray-400 h-10 w-40">Role</TableHead>
                {canKick && (
                  <TableHead className="text-gray-400 h-10 w-20 text-right">
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
                    className="border-[#2D3548] hover:bg-[#262C4A]"
                  >
                    {/* Member Info */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                          style={{ backgroundColor: getAvatarColor(member, index) }}
                        >
                          {member.username[0]?.toUpperCase() || '?'}
                        </div>
                        {/* Name & Role Icon */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">
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
                          <SelectTrigger className="h-8 w-32 bg-[#262C4A] border-[#3D4663] text-white text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1C2333] border-[#2D3548]">
                            {assignableRoles
                              .filter(r => canAssignRole(r.id))
                              .map(r => (
                                <SelectItem
                                  key={r.id}
                                  value={r.id}
                                  className="text-white hover:bg-[#262C4A]"
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
                        <div className="flex items-center gap-2 text-sm text-gray-300">
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
                          <div className="h-7 w-7" /> // Placeholder for alignment
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
      <AlertDialog open={!!memberToKick} onOpenChange={() => setMemberToKick(null)}>
        <AlertDialogContent className="bg-[#1C2333] border-[#2D3548]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Kick "{memberToKick?.username}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This member will be removed from the group. They can be re-invited
              later by a group admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isKicking}
              className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKickConfirm}
              disabled={isKicking}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isKicking ? 'Kicking...' : 'Kick Member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GroupMemberManagement;
