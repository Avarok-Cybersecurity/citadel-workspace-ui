/**
 * MemberListItems Component
 *
 * Renders individual workspace member items in the sidebar with tooltips,
 * role icons, and dropdown menus for member management.
 */

import { MoreVertical, Users } from "lucide-react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
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
import { RoleIcon, roleLabel } from '@/components/shared/RoleIcon';
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
  /** Opens the chat with this member when they are a contact; null when they are not. */
  openChatWith: (member: WorkspaceMember) => (() => void) | null;
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
  openChatWith,
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
        const openChat: (() => void) | null = openChatWith(member);
        return (
        // animate-fade-in moves onto the items: the wrapper that carried it was
        // a <div> rendered directly inside <SidebarMenu>, which is a <ul>. That
        // put a non-<li> in the list and left every <li> below it without a list
        // parent.
        <SidebarMenuItem key={member.id} className="animate-fade-in">
          <div className="flex items-center w-full min-w-0 group">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className="text-foreground hover:bg-primary-accent/15 hover:text-foreground transition-colors min-w-0 flex-1"
                  onClick={openChat ?? undefined}
                  data-testid={`member-row-${member.username}`}
                >
                  {/* min-w-0 down the chain so the NAME gives way; see a-role-badge-is-never-clipped. */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MemberAvatar username={member.username} name={member.displayName || member.username} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="min-w-0 truncate">{member.displayName || member.username}</span>
                      {via !== null && <span className="min-w-0 truncate text-xs text-muted-foreground" data-testid="member-access-via">via {via}</span>}
                    </span>
                    <RoleIcon role={member.role || 'member'} />
                  </div>
                </SidebarMenuButton>
              </TooltipTrigger>
              {/* To the side, never above: a card on top of its row lies across the rows
                  above it, and the pointer then cannot reach them (see
                  check-chat-polish-geometry). */}
              <TooltipContent side="right" align="center" sideOffset={8}>
                <p>{member.displayName || member.username} · {roleLabel(member.role || 'member')}</p>
                {member.username && <p className="text-xs text-muted-foreground">@{member.username}</p>}
                {member.title && <p className="text-xs">{member.title}</p>}
                {member.email && <p className="text-xs text-muted-foreground">{member.email}</p>}
              </TooltipContent>
            </Tooltip>
            {/* The slot is kept on your own row too: without it every OTHER row's
                role icon sat 24px further left, so the column read as ragged. */}
            {currentUsername === member.username ? (
              <span className="tap-target h-6 w-6 shrink-0" aria-hidden="true" data-testid="member-actions-slot" />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="tap-target h-6 w-6 shrink-0 reveal-on-hover"
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
