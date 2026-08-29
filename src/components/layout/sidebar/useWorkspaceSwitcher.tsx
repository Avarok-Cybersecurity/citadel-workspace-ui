import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { mayLeaveEditor } from '@/lib/leave-editor';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { claimSessionForThisTab, SESSION_OWNED_ELSEWHERE , type ClaimOutcome } from '@/lib/sessions/claim-session';
import { toStoredWorkspaces, pickCurrentWorkspace , type StoredWorkspace } from './stored-workspace-list';
import { describeFailure } from '@/lib/failure-message';
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { connectionManager } from "@/lib/connection";
import { ConnectionService } from "@/lib/connection-service";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { useToast } from "@/hooks/use-toast";
import { toastSuccess, toastError } from "@/lib/toast-helpers";
import { getSelectedUser, setSelectedUser , type TabUserContext } from "@/lib/tab-context";
import { getWorkspaceLogo , type WorkspaceLogo } from "@/lib/workspace-metadata-service";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { yieldToEventLoop } from '@/lib/utils/scheduling';
import { useWorkspaceTheme } from '@/lib/theme/workspace-theme-context';

export type { StoredWorkspace } from './stored-workspace-list';
import type { NavigateFunction } from 'react-router';
import type { CurrentConnectionInfo } from '@/lib/connection/types';
import type { StoredSessions, StoredSession } from '@/types/session-types';

export type WorkflowStep = "connect" | "security" | "join";

export interface UseWorkspaceSwitcherResult {
  availableWorkspaces: StoredWorkspace[];
  currentWorkspace: StoredWorkspace | null;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  isAddingWorkspace: boolean;
  setIsAddingWorkspace: Dispatch<SetStateAction<boolean>>;
  currentStep: WorkflowStep;
  workspaceLogo: string | null;
  isInitials: boolean;
  isSwitching: boolean;
  targetWorkspaceForNewAccount: { workspaceName: string; serverAddress: string } | null;
  setTargetWorkspaceForNewAccount: Dispatch<SetStateAction<{ workspaceName: string; serverAddress: string } | null>>;
  serverAddress: string;
  serverPassword: string;
  handleWorkspaceChange: (workspace: StoredWorkspace) => Promise<void>;
  handleAddWorkspace: () => void;
  handleAddAccountToWorkspace: (wsName: string, serverAddress: string) => void;
  handleManageAccounts: () => void;
  handleNext: (address?: string, password?: string) => void;
  handleBack: () => void;
}

export function useWorkspaceSwitcher(workspaceName?: string): UseWorkspaceSwitcherResult {
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
  // Server address and pre-shared key captured during the ServerConnect
  // step and forwarded into the Join step. Without this, Join (which
  // requires both as props) renders with `undefined` and the
  // registration call would fail downstream. Mirrors the equivalent
  // pattern in src/pages/Landing.tsx.
  const [serverAddress, setServerAddress] = useState<string>("");
  const [serverPassword, setServerPassword] = useState<string>("");
  const location: ReturnType<typeof useLocation> = useLocation();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  const navigate: NavigateFunction = useNavigate();
  const { state } = useWorkspace();
  const { theme } = useWorkspaceTheme();
  const { toast } = useToast();

  useEffect(() => {
    const loadStoredWorkspaces = async (): Promise<void> => {
      const storedSessions: StoredSessions = connectionManager.getStoredSessions();
      const tabSelectedUser: TabUserContext | null = await getSelectedUser();
      const connInfo: CurrentConnectionInfo | null = connectionManager.getConnectionInfo();
      const currentCid: bigint | null = connInfo?.cid ?? null;
      if (!storedSessions?.sessions?.length) { setAvailableWorkspaces([]); return; }

      const workspaces: StoredWorkspace[] = toStoredWorkspaces(storedSessions.sessions, state.workspace?.name, currentCid);
      setAvailableWorkspaces(workspaces);

      const active: StoredWorkspace | undefined = pickCurrentWorkspace(workspaces, tabSelectedUser);
      if (active) setCurrentWorkspace(active);
    };
    runAsyncSetup(loadStoredWorkspaces);
    // Returning the unsubscribe drops the previous handler: it fixes the
    // per-remount leak (see onConnectionChange) and a stale `state.workspace`
    // closure whose late IndexedDB read could restore an old workspace name.
    return ConnectionService.getInstance().onConnectionChange(() => {
      void loadStoredWorkspaces();
    });
  }, [state.workspace]);

  useEffect(() => {
    // The icon comes from the workspace theme, which is where it is edited and
    // stored. This used to pass the raw metadata bytes and test for a `.logo`
    // property that a byte array can never have, so it always fell through to
    // initials.
    const name: string | undefined = state.workspace?.name ?? workspaceName;
    if (!name) return;

    const logo: WorkspaceLogo = getWorkspaceLogo(name, theme.icon);
    setWorkspaceLogo(logo.data);
    setIsInitials(logo.type === 'initials');
  }, [state.workspace, workspaceName, theme.icon]);

  useEffect(() => {
    if (currentWorkspace) {
      setWorkspaceRoutes(prev => ({
        ...prev,
        [currentWorkspace.id]: location.pathname + location.search
      }));
    }
  }, [location.pathname, location.search, currentWorkspace]);

  const handleWorkspaceChange = async (workspace: StoredWorkspace): Promise<void> => {
    // Switching session tears the whole workspace down, editor included.
    if (!(await mayLeaveEditor(confirm))) return;

    if (isSwitching || workspace.id === currentWorkspace?.id) return;

    debugLog('WorkspaceSwitcher', 'Switching to workspace:', workspace.username, 'on', workspace.serverAddress);
    setIsSwitching(true);

    try {
      toastSuccess(toast, "Switching workspace...", `Connecting as ${workspace.fullName || workspace.username}`);

      // Hand control back so the toast above actually paints before the work
      // below starts. This was a flat 100ms guess: too short on a loaded machine
      // (the toast never appeared), and 100ms of dead time on every switch
      // otherwise. A macrotask yield returns the moment the browser has had its
      // chance to render — awaiting alone would not, since that only queues a
      // microtask, which runs before paint.
      await yieldToEventLoop();

      const storedSessions: StoredSessions = connectionManager.getStoredSessions();
      const targetSession: StoredSession | undefined = storedSessions.sessions.find(
        (s) => s.username === workspace.username && s.serverAddress === workspace.serverAddress
      );

      if (!targetSession) throw new Error('Session not found');
      if (!targetSession.cid) throw new Error('Session CID not available');

      const outcome: ClaimOutcome = await claimSessionForThisTab(targetSession.cid);
      if (outcome.status === 'owned-by-another-tab') {
        toast({ ...SESSION_OWNED_ELSEWHERE, variant: 'default' });
        setIsSwitching(false);
        return;
      }

      const index: number = storedSessions.sessions.indexOf(targetSession);
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
          <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
          <span>{workspace.fullName || workspace.username} · {workspace.workspaceName}</span>
        </div>
      ));

      const savedRoute: string = workspaceRoutes[workspace.id];
      if (savedRoute && savedRoute !== location.pathname + location.search) {
        navigate(savedRoute);
      }

    } catch (error) {
      debugLog('WorkspaceSwitcher', 'Failed to switch workspace:', error);
      toastError(toast, "Switch Failed", describeFailure(error, "Could not switch to the selected workspace"));
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  };

  const handleAddWorkspace = (): void => {
    setIsAddingWorkspace(true);
    setCurrentStep("connect");
    setTargetWorkspaceForNewAccount(null);
  };

  const handleAddAccountToWorkspace = (wsName: string, serverAddress: string): void => {
    setTargetWorkspaceForNewAccount({ workspaceName: wsName, serverAddress });
    setIsAddingWorkspace(true);
    setCurrentStep("connect");
    setIsOpen(false);
    toastSuccess(toast, "Adding New Account", `Join ${wsName} with a different account`);
  };

  const handleManageAccounts = (): void => {
    setIsOpen(false);
  };

  // ServerConnect calls `onNext(address, password)`; SecuritySettings and
  // Join call `onNext()` (no args). Treat the args as optional so this
  // single handler can serve all three steps without reshaping their APIs.
  const handleNext = (address?: string, password?: string): void => {
    switch (currentStep) {
      case "connect":
        if (address !== undefined) setServerAddress(address);
        if (password !== undefined) setServerPassword(password);
        setCurrentStep("security");
        break;
      case "security": setCurrentStep("join"); break;
      case "join":
        // Reset captured server creds when the dialog closes so a
        // subsequent "Add a Workspace" doesn't reuse stale values.
        setIsAddingWorkspace(false);
        setCurrentStep("connect");
        setServerAddress("");
        setServerPassword("");
        break;
    }
  };

  const handleBack = (): void => {
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
    serverAddress,
    serverPassword,
    handleWorkspaceChange,
    handleAddWorkspace,
    handleAddAccountToWorkspace,
    handleManageAccounts,
    handleNext,
    handleBack,
  };
}
