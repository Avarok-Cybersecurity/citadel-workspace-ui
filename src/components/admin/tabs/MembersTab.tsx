import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { useToast } from '@/hooks/use-toast';
import { AdminTabProps, MemberData, UserRole, USER_ROLES } from '../types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import WorkspaceService from '@/lib/workspace-service';
import { PermissionManager } from '@/components/permissions/PermissionManager';
import { Loader2, Shield } from 'lucide-react';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { MemberRow, ROLE_COLORS } from './MemberRow';

export function MembersTab({ entityType, entityId, onClose: _onClose }: AdminTabProps) {
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
      const domainId = entityId;

      // listMembers() is fire-and-forget (Promise<void>); response below is always void.
      // Members load asynchronously via workspace events. This branch is dead code.
      const response: unknown = await WorkspaceService.listMembers(domainId);

      if (response && typeof response === 'object' && 'ListMembers' in response) {
        const resp = response as { ListMembers: { members: Array<{ user_id: string; username?: string; name?: string; avatar_url?: string; role?: string }> } };
        const memberList: MemberData[] = resp.ListMembers.members.map((m) => ({
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
      debugLog('MembersTab', 'Failed to load members:', error);
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
        variant: 'success',
      });
    } catch (error) {
      debugLog('MembersTab', 'Failed to update role:', error);
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
      await WorkspaceService.removeMember(memberToRemove.userId, entityId);

      setMembers(prev => prev.filter(m => m.userId !== memberToRemove.userId));

      toast({
        title: 'Member Removed',
        description: `${memberToRemove.name || memberToRemove.username} has been removed`,
        variant: 'success',
      });
    } catch (error) {
      debugLog('MembersTab', 'Failed to remove member:', error);
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
            className="border-gray-600 text-white hover:bg-[#232536]"
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
              <MemberRow
                key={member.userId}
                member={member}
                showAdvanced={showAdvanced}
                isUpdatingRole={updatingRoles.has(member.userId)}
                onRoleChange={handleRoleChange}
                onAdvancedPermissions={handleAdvancedPermissions}
                onRemove={setMemberToRemove}
              />
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
