import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PlusCircle, TestTube2, Link, LogIn } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ServerConnect } from "@/components/ServerConnect";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Join } from "@/components/Join";
import { Login } from "@/components/Login";
import { listKnownServers } from "@/lib/tauri";
import { WorkspaceService } from "@/lib/workspace-service";

export const Landing = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<'none' | 'server' | 'security' | 'join' | 'login'>('none');
  const [hasExistingServers, setHasExistingServers] = useState(false);

  // Memoize the checkForServers function to prevent it from being recreated on each render
  const checkForServers = useCallback(async () => {
    try {
      // Using "0" as a valid u64 string representation for the landing page
      const response = await listKnownServers({ cid: "0" });
      setHasExistingServers(response.servers.length > 0);
    } catch (error: any) {
      console.error("Error checking for known servers:", error);
      const errorMessage = error.message || error.toString() || "Unknown error";
      console.error("Error details:", errorMessage);
    }
  }, []);

  // Run the effect only once when the component mounts
  useEffect(() => {
    checkForServers();
  }, [checkForServers]);

  const handleServerNext = () => setCurrentStep('security');
  const handleSecurityNext = () => setCurrentStep('join');
  const handleSecurityBack = () => setCurrentStep('server');
  const handleJoinNext = (cid: string) => {
    console.info(`[Landing] handleJoinNext called with cid: ${cid}`);
    try {
      const workspaceService = WorkspaceService.getInstance();
      workspaceService.setConnectionId(cid);
      // Trigger loading - no need to await, WorkspaceEventHandler will handle events
      console.info(`[Landing] Triggering workspace load for cid: ${cid}...`);
      workspaceService.loadWorkspace();
      workspaceService.listOffices(); // Also trigger office loading
      console.info('[Landing] Navigating to /office...');
      navigate('/office');
    } catch (error) {
      console.error("[Landing] Error during post-registration setup:", error);
      // TODO: Show an error message to the user
    }
  };
  const handleJoinBack = () => setCurrentStep('security');
  const startRegistration = () => setCurrentStep('server');
  const startLogin = () => setCurrentStep('login');
  const handleLoginNext = (cid: string) => {
    console.info(`[Landing] handleLoginNext called with cid: ${cid}`);
    try {
      const workspaceService = WorkspaceService.getInstance();
      workspaceService.setConnectionId(cid);
      // Trigger loading
      console.info(`[Landing] Triggering workspace load for cid: ${cid}...`);
      workspaceService.loadWorkspace();
      workspaceService.listOffices();
      console.info('[Landing] Navigating to /office...');
      navigate('/office');
    } catch (error) {
      console.error("[Landing] Error during post-login setup:", error);
      // TODO: Show an error message to the user
    }
  };
  const goToTestPage = () => navigate('/test');
  const goToConnectPage = () => navigate('/connect');

  return (
    <div className="min-h-screen flex items-center relative overflow-hidden bg-[#1C1D28]">
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
      <div className="container mx-auto px-4 sm:px-6 py-10 md:py-0 relative z-10">
        <div className="max-w-xl lg:max-w-3xl animate-fade-in">
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

            <Button
              variant="outline"
              className="border-white bg-white text-black hover:bg-gray-100 text-base md:text-lg px-4 md:px-6 h-12 md:h-[60px] flex items-center gap-2 transition-colors duration-300 w-full sm:w-auto"
              size="lg"
            >
              <PlusCircle className="w-4 h-4 md:w-5 md:h-5" />
              <span className="whitespace-nowrap">Create Workspace</span>
            </Button>

            <Button
              onClick={goToTestPage}
              variant="outline"
              className="border-white/30 bg-transparent text-white hover:bg-white/10 text-base md:text-lg px-4 md:px-6 h-12 md:h-[60px] flex items-center gap-2 transition-colors duration-300 w-full sm:w-auto"
              size="lg"
            >
              <TestTube2 className="w-4 h-4 md:w-5 md:h-5" />
              <span className="whitespace-nowrap">Test Integration</span>
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
    </div>
  );
};

export default Landing;