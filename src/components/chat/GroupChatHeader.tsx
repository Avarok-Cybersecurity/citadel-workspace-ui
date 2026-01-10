/**
 * GroupChatHeader Component
 *
 * Header for the group chat view showing group name, member avatars,
 * and action buttons (settings, leave).
 */

import { useState, useMemo } from 'react';
import { Settings, LogOut, Users, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import type { GroupConversation, GroupMemberWithRole } from '@/types/group';
import { useGroupPermissions } from '@/hooks/useGroupPermissions';

// ============================================================================
// Types
// ============================================================================

interface GroupChatHeaderProps {
  group: GroupConversation;
  /** Callback when settings button is clicked */
  onOpenSettings: () => void;
  /** Callback when user leaves the group */
  onLeaveGroup: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_VISIBLE_AVATARS = 5;

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

export function GroupChatHeader({
  group,
  onOpenSettings,
  onLeaveGroup,
}: GroupChatHeaderProps) {
  const { isOwner, can } = useGroupPermissions(group);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Get members sorted by role position
  const sortedMembers = useMemo(() => {
    return [...group.members]
      .map(member => {
        const role = group.settings.roles.find(r => r.id === member.roleId);
        return { ...member, role: role! } as GroupMemberWithRole;
      })
      .filter(m => m.role)
      .sort((a, b) => {
        if (a.role.position !== b.role.position) {
          return b.role.position - a.role.position;
        }
        return a.username.localeCompare(b.username);
      });
  }, [group.members, group.settings.roles]);

  const visibleMembers = sortedMembers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = Math.max(0, sortedMembers.length - MAX_VISIBLE_AVATARS);

  // Get avatar color
  const getAvatarColor = (member: GroupMemberWithRole, index: number): string => {
    if (member.role?.color) return member.role.color;
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  };

  // Handle leave confirmation
  const handleLeaveConfirm = async () => {
    setIsLeaving(true);
    try {
      await onLeaveGroup();
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  // Check if user can access settings
  const canAccessSettings = can('editGroupSettings') || can('manageRoles');

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[#2D3548] bg-[#1C2333]">
      {/* Left: Group Info */}
      <div className="flex items-center gap-3">
        {/* Overlapping Avatars */}
        <div className="flex items-center">
          {visibleMembers.map((member, index) => (
            <div
              key={member.cid}
              className="relative rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-[#1C2333]"
              style={{
                width: 32,
                height: 32,
                backgroundColor: getAvatarColor(member, index),
                marginLeft: index === 0 ? 0 : -10,
                zIndex: visibleMembers.length - index,
              }}
              title={member.username}
            >
              {member.username[0]?.toUpperCase() || '?'}
            </div>
          ))}
          {overflowCount > 0 && (
            <div
              className="relative rounded-full flex items-center justify-center text-xs font-medium text-white bg-[#4A4A6A] border-2 border-[#1C2333]"
              style={{
                width: 32,
                height: 32,
                marginLeft: -10,
                zIndex: 0,
              }}
              title={`+${overflowCount} more members`}
            >
              +{overflowCount}
            </div>
          )}
        </div>

        {/* Group Name & Member Count */}
        <div>
          <h2 className="text-base font-semibold text-white">{group.name}</h2>
          <p className="text-xs text-gray-400">
            {group.members.length} member{group.members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-gray-400 hover:text-white hover:bg-[#262C4A]"
            >
              <Settings className="h-4 w-4 mr-1" />
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 bg-[#1C2333] border-[#2D3548]"
          >
            {canAccessSettings && (
              <>
                <DropdownMenuItem
                  onClick={onOpenSettings}
                  className="text-white hover:bg-[#262C4A] cursor-pointer"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Group Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2D3548]" />
              </>
            )}
            <DropdownMenuItem
              onClick={onOpenSettings}
              className="text-white hover:bg-[#262C4A] cursor-pointer"
            >
              <Users className="h-4 w-4 mr-2" />
              View Members
            </DropdownMenuItem>
            {!isOwner && (
              <>
                <DropdownMenuSeparator className="bg-[#2D3548]" />
                <DropdownMenuItem
                  onClick={() => setShowLeaveConfirm(true)}
                  className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Leave Group
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Leave Confirmation Dialog */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent className="bg-[#1C2333] border-[#2D3548]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Leave "{group.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              You will no longer receive messages from this group. You can be
              re-invited by a group admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isLeaving}
              className="bg-transparent border-[#3D4663] text-white hover:bg-[#262C4A]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveConfirm}
              disabled={isLeaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isLeaving ? 'Leaving...' : 'Leave Group'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GroupChatHeader;
