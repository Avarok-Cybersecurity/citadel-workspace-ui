/**
 * The overlapping member-avatar cluster on the group chat header.
 *
 * Extracted verbatim from GroupChatHeader so the header stays within the
 * 250-line file cap while it also hosts the call controls.
 */

import { useMemo } from 'react';
import type { GroupConversation, GroupMemberWithRole } from '@/types/group';
import { memberAvatarColor } from '@/lib/avatar-color';
import type { GroupRole } from '@/types/group-permissions';

const MAX_VISIBLE_AVATARS = 5;


export function GroupMemberAvatars({ group }: { group: GroupConversation }): JSX.Element {
  // Get members sorted by role position
  const sortedMembers: GroupMemberWithRole[] = useMemo(() => {
    return [...group.members]
      .flatMap(member => {
        const role: GroupRole | undefined = group.settings.roles.find(r => r.id === member.roleId);
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

  const visibleMembers: GroupMemberWithRole[] = sortedMembers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount: number = Math.max(0, sortedMembers.length - MAX_VISIBLE_AVATARS);

  // Get avatar color

  return (
    <div className="flex items-center">
      {visibleMembers.map((member, index) => (
        <div
          key={member.cid}
          className="relative rounded-full flex items-center justify-center text-xs font-medium text-foreground border-2 border-background"
          style={{
            width: 32,
            height: 32,
            backgroundColor: memberAvatarColor(member, index),
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
          className="relative rounded-full flex items-center justify-center text-xs font-medium text-foreground bg-surface border-2 border-background"
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
  );
}
