/** Sidebar section displaying workspace members, P2P peers, and conversations. */

import { Plus } from "lucide-react";
import { PendingRequestsBadge } from './PendingRequestsBadge';
import { membersSectionLabel } from './members-section-label';
import { MembersHeaderActions } from './MembersHeaderActions';
import { connectionManager } from '@/lib/connection';
import { mayLeaveEditor } from '@/lib/leave-editor';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useLocation, useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { MemberListItems } from './MemberListItems';
import { getEntityMetadata, getEntityTypeString } from "@/lib/entity-type-registry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { peerRegistrationStore } from "@/lib/peer-registration-store";
import { GroupConversationRow } from "./GroupConversationRow";
import { PeerListRow } from "./PeerListRow";
import { useGroupConversations, useRegisteredPeers, useConversationPeers, useEventListener } from '@/hooks';
import { useDomainMembers } from '@/hooks/use-domain-members';
import { debugLog } from '@/lib/debug-config';
import type { User as WorkspaceMember } from '@/types/workspace-entities';
import { MembersSectionModals } from './MembersSectionModals';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

export const MembersSection = () => {
  const location = useLocation();
  const confirm = useConfirm();
  const [showInvite, setShowInvite] = useState(false);
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const params = new URLSearchParams(location.search);
  const currentNodeId = params.get("nodeId");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [showAllMembersDialog, setShowAllMembersDialog] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionModalData, setPermissionModalData] = useState<{
    userId: string; domainId: string; domainType: string;
  } | null>(null);
  const [showPeerDiscovery, setShowPeerDiscovery] = useState(false);
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);

  const { groups: groupConversations, createGroup } = useGroupConversations();
  const { registeredPeers } = useRegisteredPeers();
  const { peersWithConversations } = useConversationPeers({ registeredPeers });

  const conversationPeerCids: Set<string> = new Set(peersWithConversations.map(c => c.peerCid));
  const filteredRegisteredPeers = registeredPeers.filter(p => !conversationPeerCids.has(p.cid));

  const updatePendingCount = useCallback(async () => {
    const count: number = await peerRegistrationStore.getPendingCount();
    setPendingRequestCount(count);
  }, []);

  useEffect(() => {
    updatePendingCount().catch((err: unknown) => debugLog('MembersSection', 'Failed to update pending count:', err));
  }, [updatePendingCount]);

  useEventListener('peer-requests:updated', () => {
    updatePendingCount().catch((err: unknown) => debugLog('MembersSection', 'Failed to update pending count:', err));
  });

  useEventListener('open-pending-requests-modal', () => { setShowPendingRequests(true); });

  const activeDomainId = currentNodeId;
  const { members, isLoadingMembers } = useDomainMembers(activeDomainId);

  const handleEditMember = (m: WorkspaceMember) => { setSelectedMember(m); setShowEditModal(true); };
  const handleRemoveMember = (m: WorkspaceMember) => { setSelectedMember(m); setShowRemoveModal(true); };
  const handleManagePermissions = (member: WorkspaceMember) => {
    let domainId: string = WORKSPACE_ROOT_ID;
    let domainType: string = 'workspace';
    if (currentNodeId) {
      domainId = currentNodeId;
      const node = state.nodes[currentNodeId];
      domainType = node ? getEntityTypeString(node.entity_type).toLowerCase() : 'workspace';
    }
    setPermissionModalData({ userId: member.id, domainId, domainType });
    setShowPermissionModal(true);
  };

  const handlePeerClick = async (cid: string, username: string) => {
    // The workspace view renders P2P chat instead of the editor, so this
    // unmounts the buffer as completely as selecting another node does.
    if (!(await mayLeaveEditor(confirm))) return;

    const searchParams = new URLSearchParams(location.search);
    searchParams.set('showP2P', 'true');
    searchParams.set('p2pUser', username);
    searchParams.set('channel', cid);
    navigate(`${location.pathname}?${searchParams.toString()}`);
  };

  const getLocationText = () => {
    const node = currentNodeId ? state.nodes[currentNodeId] : undefined;
    return membersSectionLabel({
      entityLabel: node ? getEntityMetadata(node.entity_type).label : undefined,
    });
  };

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <div className="flex items-center gap-2">
            <SidebarGroupLabel className="text-primary-accent font-semibold m-0 px-0">
              {getLocationText().toUpperCase()}
            </SidebarGroupLabel>
            <PendingRequestsBadge count={pendingRequestCount} onOpen={() => setShowPendingRequests(true)} />
          </div>
          <MembersHeaderActions
            onDiscover={() => setShowPeerDiscovery(true)}
            onInvite={() => setShowInvite(true)}
          />
        </div>
        <SidebarGroupContent>
          <ScrollArea className="max-h-[30vh]">
            <SidebarMenu>
              {isLoadingMembers ? (
                <SidebarMenuItem className="px-3 py-2 text-sm text-muted-foreground">
                  Loading members...
                </SidebarMenuItem>
              ) : members.length === 0 && filteredRegisteredPeers.length === 0 && registeredPeers.length === 0 ? (
                <SidebarMenuItem className="px-3 py-2 text-sm text-muted-foreground">
                  Nobody else is here yet. Invite someone with the share button above,
                  or use the add button to find people who have already joined.
                </SidebarMenuItem>
              ) : members.length > 0 && (
                <MemberListItems
                  members={members}
                  currentUsername={state.currentUser?.username}
                  onEditMember={handleEditMember}
                  onRemoveMember={handleRemoveMember}
                  onManagePermissions={handleManagePermissions}
                  onShowAllMembers={() => setShowAllMembersDialog(true)}
                />
              )}
            </SidebarMenu>
          </ScrollArea>

          {filteredRegisteredPeers.length > 0 && (
            <div className="mt-2 border-t border-card pt-2">
              <SidebarMenu>
                {filteredRegisteredPeers.map((peer) => (
                  <PeerListRow key={peer.cid} cid={peer.cid} username={peer.username} isOnline={peer.isOnline} isConnected={peer.isConnected} onClick={() => void handlePeerClick(peer.cid, peer.username)} />
                ))}
              </SidebarMenu>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {(peersWithConversations.length > 0 || groupConversations.length > 0) && (
        <SidebarGroup className="flex-shrink-0 min-h-[2rem] mb-4">
          <div className="flex items-center justify-between px-3">
            <SidebarGroupLabel className="text-primary-accent font-semibold text-xs px-0">CONVERSATIONS</SidebarGroupLabel>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="New group chat" data-testid="new-group-chat-button" className="tap-target h-6 w-6 p-0 text-primary-accent hover:text-primary-foreground hover:bg-primary" onClick={() => setShowCreateGroupDialog(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>New Group Chat</p></TooltipContent>
            </Tooltip>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {peersWithConversations.map((conv) => (
                <PeerListRow key={conv.peerCid} cid={conv.peerCid} username={conv.peerUsername} isOnline={conv.isOnline} isConnected={conv.isConnected} unreadCount={conv.unreadCount} onClick={() => void handlePeerClick(conv.peerCid, conv.peerUsername)} />
              ))}
              {groupConversations.map((group) => (
                <GroupConversationRow key={group.id} group={group} onClick={(g) => navigate(`/groups/${g.id}`)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      <MembersSectionModals
        currentNodeId={currentNodeId}
        currentUsername={state.currentUser?.username}
        members={members}
        registeredPeers={registeredPeers}
        locationText={getLocationText()}
        showAddModal={showAddModal}
        showEditModal={showEditModal}
        showRemoveModal={showRemoveModal}
        showAllMembersDialog={showAllMembersDialog}
        showPermissionModal={showPermissionModal}
        showPeerDiscovery={showPeerDiscovery}
        showPendingRequests={showPendingRequests}
        showCreateGroupDialog={showCreateGroupDialog}
        selectedMember={selectedMember}
        permissionModalData={permissionModalData}
        onSetShowAddModal={setShowAddModal}
        onSetShowEditModal={setShowEditModal}
        onSetShowRemoveModal={setShowRemoveModal}
        onSetShowAllMembersDialog={setShowAllMembersDialog}
        onSetShowPermissionModal={setShowPermissionModal}
        showInvite={showInvite}
        onSetShowInvite={setShowInvite}
        workspaceName={state.workspace?.name || 'this workspace'}
        serverAddress={connectionManager.getConnectionInfo()?.serverAddress}
        onSetShowPeerDiscovery={setShowPeerDiscovery}
        onSetShowPendingRequests={setShowPendingRequests}
        onSetShowCreateGroupDialog={setShowCreateGroupDialog}
        onClearSelectedMember={() => setSelectedMember(null)}
        onClearPermissionModalData={() => setPermissionModalData(null)}
        onEditMember={handleEditMember}
        onRemoveMember={handleRemoveMember}
        onManagePermissions={handleManagePermissions}
        onCreateGroup={async (name, membersList) => { await createGroup(name, membersList); }}
      />

    </>
  );
};
