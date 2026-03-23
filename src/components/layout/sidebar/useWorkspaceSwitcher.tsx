import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { connectionManager } from "@/lib/connection";
import { ConnectionService } from "@/lib/connection-service";
import { websocketService } from "@/lib/websocket-service";
import WorkspaceService from "@/lib/workspace-service";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { useToast } from "@/hooks/use-toast";
import { toastSuccess, toastError } from "@/lib/toast-helpers";
import { getSelectedUser, setSelectedUser } from "@/lib/tab-context";
import { getWorkspaceLogo, getWorkspaceInitials } from "@/lib/workspace-metadata-service";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export interface StoredWorkspace {
  id: string;
  username: string;
  serverAddress: string;
  workspaceName?: string;
  isActive: boolean;
  cid?: bigint;
  fullName?: string;
  role?: string;
}

export type WorkflowStep = "connect" | "security" | "join";

export function useWorkspaceSwitcher(workspaceName?: string) {
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

  useEffect(() => {
    const loadStoredWorkspaces = async () => {
      const storedSessions = connectionManager.getStoredSessions();
      const tabSelectedUser = await getSelectedUser();
      const connInfo = connectionManager.getConnectionInfo();
      const currentCid: bigint | null = connInfo?.cid ?? null;
      if (!storedSessions?.sessions?.length) { setAvailableWorkspaces([]); return; }

      const workspaces: StoredWorkspace[] = storedSessions.sessions.map((session) => ({
        id: `${session.serverAddress}-${session.username}`,
        username: session.username, serverAddress: session.serverAddress,
        workspaceName: state.workspace?.name || session.username,
        isActive: session.cid === currentCid, cid: session.cid,
        fullName: session.fullName, role: session.role || 'Member'
      }));
      setAvailableWorkspaces(workspaces);

      let active = tabSelectedUser?.selectedUsername
        ? workspaces.find(w => w.username === tabSelectedUser.selectedUsername && w.serverAddress === tabSelectedUser.selectedServerAddress)
        : undefined;
      if (!active) active = workspaces.find(w => w.isActive);
      if (active) setCurrentWorkspace(active);
    };
    runAsyncSetup(loadStoredWorkspaces);
    // NOTE: ConnectionService.onConnectionChange does not return an unsubscribe function.
    // This listener will persist for the lifetime of the component.
    ConnectionService.getInstance().onConnectionChange(async () => { await loadStoredWorkspaces(); });
  }, [state.workspace]);

  useEffect(() => {
    if (state.workspace?.metadata) {
      const logo = getWorkspaceLogo(state.workspace.name, state.workspace.metadata);
      setWorkspaceLogo(logo.data);
      setIsInitials(logo.type !== 'image');
    } else if (workspaceName) {
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
      toastSuccess(toast, "Switching workspace...", `Connecting as ${workspace.fullName || workspace.username}`);

      // Brief delay to show switching toast before heavy work
      await new Promise(resolve => setTimeout(resolve, 100));

      const storedSessions = connectionManager.getStoredSessions();
      const targetSession = storedSessions.sessions.find(
        (s) => s.username === workspace.username && s.serverAddress === workspace.serverAddress
      );

      if (!targetSession) throw new Error('Session not found');
      if (!targetSession.cid) throw new Error('Session CID not available');

      try {
        await websocketService.claimSession(targetSession.cid, true);
        debugLog('WorkspaceSwitcher', 'Session claimed successfully (was orphaned)');
      } catch (claimError: unknown) {
        if (claimError instanceof Error && claimError.message?.includes('not orphaned')) {
          debugLog('WorkspaceSwitcher', 'Session is still active (not orphaned), no claim needed');
        } else {
          throw claimError;
        }
      }

      const index = storedSessions.sessions.indexOf(targetSession);
      if (index >= 0) {
        await connectionManager.setActiveSessionIndex(index);
      }

      await setSelectedUser({
        selectedUsername: workspace.username,
        selectedServerAddress: workspace.serverAddress,
        selectedCid: targetSession.cid
      });

      await postAuthSetup(targetSession.cid);

      toastSuccess(toast, "Connected!", (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>{workspace.fullName || workspace.username} · {workspace.workspaceName}</span>
        </div>
      ));

      const savedRoute = workspaceRoutes[workspace.id];
      if (savedRoute && savedRoute !== location.pathname + location.search) {
        navigate(savedRoute);
      }

    } catch (error) {
      debugLog('WorkspaceSwitcher', 'Failed to switch workspace:', error);
      toastError(toast, "Switch Failed", "Could not switch to the selected workspace");
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

  const handleAddAccountToWorkspace = (wsName: string, serverAddress: string) => {
    setTargetWorkspaceForNewAccount({ workspaceName: wsName, serverAddress });
    setIsAddingWorkspace(true);
    setCurrentStep("connect");
    setIsOpen(false);
    toastSuccess(toast, "Adding New Account", `Join ${wsName} with a different account`);
  };

  const handleManageAccounts = () => {
    setIsOpen(false);
  };

  const handleNext = () => {
    switch (currentStep) {
      case "connect": setCurrentStep("security"); break;
      case "security": setCurrentStep("join"); break;
      case "join": setIsAddingWorkspace(false); setCurrentStep("connect"); break;
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case "security": setCurrentStep("connect"); break;
      case "join": setCurrentStep("security"); break;
    }
  };

  return {
    availableWorkspaces,
    currentWorkspace,
    isOpen,
    setIsOpen,
    isAddingWorkspace,
    setIsAddingWorkspace,
    currentStep,
    workspaceLogo,
    isInitials,
    isSwitching,
    targetWorkspaceForNewAccount,
    setTargetWorkspaceForNewAccount,
    handleWorkspaceChange,
    handleAddWorkspace,
    handleAddAccountToWorkspace,
    handleManageAccounts,
    handleNext,
    handleBack,
  };
}
