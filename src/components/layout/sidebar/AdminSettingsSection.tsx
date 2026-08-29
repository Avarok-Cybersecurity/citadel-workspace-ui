import { Settings, Shield, Users, Key } from "lucide-react";
import { isPrivilegedRole } from '@/lib/role-predicate';
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
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

/**
 * Admin Settings Section
 *
 * Only visible to users with Admin role. Provides quick access to:
 * - Manage workspace permissions
 * - View/edit member roles
 * - Access admin-only settings
 */
export const AdminSettingsSection: () => JSX.Element | null = (): JSX.Element | null => {
  const { state } = useWorkspace();
  const [showPermissionManager, setShowPermissionManager] = useState(false);
  const [showAdminInfo, setShowAdminInfo] = useState(false);

  // An Owner counts. This check used to accept Admin only, so an Owner saw the
  // admin ring in TopBar and the shield in the workspace switcher and then got
  // nothing here -- an administrator in two places and not in the third.
  const isAdmin: boolean = isPrivilegedRole(state.currentUser?.role);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <SidebarGroup className="flex-shrink-0 min-h-[2rem] mb-4">
        <div className="flex items-center gap-2 px-3 mb-2">
          <SidebarGroupLabel className="text-warning-emphasis font-semibold m-0 px-0">
            ADMIN SETTINGS
          </SidebarGroupLabel>
          <Badge className="h-5 px-1.5 bg-warning text-warning-foreground text-xs">
            Admin
          </Badge>
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setShowPermissionManager(true)}
                className="text-foreground hover:bg-primary-accent/15 hover:text-foreground transition-colors"
              >
                <Shield className="h-4 w-4 mr-2 text-warning-emphasis" />
                Manage User Roles
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setShowAdminInfo(true)}
                className="text-foreground hover:bg-primary-accent/15 hover:text-foreground transition-colors"
              >
                <Key className="h-4 w-4 mr-2 text-warning-emphasis" />
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
          domainId={WORKSPACE_ROOT_ID}
          domainType="workspace"
        />
      )}

      {/* Admin Info Dialog */}
      <Dialog open={showAdminInfo} onOpenChange={setShowAdminInfo}>
        <DialogContent className="bg-surface border-warning/30">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5 text-warning-emphasis" />
              Administrator Privileges
            </DialogTitle>
            <DialogDescription className="text-foreground/80">
              As a workspace administrator, you have full access to:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-foreground">
            <div className="flex items-start gap-3 p-2 bg-warning/10 rounded">
              <Settings className="h-4 w-4 text-warning-emphasis mt-0.5" />
              <div>
                {/* "Nodes" and "hierarchy nodes" are the code's words for
                    offices and rooms; the result toasts already use the real
                    ones, so the same thing had two names either side of a
                    click. */}
                <p className="font-medium">Offices & Rooms</p>
                <p className="text-sm text-muted-foreground">Create, rename and remove them</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-warning/10 rounded">
              <Users className="h-4 w-4 text-warning-emphasis mt-0.5" />
              <div>
                <p className="font-medium">Manage User Roles</p>
                <p className="text-sm text-muted-foreground">Promote or demote users between Admin, Owner, Member, and Guest roles</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-warning/10 rounded">
              <Shield className="h-4 w-4 text-warning-emphasis mt-0.5" />
              <div>
                <p className="font-medium">Grant Permissions</p>
                <p className="text-sm text-muted-foreground">Choose what each person can do, anywhere in the workspace</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-warning/10 rounded">
              <Key className="h-4 w-4 text-warning-emphasis mt-0.5" />
              <div>
                <p className="font-medium">Configure Workspace</p>
                <p className="text-sm text-muted-foreground">Update workspace settings and configuration</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
