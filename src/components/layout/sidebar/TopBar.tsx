import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { toastSuccess } from "@/lib/toast-helpers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PreferencesDialog from "@/components/connection/PreferencesDialog";
import NotificationCenter from "@/components/notification/NotificationCenter";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SettingsModal } from "@/components/SettingsModal";
import { getUserInitials } from "@/lib/workspace-metadata-service";
import { LeaderIndicator } from "@/components/ui/leader-indicator";
import { connectionManager } from "@/lib/connection";
import { useNavigate } from "react-router-dom";
import { clearSelectedUser, getSelectedUser } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { useState } from "react";
import { ExitConfirmModal } from "@/components/ExitConfirmModal";
import { ProfileModal } from "@/components/settings/ProfileModal";
import { DisconnectLoadingModal, DisconnectStatus } from "@/components/LoadingModal";
import { cn } from "@/lib/utils";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

interface TopBarProps {
  // Optional prop for backward compatibility
  currentWorkspace?: string;
}

export const TopBar = ({ currentWorkspace }: TopBarProps) => {
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { state } = useWorkspace();
  const navigate = useNavigate();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [disconnectStatus, setDisconnectStatus] = useState<DisconnectStatus>("disconnecting");
  const [disconnectError, setDisconnectError] = useState<string | undefined>();

  // Get workspace name from context or fallback to prop
  const workspaceName = state.workspace?.name || currentWorkspace || "Citadel Workspace";

  // Get the username and name from the state
  const username = state.currentUser?.username || "User";
  const name = state.currentUser?.name || username;
  const userInitials = getUserInitials(name);
  const avatarUrl = state.currentUser?.avatarUrl;

  // Check if user is admin (handle both 'Admin' from backend and 'admin' from frontend)
  const userRole = state.currentUser?.role;
  const isAdmin = userRole === 'Admin' || userRole === 'admin' || userRole === 'Owner' || userRole === 'owner';

  const handleSettingsClick = () => {
    toastSuccess(toast, "Settings", "Settings panel opening soon");
  };

  const handleExit = () => {
    // Stop WASM connection manager polling (session stays active but this tab won't poll)
    wasmConnectionManager.stop();

    // Just navigate to landing page, keep session active
    runAsyncSetup(clearSelectedUser);
    navigate('/');

    toastSuccess(toast, "Returned to landing page", "Your session is still active. Click your workspace icon to return instantly.");
  };

  const handleSignOut = async () => {
    // Show the disconnect modal immediately
    setDisconnectStatus("disconnecting");
    setDisconnectError(undefined);
    setShowDisconnectModal(true);

    try {
      // Stop WASM connection manager polling
      wasmConnectionManager.stop();

      // Get the current session BEFORE disconnecting
      const currentSession = await connectionManager.getTabSelectedSession();

      if (!currentSession) {
        console.error('TopBar: No current session found');
        setDisconnectStatus("error");
        setDisconnectError("No active session found");
        return;
      }

      // Also get the CID from tab context (more reliable source)
      const tabSelection = await getSelectedUser();
      const cid = tabSelection?.selectedCid ?? currentSession.cid;

      if (!cid) {
        console.error('TopBar: No CID found for session');
        setDisconnectStatus("error");
        setDisconnectError("No active session CID found");
        return;
      }

      debugLog('TopBar', 'TopBar: Fully signing out user', currentSession.username, 'CID:', cid.toString());

      // Full disconnect via WebSocket - pass the session info explicitly
      await connectionManager.disconnect({
        cid,
        username: currentSession.username,
        serverAddress: currentSession.serverAddress,
      });

      // Update status to cleaning
      setDisconnectStatus("cleaning");

      // Remove the session completely from stored sessions
      await connectionManager.removeSession(currentSession.username, currentSession.serverAddress);

      // Clear tab-specific user selection
      await clearSelectedUser();

      // Show ready status briefly before navigating
      setDisconnectStatus("ready");

    } catch (error) {
      console.error('TopBar: Sign out failed', error);
      setDisconnectStatus("error");
      setDisconnectError("An error occurred while signing out");
    }
  };

  const handleDisconnectComplete = () => {
    setShowDisconnectModal(false);
    if (disconnectStatus === "ready") {
      navigate('/');
      toastSuccess(toast, "Signed out", "You have been fully logged out. You'll need to login again to access this workspace.");
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-14 bg-[#252424] border-b border-gray-800 flex items-center justify-between pr-4 z-50">
      <div className="flex items-center">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] md:hidden mr-4"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <WorkspaceSwitcher workspaceName={workspaceName} />
      </div>
      <div className="flex items-center space-x-2">
        <LeaderIndicator />
        <NotificationCenter />

        <PreferencesDialog />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="p-0 hover:bg-[#E5DEFF]" title={isAdmin ? "Workspace Administrator" : undefined} data-testid="user-avatar-button">
              <Avatar className={cn(
                "h-8 w-8",
                isAdmin && "ring-2 ring-amber-400 ring-offset-1 ring-offset-[#252424]"
              )}>
                <AvatarImage src={avatarUrl || ""} />
                <AvatarFallback className="bg-[#444A6C] text-white">{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#343A5C] text-white border-purple-800">
            <DropdownMenuLabel>{name}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-purple-800" />
            <DropdownMenuItem
              className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer"
              onClick={() => setShowProfileModal(true)}
            >
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer"
              onClick={() => setShowSettingsModal(true)}
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-purple-800" />
            <DropdownMenuItem
              className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer"
              onClick={() => setShowExitConfirm(true)}
            >
              Exit to Landing
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer"
              onClick={handleSignOut}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Exit confirmation modal */}
      <ExitConfirmModal
        open={showExitConfirm}
        onOpenChange={setShowExitConfirm}
        onConfirm={handleExit}
        userName={name}
        workspaceName={workspaceName}
      />

      {/* Profile settings modal */}
      <ProfileModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
      />

      {/* Disconnect loading modal */}
      <DisconnectLoadingModal
        open={showDisconnectModal}
        status={disconnectStatus}
        workspaceName={workspaceName}
        errorMessage={disconnectError}
        onComplete={handleDisconnectComplete}
      />

      {/* Settings modal */}
      <SettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />
    </div>
  );
};
