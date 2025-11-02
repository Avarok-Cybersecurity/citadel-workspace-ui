import { Users, UserPlus, MoreVertical, Shield, User } from "lucide-react";
import { useLocation } from "react-router-dom";
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

export const MembersSection = () => {
  const location = useLocation();
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
  
  const MEMBERS_TO_SHOW = 5; // Show first 5 members in sidebar

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
    return "Workspace Members";
  };

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-[#9b87f5] font-semibold m-0">
            {getLocationText().toUpperCase()}
          </SidebarGroupLabel>
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
              ) : members.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No members yet
                </div>
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
        </SidebarGroupContent>
      </SidebarGroup>

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
    </>
  );
};