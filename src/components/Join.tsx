import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, HelpCircle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceConfig } from "@/types/workspace";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { websocketService } from "@/lib/websocket-service";
import { Label } from "@/components/ui/label";
import { SecuritySettingsValues } from "./SecuritySettings";
import { SecurityLevel, SecrecyMode, EncryptionAlgorithm, KemAlgorithm, SigAlgorithm } from "@/types";
import { WorkspaceNotInitializedModal } from "./WorkspaceNotInitializedModal";
import WorkspaceService from "@/lib/workspace-service";
import { ConnectRequestTS, ConnectMode, UdpMode } from "@/types";
import { eventEmitter } from "@/lib/event-emitter";
import { ConnectionManager } from "@/lib/connection-manager";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { mapSecuritySettings } from "@/lib/security-utils";
import { ConnectLoadingModal, type ConnectStatus } from "./LoadingModal";

interface JoinProps {
  onNext: (cid: string) => void;
  onBack: () => void;
  defaultWorkspace?: string;
}

export const Join = ({ onNext, onBack, defaultWorkspace }: JoinProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isRegistering, setIsRegistering] = useState(false);
  const [showNotInitializedModal, setShowNotInitializedModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("connecting");
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });

  // Get connection and security settings from React Query cache
  const serverData = queryClient.getQueryData(['serverConnectForm']) as {
    serverAddress: string;
    password: string
  } || { serverAddress: '', password: '' };

  const securitySettings = queryClient.getQueryData<SecuritySettingsValues>(['securitySettings']) || {
    securityLevel: 'Standard',
    secrecyMode: 'BestEffort',
    encryptionAlgorithm: 'AES_GCM_256',
    kemAlgorithm: 'Kyber',
    sigAlgorithm: 'None',
    headerObfuscatorSettings: {},
    // storeCredentials: false, 
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName || !formData.username || !formData.password || !formData.confirmPassword) {
      toast({
        title: "Missing Fields",
        description: "Please fill out all fields to continue",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "The passwords you entered do not match",
        variant: "destructive",
      });
      return;
    }

    setIsRegistering(true);
    setShowConnectModal(true);
    setConnectStatus("connecting");

    try {
      // Construct the request payload matching Rust structure
      const registerPayload = {
        request: {
          workspaceIdentifier: serverData.serverAddress,
          workspacePassword: serverData.password || "",
          fullName: formData.fullName,
          username: formData.username,
          profilePassword: formData.password,
          sessionSecuritySettings: {
            securityLevel: securitySettings.securityLevel,
            secrecyMode: securitySettings.secrecyMode,
            encryptionAlgorithm: securitySettings.encryptionAlgorithm,
            kemAlgorithm: securitySettings.kemAlgorithm,
            sigAlgorithm: securitySettings.sigAlgorithm,
            headerObfuscatorSettings: securitySettings.headerObfuscatorSettings
          }
        }
      };

      console.info("Register Payload:", JSON.stringify(registerPayload, null, 2));

      // Generate request ID first to avoid race condition
      const requestId = crypto.randomUUID();
      
      // Set up a one-time listener for the registration response BEFORE sending request
      const responsePromise = new Promise<{ cid: string }>((resolve, reject) => {
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            eventEmitter.off('websocket-message', handler);
            reject(new Error('Registration timed out after 10 seconds'));
          }
        }, 10000); // Increased timeout

        const handler = (message: any) => {
          console.log('Registration response received:', message);
          console.log('Response content:', JSON.stringify(message, null, 2));
          console.log('Expected requestId:', requestId);
          
          // Handle both wrapped and unwrapped responses
          // Try direct access first (for messages from internal service)
          // Since connect_after_register is true, we'll receive ConnectSuccess
          if (message.ConnectSuccess && message.ConnectSuccess.request_id === requestId) {
            resolved = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            // Store the session for persistence with the CID
            const connectionManager = ConnectionManager.getInstance();
            connectionManager.handleAuthSuccess(
              formData.username,
              formData.password,
              formData.fullName,
              serverData.serverAddress,
              serverData.password || "", // Server password from ServerConnect step
              mapSecuritySettings(securitySettings), // Map camelCase to snake_case
              message.ConnectSuccess.cid
            );
            resolve({ cid: message.ConnectSuccess.cid });
          } else if (message.RegisterFailure && message.RegisterFailure.request_id === requestId) {
            resolved = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            reject(new Error(message.RegisterFailure.message || 'Registration failed'));
          } else if (message.WorkspaceError && message.WorkspaceError.request_id === requestId) {
            resolved = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            if (message.WorkspaceError.error === 'WorkspaceNotInitialized') {
              setShowNotInitializedModal(true);
              reject(new Error('Workspace not initialized'));
            } else {
              reject(new Error(message.WorkspaceError.message || 'Workspace error'));
            }
          } else if (message.InternalServiceError && message.InternalServiceError.request_id === requestId) {
            resolved = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            reject(new Error(message.InternalServiceError.message || 'Internal service error'));
          } else {
            // Also check wrapped format (Response.RegisterSuccess)
            const response = message.Response || message;
            if (response !== message) {
              // It was wrapped, check again
              // Since connect_after_register is true, we'll receive ConnectSuccess
              if (response.ConnectSuccess && response.ConnectSuccess.request_id === requestId) {
                resolved = true;
                clearTimeout(timeout);
                eventEmitter.off('websocket-message', handler);
                // Store the session for persistence with the CID
                const connectionManager = ConnectionManager.getInstance();
                connectionManager.handleAuthSuccess(
                  formData.username,
                  formData.password,
                  formData.fullName,
                  serverData.serverAddress,
                  serverData.password || "", // Server password from ServerConnect step
                  mapSecuritySettings(securitySettings), // Map camelCase to snake_case
                  response.ConnectSuccess.cid
                );
                resolve({ cid: response.ConnectSuccess.cid });
              } else if (response.RegisterFailure && response.RegisterFailure.request_id === requestId) {
                resolved = true;
                clearTimeout(timeout);
                eventEmitter.off('websocket-message', handler);
                reject(new Error(response.RegisterFailure.message || 'Registration failed'));
              } else if (response.ConnectFailure && response.ConnectFailure.request_id === requestId) {
                resolved = true;
                clearTimeout(timeout);
                eventEmitter.off('websocket-message', handler);
                reject(new Error(response.ConnectFailure.message || 'Connection after registration failed'));
              }
            }
          }
        };

        // Set up listener for responses
        eventEmitter.on('websocket-message', handler);
        console.log('Join: Event listener registered');
      });

      // Send the registration request with our pre-generated request ID
      await websocketService.register(
        requestId,
        formData.username,
        formData.password,
        formData.fullName,
        serverData.serverAddress,
        // NOT to be confused with the "workspace master password", which only is for admins.
        // The "password" is an optional security feature that prevents connections to the server (at the Citadel Protocol layer)
        // unless the password is provided. For security reasons, a client does not know if such a password is required unless it is provided.
        serverData.password || "",
        {
          securityLevel: securitySettings.securityLevel,
          secrecyMode: securitySettings.secrecyMode,
          encryptionAlgorithm: securitySettings.encryptionAlgorithm,
          kemAlgorithm: securitySettings.kemAlgorithm,
          sigAlgorithm: securitySettings.sigAlgorithm,
          headerObfuscatorSettings: securitySettings.headerObfuscatorSettings
        }
      );
      
      console.log('Registration request sent with ID:', requestId);
      setConnectStatus("authenticating");

      // Wait for response
      const response = await responsePromise;
      setConnectStatus("loading");

      console.info("Register Response:", response);

      toast({
        title: "Registration Successful",
        description: "Your account has been registered. Connecting to workspace...",
        variant: "default",
      });

      // Show ready status - modal will auto-close and navigate via onComplete callback
      setConnectStatus("ready");
    } catch (error: any) {
      console.error("Registration Error:", error); // Add logging

      // Close modal on error (unless it's workspace not initialized, which shows its own modal)
      if (!error.message?.includes('Workspace not initialized')) {
        setShowConnectModal(false);
      } else {
        setShowConnectModal(false);
      }

      toast({
        title: getErrorTitle(error),
        description: getUserFriendlyErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      console.info("Setting isRegistering to false in finally block."); // Log in finally
      setIsRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md">
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg">
          <CardHeader>
            <CardTitle className="text-white text-xl">Create Your Profile</CardTitle>
            <CardDescription className="text-gray-300">
              {defaultWorkspace ? `Join ${defaultWorkspace} with a new account` : "Create your profile for this workspace"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-gray-300">
                  Full Name
                </Label>
                <div className="relative">
                  <Input
                    id="fullName"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
                    placeholder="John Doe"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                        <p>Enter your full name for this workspace profile</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">
                  Username
                </Label>
                <div className="relative">
                  <Input
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
                    placeholder="john.doe.33"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                        <p>Choose a unique username for your workspace profile</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">
                  Profile Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                        <p>Create a strong password for your profile</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-300">
                  Confirm Profile Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                        <p>Re-enter your password to confirm</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                className="text-white hover:bg-purple-500/20"
                disabled={isRegistering}
              >
                BACK
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    REGISTERING...
                  </>
                ) : "JOIN"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
      
      <WorkspaceNotInitializedModal
        isOpen={showNotInitializedModal}
        onReturnToLogin={() => {
          setShowNotInitializedModal(false);
          onBack();
        }}
      />

      <ConnectLoadingModal
        open={showConnectModal}
        status={connectStatus}
        username={formData.username}
        onComplete={() => {
          setShowConnectModal(false);
          navigate(getWorkspacePath());
        }}
      />
    </div>
  );
};
