/**
 * MembersSection Component
 *
 * Sidebar section displaying workspace members, registered P2P peers,
 * and active conversations.
 */

import { Users, UserPlus, MoreVertical, Shield, User, Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberManagementModal } from "@/components/member/MemberManagementModal";
import WorkspaceService from "@/lib/workspace-service";
import { Badge } from "@/components/ui/badge";
import { workspaceEvents } from "@/lib/workspace-events";
import { getEntityMetadata, getEntityTypeString } from "@/lib/entity-type-registry";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PermissionManagerModal } from "@/components/permissions/PermissionManagerModal";
import { PeerDiscoveryModal } from "@/components/p2p/PeerDiscoveryModal";
import { PendingRequestsModal } from "@/components/p2p/PendingRequestsModal";
import { peerRegistrationStore } from "@/lib/peer-registration-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GroupConversationRow } from "./GroupConversationRow";
import { PeerListRow } from "./PeerListRow";
import { useGroupConversations, useRegisteredPeers, useConversationPeers, useEventListener } from '@/hooks';
import { CreateGroupDialog } from "@/components/chat/CreateGroupDialog";
import { runAsyncSetup } from '@/lib/utils/async-utils';

interface Member {
  id: string;
  name: string;
  username?: string;
  role: string;
  full_name?: string;
}

const MEMBERS_TO_SHOW = 5;

export const MembersSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const params = new URLSearchParams(location.search);
  const currentNodeId = params.get("nodeId");
  const currentOfficeId = params.get("officeId");
  const currentRoomId = params.get("roomId");

  // Members state
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showAllMembersDialog, setShowAllMembersDialog] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionModalData, setPermissionModalData] = useState<{
    userId: string;
    domainId: string;
    domainType: string;
  } | null>(null);
  const [showPeerDiscovery, setShowPeerDiscovery] = useState(false);
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);

  // Custom hooks
  const { groups: groupConversations, createGroup } = useGroupConversations();
  const { registeredPeers } = useRegisteredPeers();
  const { peersWithConversations } = useConversationPeers({ registeredPeers });

  // Filter out peers that already appear in CONVERSATIONS
  const conversationPeerCids = new Set(peersWithConversations.map(c => c.peerCid));
  const filteredRegisteredPeers = registeredPeers.filter(p => !conversationPeerCids.has(p.cid));

  // Load pending request count
  const updatePendingCount = useCallback(async () => {
    const count = await peerRegistrationStore.getPendingCount();
    setPendingRequestCount(count);
  }, []);

  // Initial load
  useEffect(() => {
    updatePendingCount().catch(console.error);
  }, [updatePendingCount]);

  // Listen for pending request updates
  useEventListener('peer-requests:updated', () => {
    updatePendingCount().catch(console.error);
  });

  // Listen for notification card clicks
  useEventListener('open-pending-requests-modal', () => {
    setShowPendingRequests(true);
  });

  // Load members when location changes
  const activeDomainId = currentNodeId ?? currentRoomId ?? currentOfficeId;
  useEffect(() => {
    const loadMembers = async () => {
      if (!activeDomainId) {
        setMembers([]);
        return;
      }
      setIsLoadingMembers(true);
      try {
        await WorkspaceService.listMembers(activeDomainId);
      } catch (error) {
        console.error("Error loading members:", error);
      } finally {
        setIsLoadingMembers(false);
      }
    };
    runAsyncSetup(loadMembers);
  }, [activeDomainId]);

  // Listen for members loaded event
  useEffect(() => {
    const handleMembersLoaded = (payload: { members?: Member[] }) => {
      if (payload.members) setMembers(payload.members);
    };
    runAsyncSetup(async () => { await workspaceEvents.onMemberEvent('members:loaded', handleMembersLoaded); });
  }, []);

  // Handlers
  const handleEditMember = (member: Member) => {
    setSelectedMember(member);
    setShowEditModal(true);
  };

  const handleRemoveMember = (member: Member) => {
    setSelectedMember(member);
    setShowRemoveModal(true);
  };

  const handleManagePermissions = (member: Member) => {
    let domainId = '';
    let domainType = 'workspace';

    // Prefer generic nodeId for schema-driven hierarchy
    if (currentNodeId) {
      domainId = currentNodeId;
      const node = state.nodes[currentNodeId];
      domainType = node ? getEntityTypeString(node.entity_type).toLowerCase() : 'workspace';
    } else if (currentRoomId) { domainId = currentRoomId; domainType = 'room'; }
    else if (currentOfficeId) { domainId = currentOfficeId; domainType = 'office'; }
    else { domainId = 'workspace-root'; domainType = 'workspace'; }

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

  const getRoleIcon = (role: string) => (role === "Owner" || role === "Admin") ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />;
  const getRoleColor = (role: string) => ({ Owner: "bg-purple-600", Admin: "bg-blue-600", Member: "bg-green-600", Guest: "bg-gray-600" }[role] || "bg-gray-500");

  const getLocationText = () => {
    // Prefer generic node label from hierarchy schema
    if (currentNodeId) {
      const node = state.nodes[currentNodeId];
      if (node) {
        const label = getEntityMetadata(node.entity_type).label;
        return `${label} Members`;
      }
    }
    if (currentRoomId) return "Room Members";
    if (currentOfficeId) return "Office Members";
    if (registeredPeers.length > 0 && members.length === 0) return "Connected Peers";
    return "Workspace Members";
  };

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <div className="flex items-center gap-2">
            <SidebarGroupLabel className="text-[#9b87f5] font-semibold m-0 px-0">
              {getLocationText().toUpperCase()}
            </SidebarGroupLabel>
            {pendingRequestCount > 0 && (
              <Badge
                data-testid="pending-requests-badge"
                className="h-5 min-w-[20px] px-1.5 bg-red-500 text-white cursor-pointer hover:bg-red-600 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowPendingRequests(true); }}
                title={`${pendingRequestCount} pending connection request${pendingRequestCount > 1 ? 's' : ''}`}
              >
                {pendingRequestCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            onClick={() => setShowPeerDiscovery(true)}
            title="Discover Peers"
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
        <SidebarGroupContent>
          <ScrollArea className="max-h-[30vh]">
            <SidebarMenu>
              {isLoadingMembers ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading members...</div>
              ) : members.length === 0 && filteredRegisteredPeers.length === 0 && registeredPeers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No members yet. Use the <UserPlus className="h-3 w-3 inline mx-1" /> button to discover peers.
                </div>
              ) : members.length > 0 && (
                <div className="animate-fade-in">
                  {members.slice(0, MEMBERS_TO_SHOW).map((member) => (
                    <SidebarMenuItem key={member.id}>
                      <div className="flex items-center w-full group">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors flex-1">
                                <div className="flex items-center gap-2 flex-1">
                                  {getRoleIcon(member.role)}
                                  <span className="flex-1 truncate">{member.name || member.full_name || member.username}</span>
                                  <Badge variant="secondary" className={`${getRoleColor(member.role)} text-white text-xs`}>{member.role}</Badge>
                                </div>
                              </SidebarMenuButton>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{member.name || member.full_name || member.username}</p>
                              {member.username && <p className="text-xs text-muted-foreground">@{member.username}</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {state.currentUser?.username !== member.username && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleManagePermissions(member)}><Shield className="h-4 w-4 mr-2" />Manage Permissions</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditMember(member)}>Change Role</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRemoveMember(member)} className="text-red-600">Remove Member</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </SidebarMenuItem>
                  ))}
                  {members.length > MEMBERS_TO_SHOW && (
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={() => setShowAllMembersDialog(true)} className="text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors">
                        <Users className="h-4 w-4 mr-2" />View all {members.length} members
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </div>
              )}
            </SidebarMenu>
          </ScrollArea>

          {/* Registered P2P Peers */}
          {filteredRegisteredPeers.length > 0 && (
            <div className="mt-2 border-t border-[#444A6C] pt-2">
              <SidebarMenu>
                {filteredRegisteredPeers.map((peer) => (
                  <PeerListRow key={peer.cid} cid={peer.cid} username={peer.username} isOnline={peer.isOnline} isConnected={peer.isConnected} onClick={() => handlePeerClick(peer.cid, peer.username)} />
                ))}
              </SidebarMenu>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Conversations - P2P Direct Messages + Group Chats */}
      {(peersWithConversations.length > 0 || groupConversations.length > 0) && (
        <SidebarGroup className="flex-shrink-0 min-h-[2rem] mb-4">
          <div className="flex items-center justify-between px-3">
            <SidebarGroupLabel className="text-[#9b87f5] font-semibold text-xs px-0">CONVERSATIONS</SidebarGroupLabel>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-[#9b87f5] hover:text-white hover:bg-[#6E59A5]" onClick={() => setShowCreateGroupDialog(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>New Group Chat</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      {/* Modals */}
      <MemberManagementModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} mode="add" domainId={currentNodeId ?? currentRoomId ?? currentOfficeId ?? undefined} />
      <MemberManagementModal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setSelectedMember(null); }} mode="edit" domainId={currentNodeId ?? currentRoomId ?? currentOfficeId ?? undefined} member={selectedMember ? { id: selectedMember.id, username: selectedMember.username || selectedMember.name, role: selectedMember.role } : undefined} />
      <MemberManagementModal isOpen={showRemoveModal} onClose={() => { setShowRemoveModal(false); setSelectedMember(null); }} mode="remove" domainId={currentNodeId ?? currentRoomId ?? currentOfficeId ?? undefined} member={selectedMember ? { id: selectedMember.id, username: selectedMember.username || selectedMember.name, role: selectedMember.role } : undefined} />

      {/* All Members Dialog */}
      <Dialog open={showAllMembersDialog} onOpenChange={setShowAllMembersDialog}>
        <DialogContent className="max-w-2xl bg-[#2E3356] border-purple-800">
          <DialogHeader><DialogTitle className="text-white">{getLocationText()}</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#343A5C] transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    {getRoleIcon(member.role)}
                    <div className="flex-1">
                      <p className="text-white font-medium">{member.name || member.full_name || member.username}</p>
                      {member.username && <p className="text-sm text-muted-foreground">@{member.username}</p>}
                    </div>
                    <Badge variant="secondary" className={`${getRoleColor(member.role)} text-white text-xs`}>{member.role}</Badge>
                  </div>
                  {state.currentUser?.username !== member.username && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { handleManagePermissions(member); setShowAllMembersDialog(false); }}><Shield className="h-4 w-4 mr-2" />Manage Permissions</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { handleEditMember(member); setShowAllMembersDialog(false); }}>Change Role</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { handleRemoveMember(member); setShowAllMembersDialog(false); }} className="text-red-600">Remove Member</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {permissionModalData && <PermissionManagerModal isOpen={showPermissionModal} onClose={() => { setShowPermissionModal(false); setPermissionModalData(null); }} userId={permissionModalData.userId} domainId={permissionModalData.domainId} domainType={permissionModalData.domainType} />}
      <PeerDiscoveryModal isOpen={showPeerDiscovery} onClose={() => setShowPeerDiscovery(false)} />
      <PendingRequestsModal isOpen={showPendingRequests} onClose={() => setShowPendingRequests(false)} />
      <CreateGroupDialog open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog} availablePeers={registeredPeers.map(p => ({ cid: p.cid, username: p.username, isOnline: p.isOnline }))} currentUsername={state.currentUser?.username || 'User'} onCreateGroup={async (name, membersList) => { await createGroup(name, membersList); }} />
    </>
  );
};
