import { Building2, Home, Plus, MoreVertical } from "lucide-react";
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
import { useSidebar } from "@/components/ui/sidebar";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoomManagementModal } from "@/components/room/RoomManagementModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import WorkspaceService from "@/lib/workspace-service";

// Legacy hardcoded rooms - will be removed once fully migrated
export const officeRooms = {
  company: [
    { id: "main", name: "Main Office", icon: Home },
    { id: "meeting-a", name: "Meeting Room A", icon: Building2 },
    { id: "meeting-b", name: "Meeting Room B", icon: Building2 },
  ],
  marketing: [
    { id: "creative", name: "Creative Studio", icon: Home },
    { id: "conference", name: "Conference Room", icon: Building2 },
    { id: "media", name: "Media Room", icon: Building2 },
  ],
  hr: [
    { id: "training", name: "Training Room", icon: Home },
    { id: "interview-a", name: "Interview Room A", icon: Building2 },
    { id: "interview-b", name: "Interview Room B", icon: Building2 },
  ],
};

export const RoomsSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { state } = useWorkspace();
  const { toast } = useToast();
  const params = new URLSearchParams(location.search);
  const currentOfficeId = params.get("officeId");
  const currentRoomId = params.get("roomId");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<{ id: string; name: string; description: string } | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleRoomClick = (roomId: string) => {
    const params = new URLSearchParams(location.search);
    params.set("roomId", roomId);
    navigate(`/office?${params.toString()}`);
    setOpenMobile(false);
  };

  const handleCreateRoom = () => {
    if (!currentOfficeId) {
      console.warn("No office selected");
      return;
    }
    setShowCreateModal(true);
  };

  const handleEditRoom = (roomId: string) => {
    const room = state.rooms[roomId];
    if (room) {
      setSelectedRoom({
        id: room.id,
        name: room.name,
        description: room.description,
      });
      setShowEditModal(true);
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    const room = state.rooms[roomId];
    if (room) {
      setRoomToDelete({ id: room.id, name: room.name });
    }
  };

  const confirmDeleteRoom = async () => {
    if (!roomToDelete) return;

    try {
      await WorkspaceService.deleteRoom(roomToDelete.id);
      
      // If we're currently viewing the deleted room, navigate to office
      if (currentRoomId === roomToDelete.id) {
        const params = new URLSearchParams(location.search);
        params.delete('roomId');
        navigate(`/office?${params.toString()}`);
      }

      toast({
        title: "Room Deleted",
        description: `${roomToDelete.name} has been deleted successfully`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });
    } catch (error) {
      console.error("Error deleting room:", error);
      toast({
        title: "Error",
        description: "Failed to delete room. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRoomToDelete(null);
    }
  };

  // Get rooms for current office
  const rooms = currentOfficeId 
    ? Object.values(state.rooms).filter(room => room.office_id === currentOfficeId)
    : [];
  const isLoading = state.loading.rooms;

  // If no office is selected, show message
  if (!currentOfficeId) {
    return (
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <SidebarGroupLabel className="text-[#9b87f5] font-semibold">ROOMS</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Select an office to view rooms
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-[#9b87f5] font-semibold m-0">ROOMS</SidebarGroupLabel>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            onClick={handleCreateRoom}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <SidebarGroupContent>
          <ScrollArea className="max-h-[30vh]">
            <SidebarMenu>
              {isLoading && rooms.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading rooms...
                </div>
              ) : rooms.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No rooms yet. Create one!
                </div>
              ) : (
                <div className="animate-fade-in">
                  {rooms.map((room) => (
                    <SidebarMenuItem key={room.id}>
                      <div className="flex items-center w-full group">
                        <SidebarMenuButton 
                          className={`text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors flex-1
                            ${currentRoomId === room.id ? 'bg-[#E5DEFF] text-[#343A5C] border border-[#9b87f5]' : ''}`}
                          onClick={() => handleRoomClick(room.id)}
                          data-active={currentRoomId === room.id}
                        >
                          <Building2 className="h-4 w-4" />
                          <span>{room.name}</span>
                        </SidebarMenuButton>
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
                            <DropdownMenuItem onClick={() => handleEditRoom(room.id)}>
                              Edit Room
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteRoom(room.id)}
                              className="text-red-600"
                            >
                              Delete Room
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </div>
              )}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Room Management Modals */}
      {currentOfficeId && (
        <>
          <RoomManagementModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            mode="create"
            officeId={currentOfficeId}
          />

          <RoomManagementModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedRoom(null);
            }}
            mode="edit"
            officeId={currentOfficeId}
            room={selectedRoom || undefined}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!roomToDelete} onOpenChange={() => setRoomToDelete(null)}>
        <AlertDialogContent className="bg-[#343A5C] border-purple-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Room
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete "{roomToDelete?.name}"? This action cannot be undone.
              All content within this room will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-600 text-white hover:bg-[#444A6C]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRoom}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};