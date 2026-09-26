import { memberAvatarColor } from '@/lib/avatar-color';
import { rosterMemberName } from '@/lib/roster-peer-name';
import { useSelfName } from '@/hooks/use-self-name';
import { getRoleIcon } from './GroupMemberManagementHelpers';
import type { GroupMemberWithRole } from '@/types/group';

interface GroupMemberIdentityProps {
  member: GroupMemberWithRole;
  index: number;
  isOwner: boolean;
}

/**
 * Who a group member is, named as the sidebar names them.
 *
 * This rendered `member.username` as stored: the owner as "alice0924" beside a
 * sidebar reading "Alice Anders", and a member whose record carried their CID
 * as a twenty-digit number. The roster decides now (rosterMemberName), and the
 * reader is named as the top bar names them.
 */
export function GroupMemberIdentity({ member, index, isOwner }: GroupMemberIdentityProps): JSX.Element {
  const self: ReturnType<typeof useSelfName> = useSelfName();
  const isSelf: boolean = member.cid === self.cid || (self.username !== undefined && member.username === self.username);
  const name: string = isSelf && self.name
    ? self.name
    : rosterMemberName(member);
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-foreground"
        style={{ backgroundColor: memberAvatarColor(member, index) }}
        aria-hidden="true"
      >
        {name[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground font-medium" data-testid={`group-member-name-${member.cid.toString()}`}>{name}</span>
        {getRoleIcon(member.role)}
        {isOwner && <span className="text-xs text-warning-emphasis">(Owner)</span>}
      </div>
    </div>
  );
}
