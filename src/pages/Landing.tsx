import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogIn, Settings } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ServerConnect } from "@/components/ServerConnect";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Join } from "@/components/Join";
import { Login } from "@/components/Login";
import WorkspaceService from "@/lib/workspace-service";
import type { SecuritySettingsValues } from "@/components/SecuritySettings";
import { listKnownServers } from "@/lib/server-utils";
import { ManageAccountsButton } from "@/components/ManageAccountsButton";
import { ConnectionManager } from "@/lib/connection";
import { OrphanSessionsNavbar } from "@/components/OrphanSessionsNavbar";
import { LoginConflictModal } from "@/components/LoginConflictModal";
import { SettingsModal } from "@/components/SettingsModal";
import { cn } from "@/lib/utils";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { useToast } from '@/hooks/use-toast';
import { toastError } from '@/lib/toast-helpers';

export const Landing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<'none' | 'server' | 'security' | 'join' | 'login'>('none');
  const [hasOrphanSessions, setHasOrphanSessions] = useState(false);
  const [orphanSessionCount, setOrphanSessionCount] = useState(0);
  const [showLoginConflict, setShowLoginConflict] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Check for orphan sessions (don't auto-navigate, just detect)
  useEffect(() => {
    const checkOrphanSessions = async () => {
      try {
        // Get the connection manager instance
        const connectionManager = ConnectionManager.getInstance();

        // Wait for connection manager to be ready before getting sessions
        // This prevents race conditions during component initialization
        await connectionManager.waitForReady();

        // Get active sessions from internal service
        const activeSessions = await connectionManager.getActiveSessions();

        if (activeSessions && activeSessions.length > 0) {
          debugLog('Landing', 'Landing: Found orphan sessions:', activeSessions.length);
          setHasOrphanSessions(true);
          setOrphanSessionCount(activeSessions.length);
          // Note: Don't auto-navigate - let user choose from the navbar
        } else {
          debugLog('Landing', 'Landing: No orphan sessions found');
          setHasOrphanSessions(false);
          setOrphanSessionCount(0);
        }
      } catch (error) {
        debugLog('Landing', 'Landing: Error checking orphan sessions:', error);
        setHasOrphanSessions(false);
        setOrphanSessionCount(0);
      }
    };

    runAsyncSetup(checkOrphanSessions);
  }, [navigate]);

  // Listen for custom event from Manage Accounts to open join flow
  useEffect(() => {
    const handler = () => setCurrentStep('server');
    window.addEventListener('open-join-workspace', handler);
    return () => window.removeEventListener('open-join-workspace', handler);
  }, []);

  // Memoize the checkForServers function to prevent it from being recreated on each render
  const checkForServers = useCallback(async () => {
    try {
      // Using "0" as a valid u64 string representation for the landing page
      await listKnownServers({ cid: "0" });
    } catch (error: unknown) {
      // Silently ignore initialization errors on the landing page
      // The WebSocket service will be initialized when needed
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage?.includes('WASM client not initialized')) {
        debugLog('Landing', 'WebSocket not yet initialized, skipping known servers check');
      } else {
        debugLog('Landing', 'Error checking for known servers:', error);
        debugLog('Landing', 'Error details:', errorMessage);
      }
    }
  }, []);

  // Run the effect only once when the component mounts
  useEffect(() => {
    runAsyncSetup(checkForServers);
  }, [checkForServers]);

  const handleServerNext = () => setCurrentStep('security');
  const handleSecurityNext = () => {
    if (currentStep === 'security') {
      // Store the security settings for use in create flow
      setCurrentStep('join');
    }
  };
  const handleSecurityBack = () => setCurrentStep('server');
  const handleJoinNext = async (cid: string) => {
    debugLog('Landing', `[Landing] handleJoinNext called with cid: ${cid}`);
    try {
      WorkspaceService.setConnectionId(BigInt(cid));
      // Trigger loading - await to ensure operations complete before navigation
      debugLog('Landing', `[Landing] Triggering workspace load for cid: ${cid}...`);
      await WorkspaceService.loadWorkspace();
      await WorkspaceService.listNodes(); // Also trigger office loading
      debugLog('Landing', '[Landing] Navigating to /office...');
      navigate(getWorkspacePath());
    } catch (error) {
      debugLog('Landing', 'Error during post-registration setup:', error);
      toastError(toast, "Setup Failed", error instanceof Error ? error.message : "Failed to load workspace after registration");
    }
  };
  const handleJoinBack = () => setCurrentStep('security');
  const startRegistration = () => {
    // Allow joining new workspaces regardless of existing sessions (Slack-like multi-workspace)
    setCurrentStep('server');
  };
  const startLogin = () => {
    // Allow login flow - username-specific conflict check happens in Login.tsx
    setCurrentStep('login');
  };
  const handleLoginNext = async (cid: string) => {
    debugLog('Landing', `[Landing] handleLoginNext called with cid: ${cid}`);
    try {
      WorkspaceService.setConnectionId(BigInt(cid));
      // Trigger loading - await to ensure operations complete before navigation
      debugLog('Landing', `[Landing] Triggering workspace load for cid: ${cid}...`);
      await WorkspaceService.loadWorkspace();
      await WorkspaceService.listNodes();
      debugLog('Landing', '[Landing] Navigating to /office...');
      navigate(getWorkspacePath());
    } catch (error) {
      debugLog('Landing', 'Error during post-login setup:', error);
      toastError(toast, "Login Setup Failed", error instanceof Error ? error.message : "Failed to load workspace after login");
    }
  };


  return (
    <div className="h-screen flex items-center relative overflow-hidden bg-[#1C1D28]">
      {/* Orphan sessions navbar */}
      <OrphanSessionsNavbar />

      {/* Solid background base */}
      <div className="absolute inset-0 z-0 bg-[#1C1D28] fixed" />

      {/* Background Image with proper positioning */}
      <div
        className="absolute inset-0 z-[1] bg-center bg-no-repeat bg-contain w-full h-full fixed md:bg-right"
        style={{
          backgroundImage: "url('/lovable-uploads/fcd25400-92a0-41ed-95ae-573a0298bd55.png')",
        }}
      />

      {/* Strong gradient overlay for smooth transition */}
      <div
        className="absolute inset-0 z-[2] fixed pointer-events-none"
        style={{
          background: 'linear-gradient(to right, #1C1D28 0%, #1C1D28 30%, rgba(28, 29, 40, 0.7) 60%, rgba(28, 29, 40, 0.2) 80%, rgba(28, 29, 40, 0) 100%)',
        }}
      />

      {/* Content */}
      <div className={cn(
        "container mx-auto px-4 sm:px-6 py-10 md:py-0 relative z-10",
        hasOrphanSessions && "pt-24"
      )}>
        <div className="max-w-xl lg:max-w-3xl animate-fade-in">
          <p className="text-sm font-bold tracking-[0.3em] text-purple-400 mb-3 uppercase">Citadel</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 md:mb-6 leading-tight">
            The World's First Post-Quantum Virtual Workspace
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-gray-300 mb-6 md:mb-8 lg:mb-12">
            Hyper-security and control over defense and privacy at your fingertips
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4">
            <Button
              onClick={startLogin}
              className="bg-purple-600 text-white hover:bg-purple-700 text-base md:text-lg px-4 md:px-6 h-12 md:h-[60px] transition-colors duration-300 w-full sm:w-auto flex items-center gap-2"
              size="lg"
            >
              <LogIn className="w-4 h-4 md:w-5 md:h-5" />
              <span className="whitespace-nowrap">Login Workspace</span>
            </Button>

            <Button
              onClick={startRegistration}
              className="bg-white text-black hover:bg-gray-100 text-base md:text-lg px-4 md:px-6 h-12 md:h-[60px] transition-colors duration-300 w-full sm:w-auto"
              size="lg"
            >
              <span className="whitespace-nowrap">Join Workspace</span>
            </Button>
          </div>

          {/* Account management and settings buttons */}
          <div className="mt-8 flex gap-3">
            <ManageAccountsButton />
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Registration Flow Overlays */}
      {currentStep === 'server' && (
        <ServerConnect onNext={handleServerNext} onCancel={() => setCurrentStep('none')} />
      )}
      {currentStep === 'security' && (
        <SecuritySettings onNext={handleSecurityNext} onBack={handleSecurityBack} />
      )}
      {currentStep === 'join' && (
        <Join onNext={handleJoinNext} onBack={handleJoinBack} />
      )}
      {currentStep === 'login' && (
        <Login onNext={handleLoginNext} onCancel={() => setCurrentStep('none')} />
      )}

      {/* Login conflict modal */}
      <LoginConflictModal
        open={showLoginConflict}
        onOpenChange={setShowLoginConflict}
        workspaceCount={orphanSessionCount}
        onDismiss={() => {
          // Just close the modal - user can use the navbar icons
          setShowLoginConflict(false);
        }}
      />

      {/* Settings modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default Landing;