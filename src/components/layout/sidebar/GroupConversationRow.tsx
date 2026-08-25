/**
 * GroupConversationRow Component
 *
 * Displays a group conversation in the sidebar with overlapping member avatars.
 * Used in the Conversations section alongside P2P direct messages.
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import type { GroupConversation, GroupMemberWithRole } from '@/types/group';

// ============================================================================
// Types
// ============================================================================

interface GroupConversationRowProps {
  group: GroupConversation;
  /** Whether this group is currently selected */
  isActive?: boolean;
  /** Callback when the group is clicked */
  onClick?: (group: GroupConversation) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Width of each avatar circle in pixels */
const AVATAR_SIZE = 20;

/** Overlap amount in pixels (negative margin) */
const AVATAR_OVERLAP = 8;

/** Minimum number of avatars to show (even if container is small) */
const MIN_AVATARS = 2;

/** Maximum number of avatars to show */
const MAX_AVATARS = 4;

/** Colors for avatar backgrounds based on member index */
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

export function GroupConversationRow({
  group,
  isActive = false,
  onClick,
}: GroupConversationRowProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxAvatars, setMaxAvatars] = useState(MAX_AVATARS);

  // Get members with their roles, sorted by position
  const sortedMembers = useMemo(() => {
    return [...group.members]
      .flatMap(member => {
        const role = group.settings.roles.find(r => r.id === member.roleId);
        if (!role) return []; // Filter out members with missing roles
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

  // Calculate how many avatars can fit
  useEffect(() => {
    const updateMaxAvatars = () => {
      if (!containerRef.current) return;

      // Approximate available width for avatars (container width - padding - name space)
      const containerWidth = containerRef.current.offsetWidth;
      const availableForAvatars = Math.min(80, containerWidth * 0.35);

      // Each avatar takes AVATAR_SIZE - AVATAR_OVERLAP pixels (except the last one)
      const effectiveAvatarWidth = AVATAR_SIZE - AVATAR_OVERLAP;
      const count = Math.floor(
        (availableForAvatars - AVATAR_SIZE) / effectiveAvatarWidth + 1
      );

      setMaxAvatars(Math.max(MIN_AVATARS, Math.min(MAX_AVATARS, count)));
    };

    updateMaxAvatars();

    const resizeObserver = new ResizeObserver(updateMaxAvatars);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Get display avatars and overflow count
  const { displayMembers, overflowCount } = useMemo(() => {
    if (sortedMembers.length <= maxAvatars) {
      return { displayMembers: sortedMembers, overflowCount: 0 };
    }
    return {
      displayMembers: sortedMembers.slice(0, maxAvatars),
      overflowCount: sortedMembers.length - maxAvatars,
    };
  }, [sortedMembers, maxAvatars]);

  // Get avatar color based on member's role or index
  const getAvatarColor = (member: GroupMemberWithRole, index: number): string => {
    if (member.role.color) return member.role.color;
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  };

  // Handle click
  const handleClick = () => {
    if (onClick) {
      onClick(group);
    } else {
      navigate(`/groups/${group.id}`);
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        data-testid={`group-row-${group.id}`}
        onClick={handleClick}
        className={`text-primary-foreground hover:bg-purple-500/15 hover:text-primary-foreground transition-colors h-9 py-1 ${
          isActive ? 'bg-purple-500/20 text-purple-200' : ''
        }`}
      >
        <div ref={containerRef} className="flex items-center gap-2 w-full">
          {/* Overlapping Avatars */}
          <div className="flex items-center flex-shrink-0">
            {displayMembers.map((member, index) => (
              <div
                key={member.cid}
                className="relative rounded-full flex items-center justify-center text-[10px] font-medium text-foreground border border-surface"
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  backgroundColor: getAvatarColor(member, index),
                  marginLeft: index === 0 ? 0 : -AVATAR_OVERLAP,
                  zIndex: displayMembers.length - index, // First avatar on top
                }}
                title={member.username}
              >
                {member.username[0]?.toUpperCase() || '?'}
              </div>
            ))}

            {/* Overflow indicator */}
            {overflowCount > 0 && (
              <div
                className="relative rounded-full flex items-center justify-center text-[9px] font-medium text-foreground bg-surface border border-surface"
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  marginLeft: -AVATAR_OVERLAP,
                  zIndex: 0,
                }}
                title={`+${overflowCount} more`}
              >
                +{overflowCount}
              </div>
            )}
          </div>

          {/* Group Name */}
          <span className="flex-1 truncate text-sm font-medium">
            {group.name}
          </span>

          {/* Unread Count Badge */}
          {group.unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] px-1.5 bg-primary text-primary-foreground text-xs">
              {group.unreadCount > 99 ? '99+' : group.unreadCount}
            </Badge>
          )}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default GroupConversationRow;
