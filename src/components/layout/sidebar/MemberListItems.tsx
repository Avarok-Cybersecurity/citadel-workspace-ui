/**
 * MemberListItems Component
 *
 * Renders individual workspace member items in the sidebar with tooltips,
 * role badges, and dropdown menus for member management.
 */

import { MoreVertical, Users } from "lucide-react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoleColor, capitalizeRole } from './MembersSectionModals';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { MemberActionItems } from './MemberActionItems';
import type { MemberActionBlocks } from './member-actions-gate';
import { blocksForMember } from '@/lib/member-access';
import type { User as WorkspaceMember } from '@/types/workspace-entities';

const MEMBERS_TO_SHOW: number = 5;

interface MemberListItemsProps {
  members: WorkspaceMember[];
  /** What the server will refuse you, from `useMemberActionBlocks`. */
  blocks: MemberActionBlocks;
  /** Names a member's `accessVia` level; see hooks/use-level-name. */
  nameOfLevel: (levelId: string) => string;
  currentUsername?: string;
  onEditMember: (member: WorkspaceMember) => void;
  onRemoveMember: (member: WorkspaceMember) => void;
  onManagePermissions: (member: WorkspaceMember) => void;
  onShowAllMembers: () => void;
}

export function MemberListItems({
  members,
  blocks,
  nameOfLevel,
  currentUsername,
  onEditMember,
  onRemoveMember,
  onManagePermissions,
  onShowAllMembers,
}: MemberListItemsProps): JSX.Element {
  return (
    <>
      {members.slice(0, MEMBERS_TO_SHOW).map((member) => {
        const via: string | null = member.accessVia === undefined ? null : nameOfLevel(member.accessVia);
        return (
        // animate-fade-in moves onto the items: the wrapper that carried it was
        // a <div> rendered directly inside <SidebarMenu>, which is a <ul>. That
        // put a non-<li> in the list and left every <li> below it without a list
        // parent.
        <SidebarMenuItem key={member.id} className="animate-fade-in">
          <div className="flex items-center w-full min-w-0 group">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton className="text-foreground hover:bg-primary-accent/15 hover:text-foreground transition-colors min-w-0 flex-1">
                  {/* min-w-0 down the chain so the NAME gives way; see a-role-badge-is-never-clipped. */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MemberAvatar username={member.username} name={member.displayName || member.username} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="min-w-0 truncate">{member.displayName || member.username}</span>
                      {via !== null && <span className="min-w-0 truncate text-xs text-muted-foreground" data-testid="member-access-via">via {via}</span>}
                    </span>
                    <Badge variant="secondary" className={`${getRoleColor(member.role || 'member')} shrink-0 whitespace-nowrap text-xs`}>{capitalizeRole(member.role || 'member')}</Badge>
                  </div>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>{member.displayName || member.username}</p>
                {member.username && <p className="text-xs text-muted-foreground">@{member.username}</p>}
                {member.title && <p className="text-xs">{member.title}</p>}
                {member.email && <p className="text-xs text-muted-foreground">{member.email}</p>}
              </TooltipContent>
            </Tooltip>
            {currentUsername !== member.username && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="tap-target h-6 w-6 reveal-on-hover"
                    aria-label={`Actions for ${member.displayName || member.username}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <MemberActionItems
                    blocks={blocksForMember(blocks, via)}
                    onManagePermissions={() => onManagePermissions(member)}
                    onEditMember={() => onEditMember(member)}
                    onRemoveMember={() => onRemoveMember(member)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </SidebarMenuItem>
        );
      })}
      {members.length > MEMBERS_TO_SHOW && (
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onShowAllMembers} className="text-primary-accent hover:bg-primary-accent/15 hover:text-foreground transition-colors">
            <Users className="h-4 w-4 mr-2" />View all {members.length} members
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </>
  );
}
