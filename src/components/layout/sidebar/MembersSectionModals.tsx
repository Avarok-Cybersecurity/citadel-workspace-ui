/**
 * MembersSectionModals Component
 *
 * Renders all modal/dialog components used by MembersSection:
 * - MemberManagementModal (add/edit/remove)
 * - All Members Dialog
 * - PermissionManagerModal
 * - PeerDiscoveryModal
 * - PendingRequestsModal
 * - CreateGroupDialog
 */

import { InviteToWorkspaceDialog } from '@/components/workspace/InviteToWorkspaceDialog';
import { ScrollArea } from "@/components/ui/scroll-area";


import { MemberManagementModal } from "@/components/member/MemberManagementModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionManagerModal } from "@/components/permissions/PermissionManagerModal";
import { PeerDiscoveryModal } from "@/components/p2p/PeerDiscoveryModal";
import { PendingRequestsModal } from "@/components/p2p/PendingRequestsModal";
import { CreateGroupDialog } from "@/components/chat/CreateGroupDialog";
import type { User as WorkspaceMember } from '@/types/workspace-entities';
import type { RegisteredPeer } from '@/hooks/use-registered-peers';
import { roleBadgeClass } from '@/lib/role-badge';
import { useGuardedNavigate, type GuardedNavigate } from '@/hooks/use-guarded-navigate';
import { AllMembersRow } from './AllMembersRow';
import { useMemberActionBlocks } from './use-member-action-blocks';
import type { MemberActionBlocks } from './member-actions-gate';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import { useLevelName } from '@/hooks/use-level-name';
/** Role badge classes. Defined once in lib/role-badge so the sidebar and user
 *  search cannot drift apart again — they already had, and only one was fixed. */
export function getRoleColor(role: string): string {
  return roleBadgeClass(role);
}



interface MembersSectionModalsProps {
  currentNodeId: string | null;
  currentUsername?: string;
  members: WorkspaceMember[];
  registeredPeers: RegisteredPeer[];
  locationText: string;
  // Modal visibility
  showAddModal: boolean;
  showEditModal: boolean;
  showRemoveModal: boolean;
  showAllMembersDialog: boolean;
  showPermissionModal: boolean;
  showPeerDiscovery: boolean;
  showInvite: boolean;
  onSetShowInvite: (open: boolean) => void;
  workspaceName: string;
  serverAddress: string | undefined;
  showPendingRequests: boolean;
  showCreateGroupDialog: boolean;
  // Modal data
  selectedMember: WorkspaceMember | null;
  permissionModalData: { userId: string; domainId: string; domainType: string } | null;
  // Callbacks
  onSetShowAddModal: (v: boolean) => void;
  onSetShowEditModal: (v: boolean) => void;
  onSetShowRemoveModal: (v: boolean) => void;
  onSetShowAllMembersDialog: (v: boolean) => void;
  onSetShowPermissionModal: (v: boolean) => void;
  onSetShowPeerDiscovery: (v: boolean) => void;
  onSetShowPendingRequests: (v: boolean) => void;
  onSetShowCreateGroupDialog: (v: boolean) => void;
  onClearSelectedMember: () => void;
  onClearPermissionModalData: () => void;
  onEditMember: (member: WorkspaceMember) => void;
  onRemoveMember: (member: WorkspaceMember) => void;
  onManagePermissions: (member: WorkspaceMember) => void;
  onCreateGroup: (name: string, members: Array<{ cid: string; username: string; roleId: string }>) => Promise<string>;
}

export function MembersSectionModals({
  currentNodeId,
  currentUsername,
  members,
  registeredPeers,
  locationText,
  showAddModal, showEditModal, showRemoveModal,
  showAllMembersDialog, showPermissionModal, showPeerDiscovery,
  showInvite, onSetShowInvite, workspaceName, serverAddress,
  showPendingRequests, showCreateGroupDialog,
  selectedMember, permissionModalData,
  onSetShowAddModal, onSetShowEditModal, onSetShowRemoveModal,
  onSetShowAllMembersDialog, onSetShowPermissionModal, onSetShowPeerDiscovery,
  onSetShowPendingRequests, onSetShowCreateGroupDialog,
  onClearSelectedMember, onClearPermissionModalData,
  onEditMember, onRemoveMember, onManagePermissions,
  onCreateGroup,
}: MembersSectionModalsProps): JSX.Element {
  const navigate: GuardedNavigate = useGuardedNavigate();
  const memberBlocks: MemberActionBlocks = useMemberActionBlocks(currentNodeId ?? WORKSPACE_ROOT_ID);
  const nameOfLevel: (levelId: string) => string = useLevelName();
  // Leaving the workspace view unmounts the editor, so ask first -- as every
  // other navigation out of the sidebar does.
  const openDirectory = async (): Promise<void> => {
    onSetShowPeerDiscovery(false);
    await navigate('/directory');
  };
  // Open it: every other way into a group navigates; this one did not.
  const createAndOpenGroup = async (...args: Parameters<MembersSectionModalsProps['onCreateGroup']>): Promise<void> => {
    const groupId: string = await onCreateGroup(...args);
    if (groupId) await navigate(`/groups/${groupId}`);
  };
  return (
    <>
      <MemberManagementModal isOpen={showAddModal} onClose={() => onSetShowAddModal(false)} mode="add" domainId={currentNodeId ?? undefined} />
      <MemberManagementModal isOpen={showEditModal} onClose={() => { onSetShowEditModal(false); onClearSelectedMember(); }} mode="edit" domainId={currentNodeId ?? undefined} member={selectedMember ? { id: selectedMember.id, username: selectedMember.username, role: selectedMember.role || 'member' } : undefined} />
      <MemberManagementModal isOpen={showRemoveModal} onClose={() => { onSetShowRemoveModal(false); onClearSelectedMember(); }} mode="remove" domainId={currentNodeId ?? undefined} member={selectedMember ? { id: selectedMember.id, username: selectedMember.username, role: selectedMember.role || 'member' } : undefined} />

      {/* All Members Dialog */}
      <Dialog open={showAllMembersDialog} onOpenChange={onSetShowAllMembersDialog}>
        <DialogContent className="max-w-2xl bg-surface border-border">
          <DialogHeader><DialogTitle className="text-foreground">{locationText}</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {members.map((member) => (
                <AllMembersRow
                  key={member.id}
                  member={member}
                  currentUsername={currentUsername}
                  blocks={memberBlocks}
                  nameOfLevel={nameOfLevel}
                  onManagePermissions={() => { onManagePermissions(member); onSetShowAllMembersDialog(false); }}
                  onEditMember={() => { onEditMember(member); onSetShowAllMembersDialog(false); }}
                  onRemoveMember={() => { onRemoveMember(member); onSetShowAllMembersDialog(false); }}
                />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {permissionModalData && <PermissionManagerModal isOpen={showPermissionModal} onClose={() => { onSetShowPermissionModal(false); onClearPermissionModalData(); }} userId={permissionModalData.userId} domainId={permissionModalData.domainId} domainType={permissionModalData.domainType} />}
      <PeerDiscoveryModal isOpen={showPeerDiscovery} onClose={() => onSetShowPeerDiscovery(false)} onOpenDirectory={() => void openDirectory()} />
      <PendingRequestsModal isOpen={showPendingRequests} onClose={() => onSetShowPendingRequests(false)} />
      <CreateGroupDialog open={showCreateGroupDialog} onOpenChange={onSetShowCreateGroupDialog} availablePeers={registeredPeers.map(p => ({ cid: p.cid, username: p.username, isOnline: p.isOnline }))} currentUsername={currentUsername || 'User'} onCreateGroup={createAndOpenGroup} />
      <InviteToWorkspaceDialog
        open={showInvite}
        onOpenChange={onSetShowInvite}
        workspaceName={workspaceName}
        serverAddress={serverAddress}
      />
    </>
  );
}
