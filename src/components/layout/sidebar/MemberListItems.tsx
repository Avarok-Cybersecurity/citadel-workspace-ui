/**
 * MemberListItems Component
 *
 * Renders individual workspace member items in the sidebar with tooltips,
 * role badges, and dropdown menus for member management.
 */

import { MoreVertical, Shield, Users } from "lucide-react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRoleIcon, getRoleColor, capitalizeRole } from './MembersSectionModals';
import type { User as WorkspaceMember } from '@/types/workspace-entities';

const MEMBERS_TO_SHOW = 5;

interface MemberListItemsProps {
  members: WorkspaceMember[];
  currentUsername?: string;
  onEditMember: (member: WorkspaceMember) => void;
  onRemoveMember: (member: WorkspaceMember) => void;
  onManagePermissions: (member: WorkspaceMember) => void;
  onShowAllMembers: () => void;
}

export function MemberListItems({
  members,
  currentUsername,
  onEditMember,
  onRemoveMember,
  onManagePermissions,
  onShowAllMembers,
}: MemberListItemsProps) {
  return (
    <>
      {members.slice(0, MEMBERS_TO_SHOW).map((member) => (
        // animate-fade-in moves onto the items: the wrapper that carried it was
        // a <div> rendered directly inside <SidebarMenu>, which is a <ul>. That
        // put a non-<li> in the list and left every <li> below it without a list
        // parent.
        <SidebarMenuItem key={member.id} className="animate-fade-in">
          <div className="flex items-center w-full group">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton className="text-foreground hover:bg-purple-500/15 hover:text-foreground transition-colors flex-1">
                  <div className="flex items-center gap-2 flex-1">
                    {getRoleIcon(member.role || 'member')}
                    <span className="flex-1 truncate">{member.displayName || member.username}</span>
                    <Badge variant="secondary" className={`${getRoleColor(member.role || 'member')} text-foreground text-xs`}>{capitalizeRole(member.role || 'member')}</Badge>
                  </div>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>{member.displayName || member.username}</p>
                {member.username && <p className="text-xs text-muted-foreground">@{member.username}</p>}
              </TooltipContent>
            </Tooltip>
            {currentUsername !== member.username && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Actions for ${member.displayName || member.username}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onManagePermissions(member)}><Shield className="h-4 w-4 mr-2" />Manage Permissions</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditMember(member)}>Change Role</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRemoveMember(member)} className="text-red-600">Remove Member</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </SidebarMenuItem>
      ))}
      {members.length > MEMBERS_TO_SHOW && (
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onShowAllMembers} className="text-primary-accent hover:bg-purple-500/15 hover:text-foreground transition-colors">
            <Users className="h-4 w-4 mr-2" />View all {members.length} members
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </>
  );
}
