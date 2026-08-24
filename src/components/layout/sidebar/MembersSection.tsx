/** Sidebar section displaying workspace members, P2P peers, and conversations. */

import { UserPlus, Plus } from "lucide-react";
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
import WorkspaceService from "@/lib/workspace-service";
import { Badge } from "@/components/ui/badge";
import { workspaceEvents, type MembersPayload } from "@/lib/workspace-events";
import { getEntityMetadata, getEntityTypeString } from "@/lib/entity-type-registry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { peerRegistrationStore } from "@/lib/peer-registration-store";
import { GroupConversationRow } from "./GroupConversationRow";
import { PeerListRow } from "./PeerListRow";
import { useGroupConversations, useRegisteredPeers, useConversationPeers, useEventListener } from '@/hooks';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import type { User as WorkspaceMember } from '@/types/workspace-entities';
import { MembersSectionModals } from './MembersSectionModals';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

export const MembersSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const params = new URLSearchParams(location.search);
  const currentNodeId = params.get("nodeId");

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
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

  const conversationPeerCids = new Set(peersWithConversations.map(c => c.peerCid));
  const filteredRegisteredPeers = registeredPeers.filter(p => !conversationPeerCids.has(p.cid));

  const updatePendingCount = useCallback(async () => {
    const count = await peerRegistrationStore.getPendingCount();
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
  useEffect(() => {
    const loadMembers = async () => {
      if (!activeDomainId) { setMembers([]); return; }
      setIsLoadingMembers(true);
      try { await WorkspaceService.listMembers(activeDomainId); }
      catch (error) { debugLog('MembersSection', 'Error loading members:', error); }
      finally { setIsLoadingMembers(false); }
    };
    runAsyncSetup(loadMembers);
  }, [activeDomainId]);

  useEffect(() => {
    const handleMembersLoaded = (payload: MembersPayload) => {
      if (payload.members) setMembers(payload.members);
    };
    runAsyncSetup(async () => { await workspaceEvents.onMemberEvent('members:loaded', handleMembersLoaded); });
  }, []);

  const handleEditMember = (member: WorkspaceMember) => { setSelectedMember(member); setShowEditModal(true); };
  const handleRemoveMember = (member: WorkspaceMember) => { setSelectedMember(member); setShowRemoveModal(true); };
  const handleManagePermissions = (member: WorkspaceMember) => {
    let domainId = WORKSPACE_ROOT_ID;
    let domainType = 'workspace';
    if (currentNodeId) {
      domainId = currentNodeId;
      const node = state.nodes[currentNodeId];
      domainType = node ? getEntityTypeString(node.entity_type).toLowerCase() : 'workspace';
    }
    setPermissionModalData({ userId: member.id, domainId, domainType });
    setShowPermissionModal(true);
  };

  const handlePeerClick = (cid: string, username: string) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('showP2P', 'true');
    searchParams.set('p2pUser', username);
    searchParams.set('channel', cid);
    navigate(`${location.pathname}?${searchParams.toString()}`);
  };

  const getLocationText = () => {
    if (currentNodeId) {
      const node = state.nodes[currentNodeId];
      if (node) return `${getEntityMetadata(node.entity_type).label} Members`;
    }
    if (registeredPeers.length > 0 && members.length === 0) return "Connected Peers";
    return "Workspace Members";
  };

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <div className="flex items-center gap-2">
            <SidebarGroupLabel className="text-primary-accent font-semibold m-0 px-0">
              {getLocationText().toUpperCase()}
            </SidebarGroupLabel>
            {pendingRequestCount > 0 && (
              <Badge
                data-testid="pending-requests-badge"
                className="h-5 min-w-[20px] px-1.5 bg-red-500 text-foreground cursor-pointer hover:bg-red-600 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowPendingRequests(true); }}
                title={`${pendingRequestCount} pending connection request${pendingRequestCount > 1 ? 's' : ''}`}
              >
                {pendingRequestCount}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-primary-accent hover:bg-purple-500/15 hover:text-foreground" onClick={() => setShowPeerDiscovery(true)} title="Discover Peers">
            <UserPlus className="h-4 w-4" />
          </Button>
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
                  No members yet. Use the <UserPlus className="h-3 w-3 inline mx-1" /> button to discover peers.
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
                  <PeerListRow key={peer.cid} cid={peer.cid} username={peer.username} isOnline={peer.isOnline} isConnected={peer.isConnected} onClick={() => handlePeerClick(peer.cid, peer.username)} />
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
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-primary-accent hover:text-primary-foreground hover:bg-primary" onClick={() => setShowCreateGroupDialog(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>New Group Chat</p></TooltipContent>
            </Tooltip>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {peersWithConversations.map((conv) => (
                <PeerListRow key={conv.peerCid} cid={conv.peerCid} username={conv.peerUsername} isOnline={conv.isOnline} isConnected={conv.isConnected} unreadCount={conv.unreadCount} onClick={() => handlePeerClick(conv.peerCid, conv.peerUsername)} />
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
