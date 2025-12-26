import { useLocation, useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Plus, MoreVertical } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfficeManagementModal } from "@/components/office/OfficeManagementModal";
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
import { buildWorkspacePath, getWorkspacePath } from "@/lib/workspace-navigation";

export const OfficesSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { state } = useWorkspace();
  const { toast } = useToast();
  const currentOfficeId = new URLSearchParams(location.search).get("officeId");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<{ id: string; name: string; description: string } | null>(null);
  const [officeToDelete, setOfficeToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleOfficeClick = (officeId: string) => {
    const params = new URLSearchParams(location.search);
    params.set("officeId", officeId);
    params.delete("roomId"); // Clear room when changing office
    navigate(buildWorkspacePath(params));
    setOpenMobile(false);
  };

  const handleCreateOffice = () => {
    setShowCreateModal(true);
  };

  const handleEditOffice = (officeId: string) => {
    const office = state.offices[officeId];
    if (office) {
      setSelectedOffice({
        id: office.id,
        name: office.name,
        description: office.description,
      });
      setShowEditModal(true);
    }
  };

  const handleDeleteOffice = (officeId: string) => {
    const office = state.offices[officeId];
    if (office) {
      setOfficeToDelete({ id: office.id, name: office.name });
    }
  };

  const confirmDeleteOffice = async () => {
    if (!officeToDelete) return;

    try {
      await WorkspaceService.deleteOffice(officeToDelete.id);
      
      // If we're currently viewing the deleted office, navigate away
      if (currentOfficeId === officeToDelete.id) {
        navigate(getWorkspacePath());
      }

      toast({
        title: "Office Deleted",
        description: `${officeToDelete.name} has been deleted successfully`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });
    } catch (error) {
      console.error("Error deleting office:", error);
      toast({
        title: "Error",
        description: "Failed to delete office. Please try again.",
        variant: "destructive",
      });
    } finally {
      setOfficeToDelete(null);
    }
  };

  // Get offices from workspace state
  const offices = Object.values(state.offices);
  const isLoading = state.loading.offices;

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <SidebarGroupLabel className="text-[#9b87f5] font-semibold m-0 px-0">OFFICES</SidebarGroupLabel>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#9b87f5] hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            onClick={handleCreateOffice}
            data-testid="add-office-button"
            aria-label="Add office"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <SidebarGroupContent>
          <ScrollArea className="max-h-[30vh]">
            <SidebarMenu>
              {isLoading && offices.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading offices...
                </div>
              ) : offices.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No offices yet. Create one!
                </div>
              ) : (
                offices.map((office) => (
                  <SidebarMenuItem key={office.id}>
                    <div className="flex items-center w-full group">
                      <SidebarMenuButton
                        className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors flex-1"
                        isActive={currentOfficeId === office.id}
                        onClick={() => handleOfficeClick(office.id)}
                      >
                        {office.name}
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
                          <DropdownMenuItem onClick={() => handleEditOffice(office.id)}>
                            Edit Office
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteOffice(office.id)}
                            className="text-red-600"
                          >
                            Delete Office
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Office Management Modals */}
      <OfficeManagementModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        mode="create"
      />

      <OfficeManagementModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedOffice(null);
        }}
        mode="edit"
        office={selectedOffice || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!officeToDelete} onOpenChange={() => setOfficeToDelete(null)}>
        <AlertDialogContent className="bg-[#343A5C] border-purple-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Office
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete "{officeToDelete?.name}"? This action cannot be undone.
              All rooms and content within this office will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-600 text-white hover:bg-[#444A6C]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteOffice}
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