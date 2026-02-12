import { useState, useEffect } from "react";
import { ChevronRight, Plus, Server, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ServerConnect } from "@/components/ServerConnect";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Join } from "@/components/Join";
import { getWorkspaceLogo, getWorkspaceInitials } from "@/lib/workspace-metadata-service";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { connectionManager } from "@/lib/connection";
import { ConnectionService } from "@/lib/connection-service";
import { websocketService } from "@/lib/websocket-service";
import WorkspaceService from "@/lib/workspace-service";
import { useToast } from "@/hooks/use-toast";
import { toastSuccess, toastError } from "@/lib/toast-helpers";
import { getSelectedUser, setSelectedUser } from "@/lib/tab-context";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

interface StoredWorkspace {
  id: string;
  username: string;
  serverAddress: string;
  workspaceName?: string;
  isActive: boolean;
  cid?: bigint;
  fullName?: string;
  role?: string;
}

// Props interface for the WorkspaceSwitcher component
interface WorkspaceSwitcherProps {
  workspaceName?: string;
}

type WorkflowStep = "connect" | "security" | "join";

export const WorkspaceSwitcher = ({ workspaceName }: WorkspaceSwitcherProps) => {
  const [availableWorkspaces, setAvailableWorkspaces] = useState<StoredWorkspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<StoredWorkspace | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [workspaceRoutes, setWorkspaceRoutes] = useState<Record<string, string>>({});
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("connect");
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null>(null);
  const [isInitials, setIsInitials] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [targetWorkspaceForNewAccount, setTargetWorkspaceForNewAccount] = useState<{
    workspaceName: string;
    serverAddress: string;
  } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const { toast } = useToast();

  // Load stored sessions and track current workspace
  useEffect(() => {
    const loadStoredWorkspaces = async () => {
      const storedSessions = connectionManager.getStoredSessions();
      const connectionService = ConnectionService.getInstance();
      const tabSelectedUser = await getSelectedUser();

      // Get current connection status
      let currentCid: bigint | null = null;
      connectionService.onConnectionChange((connection) => {
        if (connection?.cid) {
          currentCid = connection.cid;
        }
      });

      // Ensure storedSessions has the expected structure
      if (!storedSessions || !storedSessions.sessions || !Array.isArray(storedSessions.sessions)) {
        console.warn('No stored sessions found or invalid format');
        setAvailableWorkspaces([]);
        return;
      }

      // Convert stored sessions to workspace objects
      const workspaces: StoredWorkspace[] = storedSessions.sessions.map((session, index) => ({
        id: `${session.serverAddress}-${session.username}`,
        username: session.username,
        serverAddress: session.serverAddress,
        workspaceName: state.workspace?.name || session.username,
        isActive: session.cid === currentCid,
        cid: session.cid,
        fullName: session.fullName,
        role: session.role || 'Member' // Use stored role or default to Member
      }));

      setAvailableWorkspaces(workspaces);

      // Set current workspace based on tab-specific selected user
      let activeWorkspace: StoredWorkspace | undefined;

      if (tabSelectedUser && tabSelectedUser.selectedUsername && tabSelectedUser.selectedServerAddress) {
        // Find workspace matching the tab's selected user
        activeWorkspace = workspaces.find(w =>
          w.username === tabSelectedUser.selectedUsername &&
          w.serverAddress === tabSelectedUser.selectedServerAddress
        );
        debugLog('WorkspaceSwitcher', 'WorkspaceSwitcher: Using tab-selected user:', tabSelectedUser.selectedUsername);
      }

      // Fall back to the workspace with active connection if no tab selection
      if (!activeWorkspace) {
        activeWorkspace = workspaces.find(w => w.isActive);
      }

      if (activeWorkspace) {
        setCurrentWorkspace(activeWorkspace);
      }
    };

    runAsyncSetup(loadStoredWorkspaces);

    // Also listen for connection changes
    const connectionService = ConnectionService.getInstance();
    connectionService.onConnectionChange(async () => {
      await loadStoredWorkspaces();
    });
  }, [state.workspace]);
  
  // Process workspace logo from metadata when workspace changes
  useEffect(() => {
    if (state.workspace?.metadata) {
      const logo = getWorkspaceLogo(state.workspace.name, state.workspace.metadata);
      if (logo.type === 'image') {
        setWorkspaceLogo(logo.data);
        setIsInitials(false);
      } else {
        setWorkspaceLogo(logo.data);
        setIsInitials(true);
      }
    } else if (workspaceName) {
      // If no metadata but we have a workspace name, use initials
      setWorkspaceLogo(getWorkspaceInitials(workspaceName));
      setIsInitials(true);
    }
  }, [state.workspace, workspaceName]);

  useEffect(() => {
    if (currentWorkspace) {
      setWorkspaceRoutes(prev => ({
        ...prev,
        [currentWorkspace.id]: location.pathname + location.search
      }));
    }
  }, [location.pathname, location.search, currentWorkspace]);

  const handleWorkspaceChange = async (workspace: StoredWorkspace) => {
    if (isSwitching || workspace.id === currentWorkspace?.id) return;

    debugLog('WorkspaceSwitcher', 'Switching to workspace:', workspace.username, 'on', workspace.serverAddress);
    setIsSwitching(true);

    try {
      // Show switching toast immediately
      toastSuccess(toast, "Switching workspace...", `Connecting as ${workspace.fullName || workspace.username}`);

      // Add transition class to main content
      const mainContent = document.querySelector('[data-workspace-content]') || document.querySelector('.office-content') || document.querySelector('main');
      mainContent?.classList.add('animate-fade-out');

      // Small delay for visual transition
      await new Promise(resolve => setTimeout(resolve, 300));

      // Find the target session
      const storedSessions = connectionManager.getStoredSessions();
      const targetSession = storedSessions.sessions.find(
        s => s.username === workspace.username && s.serverAddress === workspace.serverAddress
      );

      if (!targetSession) {
        throw new Error('Session not found');
      }

      if (!targetSession.cid) {
        throw new Error('Session CID not available');
      }

      // Claim the session if it's orphaned (use ClaimSession protocol instead of Connect)
      try {
        await websocketService.claimSession(targetSession.cid, true);
        debugLog('WorkspaceSwitcher', 'WorkspaceSwitcher: Session claimed successfully (was orphaned)');
      } catch (claimError: any) {
        if (claimError?.message?.includes('not orphaned')) {
          debugLog('WorkspaceSwitcher', 'WorkspaceSwitcher: Session is still active (not orphaned), no claim needed');
        } else {
          // Re-throw if it's a different error
          throw claimError;
        }
      }

      // Update active session index
      const index = storedSessions.sessions.indexOf(targetSession);
      if (index >= 0) {
        await connectionManager.setActiveSessionIndex(index);
      }

      // Update tab context with new workspace session
      await setSelectedUser({
        selectedUsername: workspace.username,
        selectedServerAddress: workspace.serverAddress,
        selectedCid: targetSession.cid
      });

      // Set the connection ID in WorkspaceService (the session is already connected/claimed)
      WorkspaceService.setConnectionId(targetSession.cid);

      // Trigger workspace loading
      await WorkspaceService.loadWorkspace();
      await WorkspaceService.listNodes();

      // Show success notification
      toastSuccess(toast, "Connected!", (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>{workspace.fullName || workspace.username} · {workspace.workspaceName}</span>
        </div>
      ));

      // Navigate to saved route or default
      const savedRoute = workspaceRoutes[workspace.id];
      if (savedRoute && savedRoute !== location.pathname + location.search) {
        navigate(savedRoute);
      }

      // Fade in the content
      setTimeout(() => {
        mainContent?.classList.remove('animate-fade-out');
        mainContent?.classList.add('animate-fade-in');

        // Remove animation class after completion
        setTimeout(() => {
          mainContent?.classList.remove('animate-fade-in');
        }, 300);
      }, 100);

    } catch (error) {
      console.error('Failed to switch workspace:', error);
      toastError(toast, "Switch Failed", "Could not switch to the selected workspace");

      // Reset animation state on error
      const mainContent = document.querySelector('[data-workspace-content]') || document.querySelector('.office-content') || document.querySelector('main');
      mainContent?.classList.remove('animate-fade-out', 'animate-fade-in');
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  };

  const handleAddWorkspace = () => {
    setIsAddingWorkspace(true);
    setCurrentStep("connect");
    setTargetWorkspaceForNewAccount(null);
  };

  const handleAddAccountToWorkspace = (workspaceName: string, serverAddress: string) => {
    setTargetWorkspaceForNewAccount({ workspaceName, serverAddress });
    setIsAddingWorkspace(true);
    setCurrentStep("connect");
    setIsOpen(false);
    
    toastSuccess(toast, "Adding New Account", `Join ${workspaceName} with a different account`);
  };

  const handleManageAccounts = () => {
    setIsOpen(false);
    toastSuccess(toast, "Account Management", "Account management coming soon");
  };

  const handleNext = () => {
    switch (currentStep) {
      case "connect":
        setCurrentStep("security");
        break;
      case "security":
        setCurrentStep("join");
        break;
      case "join":
        setIsAddingWorkspace(false);
        setCurrentStep("connect");
        break;
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case "security":
        setCurrentStep("connect");
        break;
      case "join":
        setCurrentStep("security");
        break;
    }
  };

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-3 py-2 hover:bg-[#E5DEFE] transition-colors rounded-md w-full group bg-transparent pl-3"
            disabled={isSwitching}
          >
            {isInitials ? (
              <div className="w-8 h-8 rounded flex items-center justify-center bg-[#6E59A5] text-white">
                {workspaceLogo || getWorkspaceInitials(workspaceName || currentWorkspace?.username || "W")}
              </div>
            ) : (
              <img
                src={workspaceLogo || "/placeholder.svg"}
                alt={workspaceName || currentWorkspace?.username || "Workspace"}
                className="w-8 h-8 rounded"
              />
            )}
            <div className="flex-1 text-left">
              <span className="font-semibold text-white block group-hover:text-[#1C1D28]">
                {workspaceName || currentWorkspace?.workspaceName || "Select Workspace"}
              </span>
              {currentWorkspace && (
                <span className="text-xs text-gray-400 group-hover:text-gray-600">
                  {currentWorkspace.fullName || currentWorkspace.username}
                </span>
              )}
            </div>
            {isSwitching ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <ChevronRight
                className={cn(
                  "w-5 h-5 text-white group-hover:text-[#1C1D28] transition-transform duration-300 mr-2",
                  isOpen && "rotate-90"
                )}
              />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={0}
          className="w-[var(--radix-dropdown-menu-trigger-width)] bg-[#252424] border border-gray-800 animate-slide-down"
          style={{ "--trigger-width": "var(--radix-dropdown-menu-trigger-width)" } as React.CSSProperties}
        >
          {/* Group workspaces by server */}
          {Object.entries(
            availableWorkspaces
              .filter(workspace => workspace.id !== currentWorkspace?.id)
              .reduce((acc, workspace) => {
                const key = `${workspace.workspaceName || workspace.serverAddress}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(workspace);
                return acc;
              }, {} as Record<string, StoredWorkspace[]>)
          ).map(([workspaceKey, workspaces]) => (
            <div key={workspaceKey} className="mb-2">
              <div className="px-2 py-1 text-xs text-gray-500 font-medium flex items-center justify-between">
                <span>{workspaceKey}</span>
                <span className="text-gray-600">{workspaces[0].serverAddress}</span>
              </div>
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  onClick={() => handleWorkspaceChange(workspace)}
                  className="flex items-center gap-3 py-3 hover:bg-[#E5DEFE] transition-all cursor-pointer text-white w-full pl-3 group bg-transparent workspace-item-hover"
                  disabled={isSwitching}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#6E59A5] text-white text-sm font-semibold">
                    {(workspace.fullName || workspace.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold block group-hover:text-[#1C1D28]">
                      {workspace.fullName || workspace.username}
                    </span>
                    <span className="text-xs text-gray-400 group-hover:text-gray-600 flex items-center gap-1">
                      @{workspace.username} · {workspace.role || 'Member'}
                      {(workspace.role === 'Admin' || workspace.role === 'admin' || workspace.role === 'Owner' || workspace.role === 'owner') && (
                        <span title="Administrator"><Shield className="w-3 h-3 text-amber-400" /></span>
                      )}
                    </span>
                  </div>
                  {workspace.isActive && (
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-glow" />
                  )}
                </DropdownMenuItem>
              ))}
              {/* Add account option for this workspace */}
              <DropdownMenuItem
                onClick={() => handleAddAccountToWorkspace(workspaceKey, workspaces[0].serverAddress)}
                className="flex items-center gap-3 py-2 hover:bg-[#E5DEFE] transition-all cursor-pointer text-gray-400 hover:text-[#1C1D28] w-full pl-8 group bg-transparent"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add another account</span>
              </DropdownMenuItem>
            </div>
          ))}
          <div className="border-t border-gray-700">
            <DropdownMenuItem
              onClick={handleAddWorkspace}
              className="flex items-center gap-3 py-3 hover:bg-[#E5DEFE] transition-colors cursor-pointer text-white w-full pl-3 group bg-transparent"
            >
              <div className="w-8 h-8 rounded bg-[#6E59A5] flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <span className="font-semibold group-hover:text-[#1C1D28]">Join New Workspace</span>
            </DropdownMenuItem>
            {availableWorkspaces.length > 0 && (
              <DropdownMenuItem
                onClick={handleManageAccounts}
                className="flex items-center gap-3 py-3 hover:bg-[#E5DEFE] transition-colors cursor-pointer text-white w-full pl-3 group bg-transparent"
              >
                <div className="w-8 h-8 rounded bg-[#444A6C] flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <span className="font-semibold group-hover:text-[#1C1D28]">Manage Accounts</span>
              </DropdownMenuItem>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isAddingWorkspace} onOpenChange={(open) => {
        setIsAddingWorkspace(open);
        if (!open) {
          setTargetWorkspaceForNewAccount(null);
        }
      }}>
        <DialogContent className="p-0 bg-transparent border-none max-w-xl">
          {currentStep === "connect" && (
            <ServerConnect 
              onNext={handleNext} 
              defaultServer={targetWorkspaceForNewAccount?.serverAddress}
              title={targetWorkspaceForNewAccount ? 
                `Connect to ${targetWorkspaceForNewAccount.workspaceName}` : 
                undefined
              }
            />
          )}
          {currentStep === "security" && (
            <SecuritySettings onNext={handleNext} onBack={handleBack} />
          )}
          {currentStep === "join" && (
            <Join 
              onNext={handleNext} 
              onBack={handleBack}
              defaultWorkspace={targetWorkspaceForNewAccount?.workspaceName}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSwitcher;
