import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Settings, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useToast } from "@/components/ui/use-toast";
import { websocketService } from "@/lib/websocket-service";
import { connectionManager } from "@/lib/connection";
import { eventEmitter } from "@/lib/event-emitter";
import { isResponseType } from 'citadel-workspace-client-ts';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import { getDefaultSecuritySettings } from "@/lib/security-utils";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import WorkspaceService from "@/lib/workspace-service";
import { setSelectedUser } from "@/lib/tab-context";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { ConnectLoadingModal, ConnectStatus } from "./LoadingModal";
import {
  ConnectMode,
  UdpMode,
  SecurityLevel,
  SecrecyMode,
  EncryptionAlgorithm,
  KemAlgorithm,
  SigAlgorithm,
  stringToUint8Array
} from "@/types";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

interface LoginProps {
  onNext: (connectionId: string) => void;
  onCancel: () => void;
}

interface SecuritySettingsState {
  securityLevel: SecurityLevel;
  secrecyMode: SecrecyMode;
  encryptionAlgorithm: EncryptionAlgorithm;
  kemAlgorithm: KemAlgorithm;
  sigAlgorithm: SigAlgorithm;
  headerObfuscatorSettings: Record<string, string>;
  storeCredentials: boolean;
}

export function Login({ onNext, onCancel }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);

  // Default security settings that can be overridden by SecuritySettings component
  const [securitySettings, setSecuritySettings] = useState<SecuritySettingsState>({
    securityLevel: 'Standard',
    secrecyMode: 'BestEffort',
    encryptionAlgorithm: 'AES_GCM_256',
    kemAlgorithm: 'MlKem',
    sigAlgorithm: 'None',
    headerObfuscatorSettings: {},
    storeCredentials: false
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  // WebSocket service is initialized by ConnectionManager in WorkspaceApp

  /**
   * Seamlessly redirect to an existing session instead of showing an error.
   * This provides a smooth UX - user doesn't need to know the session already exists.
   */
  const redirectToExistingSession = async (session: { cid: bigint; username: string; server_address: string }) => {
    try {
      debugLog('Login', 'Redirecting to existing session seamlessly:', session.username);

      // Show loading toast
      toast({
        title: "Reconnecting...",
        description: `Loading ${session.username}'s workspace`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });

      // Update last accessed time for ordering in Previous Sessions navbar
      const lastAccessedKey = `session_last_accessed_${session.cid.toString()}`;
      localStorage.setItem(lastAccessedKey, Date.now().toString());

      // Try to claim the session if it's orphaned
      try {
        await websocketService.claimSession(session.cid, true);
        debugLog('Login', 'Session claimed successfully (was orphaned)');
      } catch (claimError: unknown) {
        if (claimError instanceof Error && claimError.message?.includes('not orphaned')) {
          debugLog('Login', 'Session is still active (not orphaned), no claim needed');
        } else {
          // Re-throw if it's a different error
          throw claimError;
        }
      }

      // Get stored sessions to find the session index
      const storedSessions = connectionManager.getStoredSessions();
      const storedIndex = storedSessions.sessions.findIndex(
        (stored) =>
          stored.username === session.username &&
          stored.serverAddress === session.server_address
      );

      // Set the active session index if found
      if (storedIndex >= 0) {
        await connectionManager.setActiveSessionIndex(storedIndex);
      }

      // Update tab context to track which workspace this tab is viewing
      await setSelectedUser({
        selectedUsername: session.username,
        selectedServerAddress: session.server_address,
        selectedCid: session.cid
      });

      // Set the connection ID in WorkspaceService
      WorkspaceService.setConnectionId(session.cid);

      // Start WASM connection manager for this CID (handles leader/follower transitions)
      try {
        await wasmConnectionManager.start(session.cid.toString());
        debugLog('Login', 'WASM connection manager started for CID:', session.cid.toString());
      } catch (error) {
        debugLog('Login', 'Failed to start WASM connection manager:', error);
        // Don't block navigation - P2P messaging may not be immediately needed
      }

      // Trigger workspace loading
      await WorkspaceService.loadWorkspace();
      await WorkspaceService.listNodes();

      // CRITICAL: Emit session:activated to trigger P2P re-establishment
      // This ensures P2P channels are established when redirecting to existing session
      eventEmitter.emit('session:activated', {
        cid: session.cid.toString(),
        username: session.username,
        serverAddress: session.server_address,
        activationType: 'claim', // Treat as claim since we're reclaiming existing session
      });
      debugLog('Login', 'Emitted session:activated for redirect to existing session');

      // Navigate to the office page
      navigate(getWorkspacePath());

      // Show success toast
      toast({
        title: "Connected!",
        description: `Now viewing ${session.username}'s workspace`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });

      // Call onNext to complete the login flow
      onNext(session.cid.toString());
    } catch (error) {
      debugLog('Login', 'Failed to redirect to existing session:', error);
      toast({
        title: "Connection Failed",
        description: "Could not reconnect to workspace. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if this specific username already has an active session (multi-workspace support)
      const activeSessions = await connectionManager.getActiveSessions();
      const existingSession = activeSessions.find(session => session.username === username.trim());

      if (existingSession) {
        // Don't silently redirect - inform user they need to select or disconnect first
        debugLog('Login', 'User already has active session:', existingSession);
        setError('You are already logged in. Please select the session from the top bar, or disconnect it first if you wish to login again.');
        setLoading(false);
        return;
      }

      // Look up stored session to get server address (stored during registration)
      // If no stored session exists (e.g., after Sign out), use the form input server address
      const storedSessions = connectionManager.getStoredSessions();
      const storedSession = storedSessions.sessions.find(s => s.username === username.trim());
      const serverAddress = storedSession?.serverAddress || server.trim() || '';

      if (!serverAddress) {
        debugLog('Login', 'No stored session and no server address provided - connection may fail');
      } else if (!storedSession) {
        debugLog('Login', 'Using form server address:', serverAddress);
      }

      // Generate request ID first to avoid race condition
      const requestId = crypto.randomUUID();
      
      // Set up event listener to capture connection response BEFORE sending request
      let responseReceived = false;
      const responsePromise = new Promise<bigint>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!responseReceived) {
            eventEmitter.off('websocket-message', handler);
            reject(new Error('Connection timeout'));
          }
        }, 30000);

        const handler = (message: InternalServiceResponse) => {
          debugLog('Login', 'Response received:', message);
          debugLog('Login', 'Expected requestId:', requestId);

          // Check if the message is wrapped in a Response object
          const response = (message as Record<string, unknown>).Response
            ? ((message as Record<string, unknown>).Response as InternalServiceResponse)
            : message;

          // Check if this response matches our request ID
          if (isResponseType(response, 'ConnectSuccess') && response.ConnectSuccess.request_id === requestId) {
            responseReceived = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            resolve(response.ConnectSuccess.cid);
          } else if (isResponseType(response, 'SessionAlreadyActive') && response.SessionAlreadyActive.request_id === requestId) {
            // Session is already active - redirect to workspace seamlessly
            responseReceived = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);

            const { cid, username: sessionUsername, message } = response.SessionAlreadyActive;
            debugLog('Login', `SessionAlreadyActive - ${message}`);

            // Redirect to the existing session
            runAsyncSetup(async () => {
              try {
                await redirectToExistingSession({
                  cid: cid as bigint,
                  username: sessionUsername || username.trim(),
                  server_address: serverAddress
                });
              } finally {
                setLoading(false);
              }
            });
            return; // Don't resolve/reject - redirectToExistingSession handles navigation
          } else if (isResponseType(response, 'ConnectFailure') && response.ConnectFailure.request_id === requestId) {
            responseReceived = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);

            // Check if this is a "Session Already Connected" error (fallback - should be caught by preemptive check)
            const errorMessage = response.ConnectFailure.message || 'Connection failed';
            if (errorMessage.toLowerCase().includes('session already connected') ||
                errorMessage.toLowerCase().includes('already connected')) {
              // This should rarely happen since we check proactively above
              // But keep as fallback in case session becomes active between our check and connect call
              debugLog('Login', 'Session already connected (fallback path), redirecting seamlessly');

              // If we have a valid cid from the error (not "0"), redirect to that session
              // Otherwise, look up the session by username from active sessions
              const errorCid = response.ConnectFailure.cid;
              if (errorCid && errorCid !== 0n && errorCid !== BigInt(0)) {
                // Redirect to the existing session seamlessly
                runAsyncSetup(async () => {
                  try {
                    await redirectToExistingSession({
                      cid: errorCid as bigint,
                      username: username.trim(),
                      server_address: serverAddress
                    });
                  } finally {
                    setLoading(false);
                  }
                });
                return;
              } else {
                // CID is 0 or missing - look up session by username
                runAsyncSetup(async () => {
                  try {
                    const sessions = await connectionManager.getActiveSessions();
                    const matchingSession = sessions.find(s => s.username === username.trim());
                    if (matchingSession && matchingSession.cid !== undefined) {
                      try {
                        await redirectToExistingSession({
                          cid: matchingSession.cid,
                          username: matchingSession.username ?? username.trim(),
                          server_address: matchingSession.server_address
                        });
                      } finally {
                        setLoading(false);
                      }
                    } else {
                      // No matching session found, reject with original error
                      setLoading(false);
                      reject(new Error(errorMessage));
                    }
                  } catch {
                    setLoading(false);
                    reject(new Error(errorMessage));
                  }
                });
                return;
              }
            }

            reject(new Error(errorMessage));
          }
        };

        // Listen for WebSocket messages
        eventEmitter.on('websocket-message', handler);
      });
      
      // Connect to the service AFTER setting up the listener
      // Note: websocketService.connect() handles session cleanup internally if needed
      // Server address is NOT needed - the Citadel protocol stores it from registration
      await websocketService.connect(requestId, username, password, undefined);

      // Wait for the response
      const cid = await responsePromise;

      // If we get here, the connection was successful
      // Store the session for auto-reconnect
      // Use default security settings for session storage (actual settings were set during registration)
      await connectionManager.handleAuthSuccess({
        username,
        password,
        fullName: username, // Use username as display name for login
        serverAddress,
        serverPassword: "", // No server password for login flow
        securitySettings: getDefaultSecuritySettings(),
        cid
      });

      // Set up workspace context and loading
      // Update tab context to track which workspace this tab is viewing
      await setSelectedUser({
        selectedUsername: username.trim(),
        selectedServerAddress: serverAddress,
        selectedCid: cid
      });

      // Set the connection ID in WorkspaceService
      WorkspaceService.setConnectionId(cid);

      // Trigger workspace loading
      await WorkspaceService.loadWorkspace();
      await WorkspaceService.listNodes();

      // Start WASM connection manager for this CID (handles leader/follower transitions)
      try {
        await wasmConnectionManager.start(cid.toString());
        debugLog('Login', 'WASM connection manager started for CID:', cid.toString());
      } catch (error) {
        debugLog('Login', 'Failed to start WASM connection manager:', error);
        // Don't block login - P2P messaging may not be immediately needed
      }

      // CRITICAL: Emit session:activated to trigger P2P re-establishment
      // After login (especially after explicit disconnect), we need to:
      // 1. Start p2pRegistrationService to discover registered peers
      // 2. Call connectToAllRegisteredPeers() to establish P2P channels
      // Without this, ILM message delivery will fail because P2P channels aren't established.
      eventEmitter.emit('session:activated', {
        cid: cid.toString(),
        username: username.trim(),
        serverAddress: serverAddress,
        activationType: 'login',
      });
      debugLog('Login', 'Emitted session:activated for login');

      onNext(cid.toString());
      
      toast({
        title: "Login successful",
        description: "Connected to workspace successfully",
      });
    } catch (err: unknown) {
      const errArg = err instanceof Error ? err : String(err);
      const userFriendlyMessage = getUserFriendlyErrorMessage(errArg);
      setError(userFriendlyMessage);
      toast({
        variant: "destructive",
        title: getErrorTitle(errArg),
        description: userFriendlyMessage,
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Handle opening the security settings modal
  const handleOpenSecuritySettings = () => {
    setShowSecuritySettings(true);
  };
  
  // Handle when user completes security settings configuration
  const handleSecuritySettingsNext = () => {
    setShowSecuritySettings(false);
  };
  
  // Handle when user cancels security settings configuration
  const handleSecuritySettingsBack = () => {
    setShowSecuritySettings(false);
  };

  // Handle completed security settings
  const handleSecuritySettingsComplete = (values: SecuritySettingsValues) => {
    setSecuritySettings({
      securityLevel: values.securityLevel, 
      secrecyMode: values.secrecyMode, 
      encryptionAlgorithm: values.encryptionAlgorithm,
      kemAlgorithm: values.kemAlgorithm,
      sigAlgorithm: values.sigAlgorithm,
      headerObfuscatorSettings: values.headerObfuscatorSettings,
      storeCredentials: values.storeCredentials ?? false,
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4">
      {showSecuritySettings ? (
        <SecuritySettings 
          onNext={handleSecuritySettingsNext}
          onBack={handleSecuritySettingsBack}
          onComplete={handleSecuritySettingsComplete}
          initialValues={{
            securityLevel: securitySettings.securityLevel, 
            secrecyMode: securitySettings.secrecyMode, 
            encryptionAlgorithm: securitySettings.encryptionAlgorithm, 
            kemAlgorithm: securitySettings.kemAlgorithm, 
            sigAlgorithm: securitySettings.sigAlgorithm, 
            headerObfuscatorSettings: securitySettings.headerObfuscatorSettings,
            storeCredentials: securitySettings.storeCredentials,
          }}
          isFromLogin={true}
        />
      ) : (
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg w-full max-w-md">
          <CardHeader>
            <div className="flex items-center">
              <Button
                onClick={onCancel}
                variant="ghost"
                size="icon"
                className="h-8 w-8 mr-2 text-gray-300 hover:text-white hover:bg-purple-500/20"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle className="text-white text-xl">Login to Workspace</CardTitle>
                <CardDescription className="text-gray-300">
                  Enter your credentials to connect to a workspace
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-scroll">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                />
              </div>
              
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full justify-start p-0 text-purple-400 hover:text-purple-300 hover:bg-transparent"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Advanced Options
              </Button>
              
              {isAdvancedOpen && (
                <div className="space-y-4 p-3 bg-[#343650] rounded-md overflow-y-auto max-h-96">
                  <div className="space-y-2">
                    <Label htmlFor="server" className="text-gray-300">Server Address</Label>
                    <Input
                      id="server"
                      placeholder="127.0.0.1:12349"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="quick-security" className="text-gray-300 cursor-pointer">
                      Configure Security Settings
                    </Label>
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
                      onClick={handleOpenSecuritySettings}
                    >
                      Configure
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="remember" className="text-gray-300 cursor-pointer">
                      Remember Credentials
                    </Label>
                    <Switch 
                      id="remember" 
                      checked={securitySettings.storeCredentials}
                      onCheckedChange={(checked) => setSecuritySettings({
                        ...securitySettings, 
                        storeCredentials: checked
                      })}
                    />
                  </div>
                </div>
              )}
              
              {error && (
                <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded border border-red-400/20">
                  {error}
                </div>
              )}
            </CardContent>
            
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
