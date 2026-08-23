import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogIn, Settings, Shield, ArrowRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ServerConnect } from "@/components/ServerConnect";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Join } from "@/components/Join";
import { Login } from "@/components/Login";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { listKnownServers } from "@/lib/server-utils";
import { ManageAccountsButton } from "@/components/ManageAccountsButton";
import { ConnectionManager } from "@/lib/connection";
import { OrphanSessionsNavbar } from "@/components/OrphanSessionsNavbar";
import { SettingsModal } from "@/components/SettingsModal";
import { cn } from "@/lib/utils";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { useToast } from '@/hooks/use-toast';
import { toastError } from '@/lib/toast-helpers';

export const Landing = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<'none' | 'server' | 'security' | 'join' | 'login'>('none');
  const [hasOrphanSessions, setHasOrphanSessions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Server connection data lifted to Landing state to avoid React Query GC eviction
  const [serverAddress, setServerAddress] = useState('');
  const [serverPassword, setServerPassword] = useState('');

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
          // Note: Don't auto-navigate - let user choose from the navbar
        } else {
          debugLog('Landing', 'Landing: No orphan sessions found');
          setHasOrphanSessions(false);
        }
      } catch (error) {
        debugLog('Landing', 'Landing: Error checking orphan sessions:', error);
        setHasOrphanSessions(false);
      }
    };

    runAsyncSetup(checkOrphanSessions);
  }, [navigate]);

  // Open the join flow when navigated here with ?join=1 (e.g. from the
  // Manage Accounts empty state on any route). Clears the param after
  // consuming it so back/forward stays clean.
  useEffect(() => {
    if (searchParams.get('join') === '1') {
      setCurrentStep('server');
      const next = new URLSearchParams(searchParams);
      next.delete('join');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const handleServerNext = (address: string, password: string) => {
    setServerAddress(address);
    setServerPassword(password);
    setCurrentStep('security');
  };
  const handleSecurityNext = () => {
    if (currentStep === 'security') {
      setCurrentStep('join');
    }
  };
  const handleSecurityBack = () => setCurrentStep('server');
  const handleJoinNext = async (cid: string) => {
    debugLog('Landing', `[Landing] handleJoinNext called with cid: ${cid}`);
    try {
      await postAuthSetup(BigInt(cid));
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
      await postAuthSetup(BigInt(cid));
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

      {/* Subtle dot grid pattern */}
      <div
        className="absolute inset-0 z-[0] fixed pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #8B5CF6 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Subtle radial gradient accent */}
      <div
        className="absolute inset-0 z-[0] fixed pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 70% 50%, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
        }}
      />

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
        "container mx-auto px-6 sm:px-8 lg:px-12 py-10 md:py-0 relative z-10",
        hasOrphanSessions && "pt-24"
      )}>
        <div className="max-w-xl lg:max-w-2xl animate-fade-in">
          {/* Brand tag */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-[2px] bg-purple-500 rounded-full" />
            <p className="text-xs font-semibold tracking-[0.25em] text-purple-400 uppercase">Citadel</p>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            The World's First
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-purple-300 bg-clip-text text-transparent">Post-Quantum</span>
            <br />
            Virtual Workspace
          </h1>

          <p className="text-lg text-gray-400 mb-10 max-w-md leading-relaxed">
            Hyper-security and control over defense and privacy at your fingertips
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={startLogin}
              className="bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium px-6 h-11 transition-all duration-200 w-full sm:w-auto flex items-center gap-2 rounded-lg shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
              size="lg"
            >
              <LogIn className="w-4 h-4" />
              Login Workspace
            </Button>

            <Button
              onClick={startRegistration}
              variant="outline"
              className="border-[#3B3D57] text-gray-300 hover:bg-[#232536] hover:text-white hover:border-purple-500/50 text-sm font-medium px-6 h-11 transition-all duration-200 w-full sm:w-auto flex items-center gap-2 rounded-lg"
              size="lg"
            >
              Join Workspace
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Secondary actions */}
          <div className="mt-6 flex items-center gap-4">
            <ManageAccountsButton />
            <div className="w-[1px] h-4 bg-gray-700" />
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-gray-500 hover:text-gray-300 hover:bg-transparent px-0 h-auto text-xs"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Button>
          </div>

          {/* Security badge */}
          <div className="mt-12 flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-500/5 border border-purple-500/10 max-w-md">
            <Shield className="w-5 h-5 text-purple-400 flex-shrink-0" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Citadel uses <span className="text-purple-300 font-medium">lattice-based cryptography</span>. All connections are end-to-end encrypted and resistant to quantum compute attacks.
            </p>
          </div>
        </div>
      </div>

      {/* Registration Flow Overlays */}
      {currentStep === 'server' && (
        <ServerConnect
          onNext={handleServerNext}
          onCancel={() => setCurrentStep('none')}
          initialAddress={serverAddress}
          initialPassword={serverPassword}
        />
      )}
      {currentStep === 'security' && (
        <SecuritySettings onNext={handleSecurityNext} onBack={handleSecurityBack} />
      )}
      {currentStep === 'join' && (
        <Join
          onNext={handleJoinNext}
          onBack={handleJoinBack}
          serverAddress={serverAddress}
          serverPassword={serverPassword}
        />
      )}
      {currentStep === 'login' && (
        <Login onNext={handleLoginNext} onCancel={() => setCurrentStep('none')} />
      )}

      {/* Settings modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default Landing;
