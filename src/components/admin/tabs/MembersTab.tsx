import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { useToast } from '@/hooks/use-toast';
import { AdminTabProps, MemberData, UserRole, USER_ROLES } from '../types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import WorkspaceService from '@/lib/workspace-service';
import { PermissionManager } from '@/components/permissions/PermissionManager';
import { Loader2, UserMinus, Shield } from 'lucide-react';
import { getUserInitials } from '@/lib/workspace-metadata-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';

const ROLE_COLORS: Record<UserRole, string> = {
  Admin: 'bg-red-500',
  Owner: 'bg-orange-500',
  Member: 'bg-blue-500',
  Guest: 'bg-gray-500',
  Banned: 'bg-black',
};

export function MembersTab({ entityType, entityId, onClose }: AdminTabProps) {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberData | null>(null);
  const [updatingRoles, setUpdatingRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    runAsyncSetup(loadMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      let officeId: string | undefined;
      let roomId: string | undefined;

      if (entityType === 'office') {
        officeId = entityId;
      } else if (entityType === 'room') {
        roomId = entityId;
      }

      const response = await WorkspaceService.listMembers(officeId, roomId);

      if (response?.ListMembers?.members) {
        const memberList: MemberData[] = response.ListMembers.members.map((m: any) => ({
          userId: m.user_id,
          username: m.username || m.user_id,
          name: m.name,
          avatarUrl: m.avatar_url,
          role: m.role as UserRole,
        }));
        setMembers(memberList);
      } else {
        // Fallback to workspace members from state
        if (state.members && Object.keys(state.members).length > 0) {
          const memberList: MemberData[] = Object.values(state.members).map((m) => ({
            userId: m.id,
            username: m.username,
            name: m.displayName,
            avatarUrl: m.avatarUrl,
            role: (m.role ?? 'Member') as UserRole,
          }));
          setMembers(memberList);
        }
      }
    } catch (error) {
      console.error('Failed to load members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load members',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingRoles(prev => new Set(prev).add(userId));
    try {
      await WorkspaceService.updateMemberRole(userId, newRole);

      setMembers(prev =>
        prev.map(m =>
          m.userId === userId ? { ...m, role: newRole } : m
        )
      );

      toast({
        title: 'Role Updated',
        description: `Member role updated to ${newRole}`,
        className: 'bg-[#343A5C] border-purple-800 text-purple-200',
      });
    } catch (error) {
      console.error('Failed to update role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update member role',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRoles(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      let officeId: string | undefined;
      let roomId: string | undefined;

      if (entityType === 'office') {
        officeId = entityId;
      } else if (entityType === 'room') {
        roomId = entityId;
      }

      await WorkspaceService.removeMember(memberToRemove.userId, officeId, roomId);

      setMembers(prev => prev.filter(m => m.userId !== memberToRemove.userId));

      toast({
        title: 'Member Removed',
        description: `${memberToRemove.name || memberToRemove.username} has been removed`,
        className: 'bg-[#343A5C] border-purple-800 text-purple-200',
      });
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive',
      });
    } finally {
      setMemberToRemove(null);
    }
  };

  const handleAdvancedPermissions = (member: MemberData) => {
    setSelectedMember(member);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="members-tab-loading">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  // Show PermissionManager for selected member in advanced mode
  if (showAdvanced && selectedMember) {
    return (
      <div className="space-y-4" data-testid="members-advanced-permissions">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium">
            Permissions for {selectedMember.name || selectedMember.username}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedMember(null)}
            className="border-gray-600 text-white hover:bg-[#444A6C]"
          >
            Back to Members
          </Button>
        </div>
        <PermissionManager
          userId={selectedMember.userId}
          domainId={entityId}
          domainType={entityType}
          onClose={() => setSelectedMember(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="members-tab-content">
      {/* Advanced Toggle */}
      <div className="flex items-center justify-between p-3 bg-[#1a1b26] rounded-lg">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-purple-400" />
          <Label htmlFor="advanced-toggle" className="text-white cursor-pointer">
            Show Advanced Permissions
          </Label>
        </div>
        <Switch
          id="advanced-toggle"
          checked={showAdvanced}
          onCheckedChange={setShowAdvanced}
          data-testid="members-advanced-toggle"
        />
      </div>

      {/* Members List */}
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No members found
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-3 bg-[#444A6C] rounded-lg"
                data-testid={`member-row-${member.userId}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatarUrl || ''} />
                    <AvatarFallback className="bg-[#343A5C] text-white">
                      {getUserInitials(member.name || member.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-white font-medium">
                      {member.name || member.username}
                    </div>
                    {member.name && (
                      <div className="text-gray-400 text-sm">@{member.username}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {showAdvanced ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAdvancedPermissions(member)}
                      className="border-purple-600 text-purple-400 hover:bg-purple-600/20"
                      data-testid={`member-permissions-${member.userId}`}
                    >
                      <Shield className="h-4 w-4 mr-1" />
                      Permissions
                    </Button>
                  ) : (
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleRoleChange(member.userId, value as UserRole)}
                      disabled={updatingRoles.has(member.userId)}
                    >
                      <SelectTrigger
                        className="w-32 bg-[#343A5C] border-gray-600 text-white"
                        data-testid={`member-role-select-${member.userId}`}
                      >
                        {updatingRoles.has(member.userId) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent className="bg-[#444A6C] border-gray-600">
                        {USER_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${ROLE_COLORS[role]}`} />
                              {role}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMemberToRemove(member)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                    data-testid={`member-remove-${member.userId}`}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Role Legend */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-600">
        {USER_ROLES.map((role) => (
          <Badge
            key={role}
            variant="outline"
            className="border-gray-600 text-gray-400"
          >
            <div className={`w-2 h-2 rounded-full ${ROLE_COLORS[role]} mr-1`} />
            {role}
          </Badge>
        ))}
      </div>

      {/* Remove Member Confirmation */}
      <ConfirmDeleteDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
        title="Remove Member"
        description={`Are you sure you want to remove ${memberToRemove?.name || memberToRemove?.username} from this ${entityType}? They will lose access to all content.`}
        onConfirm={handleRemoveMember}
        confirmLabel="Remove"
      />
    </div>
  );
}
