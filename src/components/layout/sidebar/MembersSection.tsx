import { Users, UserPlus, MoreVertical, Shield, User } from "lucide-react";
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
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
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
import { eventEmitter } from "@/lib/event-emitter";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";
import { p2pAutoConnectService } from "@/lib/p2p-auto-connect-service";
import { P2PMessengerManager } from "@/lib/p2p-messenger-manager";
import { connectionManager } from "@/lib/connection-manager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Member {
  id: string;
  name: string;  // From User type in bindings
  username?: string; // Optional for backwards compatibility
  role: string;
  full_name?: string; // Optional for backwards compatibility
}

interface RegisteredPeer {
  cid: string;
  username: string;
  isOnline: boolean;
  isConnected: boolean;
}

interface ConversationPeer {
  peerCid: string;
  peerUsername: string;
  isOnline: boolean;
  isConnected: boolean;
  unreadCount: number;
  lastMessageTime?: number;
}

export const MembersSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const params = new URLSearchParams(location.search);
  const currentOfficeId = params.get("officeId");
  const currentRoomId = params.get("roomId");
  
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showAllMembersDialog, setShowAllMembersDialog] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionModalData, setPermissionModalData] = useState<{
    userId: string;
    domainId: string;
    domainType: 'workspace' | 'office' | 'room';
  } | null>(null);
  const [showPeerDiscovery, setShowPeerDiscovery] = useState(false);
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [registeredPeers, setRegisteredPeers] = useState<RegisteredPeer[]>([]);
  const [peersWithConversations, setPeersWithConversations] = useState<ConversationPeer[]>([]);

  const MEMBERS_TO_SHOW = 5; // Show first 5 members in sidebar

  // Listen for pending peer registration requests
  useEffect(() => {
    const updatePendingCount = () => {
      setPendingRequestCount(peerRegistrationStore.getPendingCount());
    };

    // Initial load
    updatePendingCount();

    // Listen for updates
    eventEmitter.on('peer-requests:updated', updatePendingCount);
    return () => {
      eventEmitter.off('peer-requests:updated', updatePendingCount);
    };
  }, []);

  // Listen for notification card clicks to open pending requests modal
  useEffect(() => {
    const openModal = () => setShowPendingRequests(true);
    eventEmitter.on('open-pending-requests-modal', openModal);
    return () => {
      eventEmitter.off('open-pending-requests-modal', openModal);
    };
  }, []);

  // Load registered P2P peers for DIRECT MESSAGES section
  useEffect(() => {
    const loadRegisteredPeers = async () => {
      try {
        // First, get the internal state which has preserved usernames from PeerRegisterNotification
        const { registeredPeers: cachedPeers } = p2pRegistrationService.getPeers();

        // Also trigger a backend refresh to ensure we have latest data
        // This will update internal state but preserve usernames
        try {
          await p2pRegistrationService.listRegisteredPeers();
        } catch (e) {
          // Ignore fetch errors, use cached data
        }

        // Get updated state after refresh
        const { registeredPeers: updatedPeers } = p2pRegistrationService.getPeers();

        // Use updated peers if available, else cached
        const peersToUse = updatedPeers.length > 0 ? updatedPeers : cachedPeers;

        const peerList = peersToUse.map(p => {
          const cidStr = p.cid?.toString() || '';
          // Prefer username from service (has preserved names), then fallback
          const displayName = (p.username && p.username !== 'Unknown')
            ? p.username
            : (cidStr ? `Peer ${cidStr.slice(-6)}` : 'Unknown Peer');
          return {
            cid: cidStr,
            username: displayName,
            isOnline: p2pAutoConnectService.isPeerOnline(cidStr),
            isConnected: p2pAutoConnectService.isPeerConnected(cidStr)
          };
        });
        setRegisteredPeers(peerList);

        // Clean up stale conversations that reference non-registered peers
        // This prevents "Peer XXXXXX" entries from previous test runs cluttering the sidebar
        const validPeerCids = new Set(peerList.map(p => p.cid));
        const messenger = P2PMessengerManager.getInstance();
        const cleanedCount = await messenger.cleanupStaleConversations(validPeerCids);
        if (cleanedCount > 0) {
          console.log(`MembersSection: Cleaned up ${cleanedCount} stale peer conversation(s)`);
        }
      } catch (error) {
        console.error('Failed to load registered peers:', error);
      }
    };

    loadRegisteredPeers();

    // Listen for new registrations, acceptance, and connection changes
    const handlePeerRegistered = () => loadRegisteredPeers();
    const handleRegistrationAccepted = () => loadRegisteredPeers();
    const handleConnectionChange = () => loadRegisteredPeers();
    const handlePeersUpdated = () => loadRegisteredPeers();

    eventEmitter.on('p2p:peer-registered', handlePeerRegistered);
    eventEmitter.on('p2p:registration-accepted', handleRegistrationAccepted);
    eventEmitter.on('p2p:peers-updated', handlePeersUpdated);
    eventEmitter.on('p2p-connection-established', handleConnectionChange);
    eventEmitter.on('p2p-connection-lost', handleConnectionChange);

    return () => {
      eventEmitter.off('p2p:peer-registered', handlePeerRegistered);
      eventEmitter.off('p2p:registration-accepted', handleRegistrationAccepted);
      eventEmitter.off('p2p:peers-updated', handlePeersUpdated);
      eventEmitter.off('p2p-connection-established', handleConnectionChange);
      eventEmitter.off('p2p-connection-lost', handleConnectionChange);
    };
  }, []);

  // Load members when location changes
  useEffect(() => {
    const loadMembers = async () => {
      // Only load members if we have either an office ID or room ID
      if (!currentOfficeId && !currentRoomId) {
        console.info("No office or room selected, skipping member load");
        setMembers([]);
        return;
      }

      setIsLoading(true);
      try {
        await WorkspaceService.listMembers(currentOfficeId || undefined, currentRoomId || undefined);
      } catch (error) {
        console.error("Error loading members:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMembers();
  }, [currentOfficeId, currentRoomId]);

  // Listen for members loaded event
  useEffect(() => {
    const handleMembersLoaded = (payload: any) => {
      if (payload.members) {
        setMembers(payload.members);
      }
    };

    // Subscribe to members loaded event using workspace-events
    workspaceEvents.onMemberEvent('members:loaded', handleMembersLoaded);

    // No cleanup needed as workspace-events handles it internally
  }, []);

  // Load peers with active conversations (for DIRECT MESSAGES section)
  useEffect(() => {
    const loadConversations = () => {
      const messenger = P2PMessengerManager.getInstance();
      const conversations = messenger.getAllConversations();

      // Get current user's CID to filter out self-conversations
      const currentCid = connectionManager.getConnectionInfo()?.cid?.toString();

      // Only include peers with actual messages, excluding self-conversations
      const convPeers = conversations
        .filter(c => c.messages.length > 0)
        .filter(c => c.peerCid !== currentCid)  // Exclude self-conversations
        .map(c => {
          // Find the username from registered peers
          const registeredPeer = registeredPeers.find(p => p.cid === c.peerCid);
          // Prefer registered peer username, then a friendly "Peer" label with last 6 digits of CID
          const displayName = registeredPeer?.username ||
            (c.peerCid ? `Peer ${c.peerCid.slice(-6)}` : 'Unknown Peer');
          return {
            peerCid: c.peerCid,
            peerUsername: displayName,
            isOnline: p2pAutoConnectService.isPeerOnline(c.peerCid),
            isConnected: p2pAutoConnectService.isPeerConnected(c.peerCid),
            unreadCount: c.unreadCount,
            lastMessageTime: c.messages[c.messages.length - 1]?.timestamp
          };
        })
        .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

      setPeersWithConversations(convPeers);
    };

    loadConversations();

    // Listen for new messages and conversation updates
    const handleMessageUpdate = () => loadConversations();
    eventEmitter.on('p2p:message-received', handleMessageUpdate);
    eventEmitter.on('p2p:message-sent', handleMessageUpdate);
    eventEmitter.on('p2p:conversation-updated', handleMessageUpdate);

    return () => {
      eventEmitter.off('p2p:message-received', handleMessageUpdate);
      eventEmitter.off('p2p:message-sent', handleMessageUpdate);
      eventEmitter.off('p2p:conversation-updated', handleMessageUpdate);
    };
  }, [registeredPeers]);

  const handleAddMember = () => {
    setShowAddModal(true);
  };

  const handleEditMember = (member: Member) => {
    setSelectedMember(member);
    setShowEditModal(true);
  };

  const handleRemoveMember = (member: Member) => {
    setSelectedMember(member);
    setShowRemoveModal(true);
  };

  const handleManagePermissions = (member: Member) => {
    // Determine domain type and ID based on current context
    let domainId = '';
    let domainType: 'workspace' | 'office' | 'room' = 'workspace';
    
    if (currentRoomId) {
      domainId = currentRoomId;
      domainType = 'room';
    } else if (currentOfficeId) {
      domainId = currentOfficeId;
      domainType = 'office';
    } else {
      domainId = 'workspace-root'; // Default workspace ID
      domainType = 'workspace';
    }
    
    setPermissionModalData({
      userId: member.id,
      domainId,
      domainType,
    });
    setShowPermissionModal(true);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "Owner":
      case "Admin":
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "Owner":
        return "bg-purple-600";
      case "Admin":
        return "bg-blue-600";
      case "Member":
        return "bg-green-600";
      case "Guest":
        return "bg-gray-600";
      default:
        return "bg-gray-500";
    }
  };

  const getLocationText = () => {
    if (currentRoomId) return "Room Members";
    if (currentOfficeId) return "Office Members";
    // At workspace level, show "Connected Peers" if we have P2P peers, else "Workspace Members"
    if (registeredPeers.length > 0 && members.length === 0) return "Connected Peers";
    return "Workspace Members";
  };

  const handlePeerClick = (peer: RegisteredPeer) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('showP2P', 'true');
    searchParams.set('p2pUser', peer.username);
    searchParams.set('channel', peer.cid);
    navigate(`${location.pathname}?${searchParams.toString()}`);
  };

  const handleConversationClick = (conv: ConversationPeer) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('showP2P', 'true');
    searchParams.set('p2pUser', conv.peerUsername);
    searchParams.set('channel', conv.peerCid);
    navigate(`${location.pathname}?${searchParams.toString()}`);
  };

  // Filter out peers that already appear in DIRECT MESSAGES section
  const conversationPeerCids = new Set(peersWithConversations.map(c => c.peerCid));
  const filteredRegisteredPeers = registeredPeers.filter(p => !conversationPeerCids.has(p.cid));

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
                className="h-5 min-w-[20px] px-1.5 bg-red-500 text-white cursor-pointer hover:bg-red-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPendingRequests(true);
                }}
                title={`${pendingRequestCount} pending connection request${pendingRequestCount > 1 ? 's' : ''}`}
              >
                {pendingRequestCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
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
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading members...
                </div>
              ) : members.length === 0 && filteredRegisteredPeers.length === 0 && registeredPeers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No members yet. Use the <UserPlus className="h-3 w-3 inline mx-1" /> button to discover peers.
                </div>
              ) : members.length === 0 ? (
                null
              ) : (
                <div className="animate-fade-in">
                  {members.slice(0, MEMBERS_TO_SHOW).map((member) => (
                    <SidebarMenuItem key={member.id}>
                      <div className="flex items-center w-full group">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton 
                                className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors flex-1"
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {getRoleIcon(member.role)}
                                  <span className="flex-1 truncate">{member.name || member.full_name || member.username}</span>
                                  <Badge 
                                    variant="secondary" 
                                    className={`${getRoleColor(member.role)} text-white text-xs`}
                                  >
                                    {member.role}
                                  </Badge>
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleManagePermissions(member)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Manage Permissions
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditMember(member)}>
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleRemoveMember(member)}
                                className="text-red-600"
                              >
                                Remove Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </SidebarMenuItem>
                  ))}
                  {members.length > MEMBERS_TO_SHOW && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setShowAllMembersDialog(true)}
                        className="text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        View all {members.length} members
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </div>
              )}
            </SidebarMenu>
          </ScrollArea>

          {/* Registered P2P Peers - thin rows under members (filtered to exclude peers with conversations) */}
          {filteredRegisteredPeers.length > 0 && (
            <div className="mt-2 border-t border-[#444A6C] pt-2">
              <SidebarMenu>
                {filteredRegisteredPeers.map((peer) => (
                  <SidebarMenuItem key={peer.cid}>
                    <SidebarMenuButton
                      onClick={() => handlePeerClick(peer)}
                      className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors h-8 py-1"
                    >
                      <div className="flex items-center gap-2 w-full">
                        {/* Avatar with status indicator */}
                        <div className="relative w-6 h-6 flex-shrink-0">
                          <div className="w-6 h-6 rounded-full bg-[#6E59A5] flex items-center justify-center text-xs font-medium">
                            {peer.username[0]?.toUpperCase() || '?'}
                          </div>
                          {/* Status indicator - top-right corner */}
                          <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#262C4A] ${
                            peer.isConnected ? 'bg-green-500' :
                            peer.isOnline ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`} />
                        </div>
                        {/* Username */}
                        <span className="flex-1 truncate text-sm">{peer.username}</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Direct Messages - Only peers with message history */}
      {peersWithConversations.length > 0 && (
        <SidebarGroup className="flex-shrink-0 min-h-[2rem] mb-4">
          <SidebarGroupLabel className="text-[#9b87f5] font-semibold text-xs px-0 ml-3">
            DIRECT MESSAGES
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {peersWithConversations.map((conv) => (
                <SidebarMenuItem key={conv.peerCid}>
                  <SidebarMenuButton
                    onClick={() => handleConversationClick(conv)}
                    className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors h-8 py-1"
                  >
                    <div className="flex items-center gap-2 w-full">
                      {/* Avatar with status indicator */}
                      <div className="relative w-6 h-6 flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-[#6E59A5] flex items-center justify-center text-xs font-medium">
                          {conv.peerUsername[0]?.toUpperCase() || '?'}
                        </div>
                        {/* Status indicator */}
                        <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#262C4A] ${
                          conv.isConnected ? 'bg-green-500' :
                          conv.isOnline ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} />
                      </div>
                      {/* Username */}
                      <span className="flex-1 truncate text-sm">{conv.peerUsername}</span>
                      {/* Unread count badge */}
                      {conv.unreadCount > 0 && (
                        <Badge className="h-5 min-w-[20px] px-1.5 bg-[#6E59A5] text-white">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {/* Member Management Modals */}
      <MemberManagementModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        mode="add"
        officeId={currentOfficeId || undefined}
        roomId={currentRoomId || undefined}
      />

      <MemberManagementModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedMember(null);
        }}
        mode="edit"
        officeId={currentOfficeId || undefined}
        roomId={currentRoomId || undefined}
        member={selectedMember || undefined}
      />

      <MemberManagementModal
        isOpen={showRemoveModal}
        onClose={() => {
          setShowRemoveModal(false);
          setSelectedMember(null);
        }}
        mode="remove"
        officeId={currentOfficeId || undefined}
        roomId={currentRoomId || undefined}
        member={selectedMember || undefined}
      />

      {/* All Members Dialog */}
      <Dialog open={showAllMembersDialog} onOpenChange={setShowAllMembersDialog}>
        <DialogContent className="max-w-2xl bg-[#2E3356] border-purple-800">
          <DialogHeader>
            <DialogTitle className="text-white">{getLocationText()}</DialogTitle>
          </DialogHeader>
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
                    <Badge 
                      variant="secondary" 
                      className={`${getRoleColor(member.role)} text-white text-xs`}
                    >
                      {member.role}
                    </Badge>
                  </div>
                  {state.currentUser?.username !== member.username && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          handleManagePermissions(member);
                          setShowAllMembersDialog(false);
                        }}>
                          <Shield className="h-4 w-4 mr-2" />
                          Manage Permissions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          handleEditMember(member);
                          setShowAllMembersDialog(false);
                        }}>
                          Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            handleRemoveMember(member);
                            setShowAllMembersDialog(false);
                          }}
                          className="text-red-600"
                        >
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Permission Manager Modal */}
      {permissionModalData && (
        <PermissionManagerModal
          isOpen={showPermissionModal}
          onClose={() => {
            setShowPermissionModal(false);
            setPermissionModalData(null);
          }}
          userId={permissionModalData.userId}
          domainId={permissionModalData.domainId}
          domainType={permissionModalData.domainType}
        />
      )}
      
      {/* Peer Discovery Modal */}
      <PeerDiscoveryModal
        isOpen={showPeerDiscovery}
        onClose={() => setShowPeerDiscovery(false)}
      />

      {/* Pending Requests Modal */}
      <PendingRequestsModal
        isOpen={showPendingRequests}
        onClose={() => setShowPendingRequests(false)}
      />
    </>
  );
};