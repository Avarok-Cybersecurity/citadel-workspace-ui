import { Settings, Shield, Users, Key } from "lucide-react";
import { useState } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PermissionManagerModal } from "@/components/permissions/PermissionManagerModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

/**
 * Admin Settings Section
 *
 * Only visible to users with Admin role. Provides quick access to:
 * - Manage workspace permissions
 * - View/edit member roles
 * - Access admin-only settings
 */
export const AdminSettingsSection = () => {
  const { state } = useWorkspace();
  const [showPermissionManager, setShowPermissionManager] = useState(false);
  const [showAdminInfo, setShowAdminInfo] = useState(false);

  // Only show for admin users
  // Check if user role is Admin (from workspace context)
  // Handle both backend 'Admin' and frontend 'admin' conventions
  const userRole = state.currentUser?.role;
  const isAdmin = userRole === 'Admin' ||
                  userRole === 'admin' ||
                  (typeof userRole === 'object' && userRole !== null && (userRole as Record<string, unknown>)?.Admin !== undefined);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[2rem] mb-4">
        <div className="flex items-center gap-2 px-3 mb-2">
          <SidebarGroupLabel className="text-amber-400 font-semibold m-0 px-0">
            ADMIN SETTINGS
          </SidebarGroupLabel>
          <Badge className="h-5 px-1.5 bg-amber-500 text-white text-xs">
            Admin
          </Badge>
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setShowPermissionManager(true)}
                className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors"
              >
                <Shield className="h-4 w-4 mr-2 text-amber-400" />
                Manage User Roles
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setShowAdminInfo(true)}
                className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors"
              >
                <Key className="h-4 w-4 mr-2 text-amber-400" />
                Admin Privileges
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Permission Manager Modal - for workspace-level permissions */}
      {showPermissionManager && state.currentUser && (
        <PermissionManagerModal
          isOpen={showPermissionManager}
          onClose={() => setShowPermissionManager(false)}
          userId={state.currentUser.id || state.currentUser.username}
          domainId="workspace-root"
          domainType="workspace"
        />
      )}

      {/* Admin Info Dialog */}
      <Dialog open={showAdminInfo} onOpenChange={setShowAdminInfo}>
        <DialogContent className="bg-[#2E3356] border-amber-500/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-400" />
              Administrator Privileges
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              As a workspace administrator, you have full access to:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-gray-200">
            <div className="flex items-start gap-3 p-2 bg-amber-500/10 rounded">
              <Settings className="h-4 w-4 text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium">Create & Manage Nodes</p>
                <p className="text-sm text-gray-400">Create, edit, and delete hierarchy nodes</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-amber-500/10 rounded">
              <Users className="h-4 w-4 text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium">Manage User Roles</p>
                <p className="text-sm text-gray-400">Promote or demote users between Admin, Owner, Member, and Guest roles</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-amber-500/10 rounded">
              <Shield className="h-4 w-4 text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium">Grant Permissions</p>
                <p className="text-sm text-gray-400">Assign specific permissions to users for any domain</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-amber-500/10 rounded">
              <Key className="h-4 w-4 text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium">Configure Workspace</p>
                <p className="text-sm text-gray-400">Update workspace settings and configuration</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
