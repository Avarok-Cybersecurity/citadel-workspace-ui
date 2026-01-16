import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { websocketService } from "@/lib/websocket-service";
import { eventEmitter } from "@/lib/event-emitter";
import WorkspaceService from "@/lib/workspace-service";
import { connectionManager } from "@/lib/connection-manager";
import { mapSecuritySettings } from "@/lib/security-utils";
import type { SecuritySettingsValues } from "./SecuritySettings";

interface CreateWorkspaceProps {
  onCancel: () => void;
  onSuccess: (cid: string) => void;
  securitySettings: SecuritySettingsValues;
  serverAddress: string;
  serverPassword: string;
}

export const CreateWorkspace = ({ 
  onCancel, 
  onSuccess, 
  securitySettings,
  serverAddress,
  serverPassword
}: CreateWorkspaceProps) => {
  const [step, setStep] = useState<'admin' | 'workspace'>('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Admin user form data
  const [adminData, setAdminData] = useState({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: ""
  });
  
  // Workspace form data
  const [workspaceData, setWorkspaceData] = useState({
    name: "",
    description: "",
    masterPassword: "",
    confirmMasterPassword: ""
  });
  
  const [adminCid, setAdminCid] = useState<string | null>(null);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!adminData.fullName || !adminData.username || !adminData.password) {
      setError("Please fill in all fields");
      return;
    }
    
    if (adminData.password !== adminData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Generate request ID first to avoid race condition
      const requestId = crypto.randomUUID();
      
      // Set up event listener for registration response
      const registrationPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventEmitter.off('websocket-message', handleMessage);
          reject(new Error('Registration timed out'));
        }, 30000);

        const handleMessage = (message: any) => {
          console.log('CreateWorkspace: Received message:', message);
          console.log('Expected requestId:', requestId);
          
          const response = message.Response || message;
          
          if ('RegisterSuccess' in response && response.RegisterSuccess.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            const cid = response.RegisterSuccess.cid?.toString();
            if (cid) {
              resolve(cid);
            } else {
              reject(new Error('No CID in registration response'));
            }
          } else if ('RegisterFailure' in response && response.RegisterFailure.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            reject(new Error(response.RegisterFailure.message || 'Registration failed'));
          }
        };

        eventEmitter.on('websocket-message', handleMessage);
      });

      console.log('CreateWorkspace: Calling websocketService.register');
      // TODO: DNS resolution on the serverAddress to allow domain name inputs
      
      // Start registration with our pre-generated request ID
      void websocketService.register(
        requestId,
        adminData.username,
        adminData.password,
        adminData.fullName,
        serverAddress,
        serverPassword || "",
        {
          securityLevel: securitySettings.securityLevel,
          secrecyMode: securitySettings.secrecyMode,
          encryptionAlgorithm: securitySettings.encryptionAlgorithm,
          kemAlgorithm: securitySettings.kemAlgorithm,
          sigAlgorithm: securitySettings.sigAlgorithm,
          headerObfuscatorSettings: securitySettings.headerObfuscatorSettings
        }
      );
      
      console.log('CreateWorkspace: Waiting for registration response...');
      const cid = await registrationPromise;
      console.log('CreateWorkspace: Got CID:', cid);
      
      setAdminCid(cid);

      // Store the session for persistence using shared mapping helper (DRY)
      void connectionManager.handleAuthSuccess(
        adminData.username,
        adminData.password,
        adminData.fullName,
        serverAddress,
        serverPassword,
        mapSecuritySettings(securitySettings),
        BigInt(cid),
      );
      
      toast({
        title: "Admin account created",
        description: "Now let's set up your workspace",
      });
      
      setStep('workspace');
    } catch (err: any) {
      setError(err.message || "Failed to create admin account");
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceData.name || !workspaceData.description || !workspaceData.masterPassword) {
      setError("Please fill in all fields");
      return;
    }
    
    if (workspaceData.masterPassword !== workspaceData.confirmMasterPassword) {
      setError("Master passwords do not match");
      return;
    }
    
    if (!adminCid) {
      setError("Admin connection lost");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      WorkspaceService.setConnectionId(BigInt(adminCid));
      
      console.log('CreateWorkspace: Setting up workspace with CID:', adminCid);
      
      // Set up listener for workspace update response
      const workspaceUpdated = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Workspace setup timed out'));
        }, 10000);
        
        const handler = (data: any) => {
          console.log('CreateWorkspace: workspace:updated event received', data);
          clearTimeout(timeout);
          eventEmitter.off('workspace:updated', handler);
          resolve();
        };
        
        eventEmitter.on('workspace:updated', handler);
      });
      
      // Create metadata with initialized flag
      const metadata = {
        initialized: true
      };
      const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
      
      // Update the workspace to mark it as initialized
      await WorkspaceService.updateWorkspace(
        workspaceData.name,
        workspaceData.description,
        workspaceData.masterPassword,
        metadataBytes
      );
      
      console.log('CreateWorkspace: Waiting for workspace setup response...');
      
      try {
        await workspaceUpdated;
        console.log('CreateWorkspace: Workspace setup completed successfully');
        
        toast({
          title: "Workspace setup complete!",
          description: "Your workspace has been successfully initialized",
        });
        
        onSuccess(adminCid);
      } catch (error) {
        console.error('CreateWorkspace: Workspace setup failed:', error);
        throw error;
      }
    } catch (err: any) {
      setError(err.message || "Failed to setup workspace");
      toast({
        variant: "destructive",
        title: "Workspace setup failed",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4">
      <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg w-full max-w-md">
        {step === 'admin' ? (
          <>
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
                  <CardTitle className="text-white text-xl">Create Admin Account</CardTitle>
                  <CardDescription className="text-gray-300">
                    First, create your administrator account
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <form onSubmit={handleAdminSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-gray-300">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="John Doe"
                    value={adminData.fullName}
                    onChange={(e) => setAdminData(prev => ({ ...prev, fullName: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-gray-300">Username</Label>
                  <Input
                    id="username"
                    placeholder="admin"
                    value={adminData.username}
                    onChange={(e) => setAdminData(prev => ({ ...prev, username: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={adminData.password}
                    onChange={(e) => setAdminData(prev => ({ ...prev, password: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={adminData.confirmPassword}
                    onChange={(e) => setAdminData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                </div>
                
                {error && (
                  <div className="text-red-400 text-sm">{error}</div>
                )}
              </CardContent>
              
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Next"}
                </Button>
              </CardFooter>
            </form>
          </>
        ) : (
          <>
            <CardHeader>
              <div className="flex items-center">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-500" />
                  <div>
                    <CardTitle className="text-white text-xl">Initialize Workspace</CardTitle>
                    <CardDescription className="text-gray-300">
                      Set up your workspace configuration
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <form onSubmit={handleWorkspaceSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="workspaceName" className="text-gray-300">Workspace Name</Label>
                  <Input
                    id="workspaceName"
                    placeholder="My Secure Workspace"
                    value={workspaceData.name}
                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-gray-300">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your workspace..."
                    value={workspaceData.description}
                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, description: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="masterPassword" className="text-gray-300">Master Password</Label>
                  <Input
                    id="masterPassword"
                    type="password"
                    value={workspaceData.masterPassword}
                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, masterPassword: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                  <p className="text-xs text-gray-400">
                    This password will be required for admin operations
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmMasterPassword" className="text-gray-300">Confirm Master Password</Label>
                  <Input
                    id="confirmMasterPassword"
                    type="password"
                    value={workspaceData.confirmMasterPassword}
                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, confirmMasterPassword: e.target.value }))}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                  />
                </div>
                
                {error && (
                  <div className="text-red-400 text-sm">{error}</div>
                )}
              </CardContent>
              
              <CardFooter className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('admin')}
                  className="flex-1"
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={loading}
                >
                  {loading ? "Setting up..." : "Setup Workspace"}
                </Button>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
};