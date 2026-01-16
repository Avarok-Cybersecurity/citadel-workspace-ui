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
import { Plus, MoreVertical, Star, Settings } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfficeManagementModal } from "@/components/office/OfficeManagementModal";
import { AdminModal } from "@/components/admin";
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
  const [selectedOffice, setSelectedOffice] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [officeToDelete, setOfficeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminOfficeId, setAdminOfficeId] = useState<string | null>(null);

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

  const handleSetAsDefault = async (officeId: string) => {
    const office = state.offices[officeId];
    if (!office) return;

    try {
      await WorkspaceService.updateOffice(officeId, { is_default: true });
      toast({
        title: "Default Office Updated",
        description: `${office.name} is now the default office`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });
    } catch (error) {
      console.error("Error setting default office:", error);
      toast({
        title: "Error",
        description: "Failed to set default office. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAdminSettings = (officeId: string) => {
    setAdminOfficeId(officeId);
    setShowAdminModal(true);
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
                  <SidebarMenuItem key={office.id} className="relative group">
                    <SidebarMenuButton
                      className={`text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors w-full pr-8 ${
                        currentOfficeId === office.id ? 'bg-[#E5DEFF] text-[#343A5C]' : ''
                      }`}
                      isActive={currentOfficeId === office.id}
                      onClick={() => handleOfficeClick(office.id)}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {office.name}
                        {office.is_default && (
                          <Star
                            className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0"
                            aria-label="Default office"
                          />
                        )}
                      </span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-[#444A6C]"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`office-menu-${office.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={8}>
                        <DropdownMenuItem onClick={() => handleEditOffice(office.id)} data-testid="edit-office-option">
                          Edit Office
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleAdminSettings(office.id)}
                          data-testid="admin-settings-office-option"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Admin Settings
                        </DropdownMenuItem>
                        {!office.is_default && (
                          <DropdownMenuItem
                            onClick={() => handleSetAsDefault(office.id)}
                            className="text-yellow-400 hover:text-yellow-300"
                            data-testid="set-default-office-option"
                          >
                            <Star className="h-4 w-4 mr-2" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteOffice(office.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                          data-testid="delete-office-option"
                        >
                          Delete Office
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

      {/* Admin Settings Modal */}
      <AdminModal
        isOpen={showAdminModal}
        onClose={() => {
          setShowAdminModal(false);
          setAdminOfficeId(null);
        }}
        entityType="office"
        entityId={adminOfficeId || ''}
      />
    </>
  );
};