import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Settings, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useToast } from "@/components/ui/use-toast";
import { websocketService } from "@/lib/websocket-service";
import { connectionManager } from "@/lib/connection-manager";
import { eventEmitter } from "@/lib/event-emitter";
import { useEffect } from "react";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import WorkspaceService from "@/lib/workspace-service";
import { setSelectedUser } from "@/lib/tab-context";
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
  const [server, setServer] = useState("127.0.0.1:12349");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  
  // Default security settings that can be overridden by SecuritySettings component
  const [securitySettings, setSecuritySettings] = useState<SecuritySettingsState>({
    securityLevel: 'Standard', 
    secrecyMode: 'BestEffort',   
    encryptionAlgorithm: 'AES_GCM_256', 
    kemAlgorithm: 'Kyber',       
    sigAlgorithm: 'None',        
    headerObfuscatorSettings: {},
    storeCredentials: false
  });
  
  const { toast } = useToast();

  // WebSocket service is initialized by ConnectionManager in WorkspaceApp

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
        console.log('Login: Username already has active session:', existingSession);
        // Emit event for existing session - this allows the user to claim/disconnect it
        eventEmitter.emit('session-already-connected', {
          cid: existingSession.cid,
          message: `Session already exists for ${username}`
        });
        setLoading(false);
        return;
      }

      // Generate request ID first to avoid race condition
      const requestId = crypto.randomUUID();
      
      // Set up event listener to capture connection response BEFORE sending request
      let responseReceived = false;
      const responsePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!responseReceived) {
            eventEmitter.off('websocket-message', handler);
            reject(new Error('Connection timeout'));
          }
        }, 30000);

        const handler = (message: any) => {
          console.log('Login response received:', message);
          console.log('Expected requestId:', requestId);
          
          // Check if the message is wrapped in a Response object
          const response = message.Response || message;
          
          // Check if this response matches our request ID
          if ('ConnectSuccess' in response && response.ConnectSuccess.request_id === requestId) {
            responseReceived = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);
            resolve(response.ConnectSuccess.cid);
          } else if ('ConnectFailure' in response && response.ConnectFailure.request_id === requestId) {
            responseReceived = true;
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handler);

            // Check if this is a "Session Already Connected" error (fallback - should be caught by preemptive check)
            const errorMessage = response.ConnectFailure.message || 'Connection failed';
            if (errorMessage.toLowerCase().includes('session already connected') ||
                errorMessage.toLowerCase().includes('already connected')) {
              // This should rarely happen since we check proactively above
              // But keep as fallback in case session becomes active between our check and connect call
              console.warn('Login: Session already connected error from backend (fallback path)');
              eventEmitter.emit('session-already-connected', {
                cid: response.ConnectFailure.cid,
                message: errorMessage
              });
            }

            reject(new Error(errorMessage));
          }
        };

        // Listen for WebSocket messages
        eventEmitter.on('websocket-message', handler);
      });
      
      // Connect to the service AFTER setting up the listener
      // First disconnect any existing connection
      try {
        await websocketService.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      
      await websocketService.connect(requestId, username, password, server);
      
      // Wait for the response
      const cid = await responsePromise;
      
      // If we get here, the connection was successful
      // Store the session for auto-reconnect
      await connectionManager.handleAuthSuccess(
        username,
        password,
        username, // Use username as display name for login
        server,
        cid.toString()
      );

      // Set up workspace context and loading
      // Update tab context to track which workspace this tab is viewing
      setSelectedUser({
        selectedUsername: username.trim(),
        selectedServerAddress: server,
        selectedCid: cid.toString()
      });

      // Set the connection ID in WorkspaceService
      WorkspaceService.setConnectionId(cid.toString());

      // Trigger workspace loading
      WorkspaceService.loadWorkspace();
      WorkspaceService.listOffices();

      onNext(cid);
      
      toast({
        title: "Login successful",
        description: "Connected to workspace successfully",
      });
    } catch (err: any) {
      const userFriendlyMessage = getUserFriendlyErrorMessage(err);
      setError(userFriendlyMessage);
      toast({
        variant: "destructive",
        title: getErrorTitle(err),
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
      storeCredentials: values.storeCredentials,
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
