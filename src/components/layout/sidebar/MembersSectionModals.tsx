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

import { MoreVertical, Shield, User as UserIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberManagementModal } from "@/components/member/MemberManagementModal";
import { Badge } from "@/components/ui/badge";
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

export function getRoleIcon(role: string) {
  return (role === "owner" || role === "admin")
    ? <Shield className="h-4 w-4" />
    : <UserIcon className="h-4 w-4" />;
}

export function getRoleColor(role: string) {
  return ({ owner: "bg-primary", admin: "bg-primary-accent", member: "bg-success", guest: "bg-gray-600" }[role] || "bg-gray-500");
}

export function capitalizeRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
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
  onCreateGroup: (name: string, members: Array<{ cid: string; username: string; roleId: string }>) => Promise<void>;
}

export function MembersSectionModals({
  currentNodeId,
  currentUsername,
  members,
  registeredPeers,
  locationText,
  showAddModal, showEditModal, showRemoveModal,
  showAllMembersDialog, showPermissionModal, showPeerDiscovery,
  showPendingRequests, showCreateGroupDialog,
  selectedMember, permissionModalData,
  onSetShowAddModal, onSetShowEditModal, onSetShowRemoveModal,
  onSetShowAllMembersDialog, onSetShowPermissionModal, onSetShowPeerDiscovery,
  onSetShowPendingRequests, onSetShowCreateGroupDialog,
  onClearSelectedMember, onClearPermissionModalData,
  onEditMember, onRemoveMember, onManagePermissions,
  onCreateGroup,
}: MembersSectionModalsProps) {
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
                <div key={member.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-card transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    {getRoleIcon(member.role || 'member')}
                    <div className="flex-1">
                      <p className="text-foreground font-medium">{member.displayName || member.username}</p>
                      {member.username && <p className="text-sm text-muted-foreground">@{member.username}</p>}
                    </div>
                    <Badge variant="secondary" className={`${getRoleColor(member.role || 'member')} text-foreground text-xs`}>{capitalizeRole(member.role || 'member')}</Badge>
                  </div>
                  {currentUsername !== member.username && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { onManagePermissions(member); onSetShowAllMembersDialog(false); }}><Shield className="h-4 w-4 mr-2" />Manage Permissions</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { onEditMember(member); onSetShowAllMembersDialog(false); }}>Change Role</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { onRemoveMember(member); onSetShowAllMembersDialog(false); }} className="text-destructive">Remove Member</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {permissionModalData && <PermissionManagerModal isOpen={showPermissionModal} onClose={() => { onSetShowPermissionModal(false); onClearPermissionModalData(); }} userId={permissionModalData.userId} domainId={permissionModalData.domainId} domainType={permissionModalData.domainType} />}
      <PeerDiscoveryModal isOpen={showPeerDiscovery} onClose={() => onSetShowPeerDiscovery(false)} />
      <PendingRequestsModal isOpen={showPendingRequests} onClose={() => onSetShowPendingRequests(false)} />
      <CreateGroupDialog open={showCreateGroupDialog} onOpenChange={onSetShowCreateGroupDialog} availablePeers={registeredPeers.map(p => ({ cid: p.cid, username: p.username, isOnline: p.isOnline }))} currentUsername={currentUsername || 'User'} onCreateGroup={onCreateGroup} />
    </>
  );
}
