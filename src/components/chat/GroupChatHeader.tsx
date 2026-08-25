/**
 * GroupChatHeader Component
 *
 * Header for the group chat view showing group name, member avatars,
 * and action buttons (settings, leave).
 */

import { useState, type ReactNode } from 'react';
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
import type { GroupConversation } from '@/types/group';
import { useGroupPermissions } from '@/hooks/use-group-permissions';
import { GroupMemberAvatars } from './GroupMemberAvatars';

// ============================================================================
// Types
// ============================================================================

interface GroupChatHeaderProps {
  group: GroupConversation;
  /** Callback when settings button is clicked */
  onOpenSettings: () => void;
  /** Callback when user leaves the group */
  onLeaveGroup: () => Promise<void>;
  /** Call entry/leave controls, supplied by the surface that knows the roster. */
  callControls?: ReactNode;
}

// ============================================================================
// Component
// ============================================================================

export function GroupChatHeader({
  group,
  onOpenSettings,
  onLeaveGroup,
  callControls,
}: GroupChatHeaderProps) {
  const { isOwner, can } = useGroupPermissions(group);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

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
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
      {/* Left: Group Info. min-w-0 lets the name truncate at narrow widths
          instead of shoving the call controls off-screen. */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Overlapping Avatars */}
        <GroupMemberAvatars group={group} />

        {/* Group Name & Member Count */}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground truncate">{group.name}</h2>
          <p className="text-xs text-muted-foreground">
            {group.members.length} member{group.members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {callControls}
        {/* Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-surface"
            >
              <Settings className="h-4 w-4 mr-1" />
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 bg-background border-border"
          >
            {canAccessSettings && (
              <>
                <DropdownMenuItem
                  onClick={onOpenSettings}
                  className="text-foreground hover:bg-surface cursor-pointer"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Group Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
              </>
            )}
            <DropdownMenuItem
              onClick={onOpenSettings}
              className="text-foreground hover:bg-surface cursor-pointer"
            >
              <Users className="h-4 w-4 mr-2" />
              View Members
            </DropdownMenuItem>
            {!isOwner && (
              <>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onClick={() => setShowLeaveConfirm(true)}
                  className="text-destructive hover:bg-destructive/10 cursor-pointer"
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
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Leave "{group.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              You will no longer receive messages from this group. You can be
              re-invited by a group admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isLeaving}
              className="bg-transparent border-border text-foreground hover:bg-surface"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveConfirm}
              disabled={isLeaving}
              className="bg-destructive hover:bg-destructive/90 text-foreground"
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
