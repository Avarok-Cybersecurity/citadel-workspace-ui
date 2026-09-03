import { useState, useEffect } from 'react';
import { isAdminRole } from '@/lib/role-predicate';
import { describeFailure } from '@/lib/failure-message';
import { isForDomain } from '@/lib/workspace-events/is-for-domain';
import { useMemberAdminActions } from './use-member-admin-actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { useToast } from '@/hooks/use-toast';
import { AdminTabProps, MemberData, UserRole, USER_ROLES } from '../types';
import WorkspaceService from '@/lib/workspace-service';
import { workspaceEvents, type MembersPayload } from '@/lib/workspace-events';
import { PermissionManager } from '@/components/permissions/PermissionManager';
import { Loader2, Shield } from 'lucide-react';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { armLoadingDeadline, cancelLoadingDeadline } from '@/lib/loading-flag-timeout';
import { debugLog } from '@/lib/debug-config';
import { MemberRow, ROLE_COLORS } from './MemberRow';

export function MembersTab({ entityType, entityId, onClose: _onClose }: AdminTabProps): JSX.Element {
  const { toast } = useToast();
  const deadlineKey: string = `admin-members:${entityId}`; // per entity: modals must not clash
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberData | null>(null);

  useEffect(() => {
    runAsyncSetup(loadMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  // listMembers() dispatches a request and returns void; the result arrives as a
  // `members:loaded` event. This used to `await` that call and branch on the
  // return value, with a comment noting the branch was dead — so it always fell
  // through to a fallback over state.members, which is empty here, and the tab
  // reported "No members found" no matter who was in the workspace. Subscribing
  // is what MembersSection in the sidebar already does; this now matches it.
  useEffect(() => {
    const handleMembersLoaded = (payload: MembersPayload): void => {
      if (!payload.members) return;
      // Someone else's domain, arriving while this tab is open, used to render
      // here -- and the role changes and removals below would then name THIS
      // entity with users taken from that list.
      if (!isForDomain(payload.domainId, entityId)) return;
      setMembers(
        payload.members.map((m) => ({
          userId: m.id,
          username: m.username,
          name: m.displayName,
          avatarUrl: m.avatarUrl,
          role: (m.role ?? 'Member') as UserRole,
        }))
      );
      cancelLoadingDeadline(deadlineKey);
      setLoading(false);
    };
    // Return the unsubscribe — see use-domain-members.ts for why the async
    // wrapper that used to swallow it leaked a listener per tab visit.
    return workspaceEvents.onMemberEvent('members:loaded', handleMembersLoaded);
  }, [deadlineKey, entityId]);

  const loadMembers = async (): Promise<void> => {
    setLoading(true);
    // listMembers resolves on SEND and loading was cleared only by the success
    // event, so a refusal left the panel spinning (useMemberEventSetup has had this).
    armLoadingDeadline(deadlineKey, () => setLoading(false));
    try {
      await WorkspaceService.listMembers(entityId);
    } catch (error) {
      debugLog('MembersTab', 'Failed to request members:', error);
      toast({
        title: 'Error',
        description: describeFailure(error, 'Failed to load members'),
        variant: 'destructive',
      });
      cancelLoadingDeadline(deadlineKey);
      setLoading(false);
    }
  };

  const { updatingRoles, changeRole, removeMember } = useMemberAdminActions(entityId, setMembers);

  const handleRoleChange: (userId: string, newRole: UserRole) => Promise<void> = changeRole;

  const handleRemoveMember = async (): Promise<void> => {
    if (!memberToRemove) return;
    try {
      await removeMember(memberToRemove);
    } finally {
      setMemberToRemove(null);
    }
  };

  const handleAdvancedPermissions = (member: MemberData): void => {
    setSelectedMember(member);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="members-tab-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary-accent" />
      </div>
    );
  }

  // Show PermissionManager for selected member in advanced mode
  if (showAdvanced && selectedMember) {
    return (
      <div className="space-y-4" data-testid="members-advanced-permissions">
        {/* Stacks below `sm`, and the name breaks rather than pushing.
            A generated handle beside a button that will not shrink made this row
            370px wide inside a 341px dialog — the panel then scrolled sideways
            and took the permission matrix's label column off the left edge with
            it. The matrix itself already fits; this header was the overhang. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-foreground font-medium min-w-0 break-all sm:truncate">
            Permissions for {selectedMember.name || selectedMember.username}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedMember(null)}
            className="border-border text-foreground hover:bg-card shrink-0 self-end sm:self-auto"
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
      <div className="flex items-center justify-between p-3 bg-background rounded-lg">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary-accent" />
          <Label htmlFor="advanced-toggle" className="text-foreground cursor-pointer">
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
            <div className="text-center py-8 text-muted-foreground">
              No members found
            </div>
          ) : (
            members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                showAdvanced={showAdvanced}
                isOnlyAdmin={
                  isAdminRole(member.role) &&
                  members.filter((m) => isAdminRole(m.role)).length === 1
                }
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
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        {USER_ROLES.map((role) => (
          <Badge
            key={role}
            variant="outline"
            className="border-border text-muted-foreground"
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
