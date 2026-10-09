/**
 * One person in the "all members" dialog: who they are, their role, and what can be done to them.
 *
 * The identity block takes the room that is left (`min-w-0`, long text breaks) and the badge and the
 * menu keep their size (`shrink-0`); with neither, a long email or username pushed the role badge and
 * the actions menu into each other or off the row.
 */
import { MoreVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { roleLabel } from '@/components/shared/RoleIcon';
import { roleBadgeClass } from '@/lib/role-badge';
import { blocksForMember } from '@/lib/member-access';
import type { User as WorkspaceMember } from '@/types/workspace-entities';
import { MemberActionItems } from './MemberActionItems';
import type { MemberActionBlocks } from './member-actions-gate';

interface AllMembersRowProps {
  member: WorkspaceMember;
  /** The reader: nothing to do to yourself, so no menu. */
  currentUsername: string | undefined;
  blocks: MemberActionBlocks;
  nameOfLevel: (levelId: string) => string;
  onManagePermissions: () => void;
  onEditMember: () => void;
  onRemoveMember: () => void;
}

export function AllMembersRow({ member, currentUsername, blocks, nameOfLevel, onManagePermissions, onEditMember, onRemoveMember }: AllMembersRowProps): JSX.Element {
  const role: string = member.role || 'member';
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg hover:bg-card transition-colors" data-testid={`all-members-row-${member.username}`}>
      <MemberAvatar username={member.username} name={member.displayName || member.username} className="h-8 w-8" />
      <div className="min-w-0 flex-1 break-words">
        <p className="text-foreground font-medium">{member.displayName || member.username}</p>
        {member.accessVia !== undefined && <p className="text-xs text-muted-foreground" data-testid="member-access-via">via {nameOfLevel(member.accessVia)}</p>}
        {member.username && <p className="text-sm text-muted-foreground">@{member.username}</p>}
        {member.title && <p className="text-xs text-foreground/80" data-testid="member-title">{member.title}</p>}
        {member.email && <p className="text-xs text-muted-foreground" data-testid="member-email">{member.email}</p>}
      </div>
      <Badge variant="secondary" className={`${roleBadgeClass(role)} shrink-0 text-xs`}>{roleLabel(role)}</Badge>
      {currentUsername !== member.username && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Actions for ${member.username}`}><MoreVertical className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <MemberActionItems
              blocks={blocksForMember(blocks, member.accessVia === undefined ? null : nameOfLevel(member.accessVia))}
              onManagePermissions={onManagePermissions}
              onEditMember={onEditMember}
              onRemoveMember={onRemoveMember}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
