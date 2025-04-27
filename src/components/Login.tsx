import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useToast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { 
  ConnectRequestTS, 
  ConnectSuccessTS, 
  ConnectFailureTS, 
  SessionSecuritySettingsTS, 
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
  securityLevel: SecurityLevel | string;
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
    securityLevel: SecurityLevel.Standard, 
    secrecyMode: SecrecyMode.BestEffort,   
    encryptionAlgorithm: EncryptionAlgorithm.AES_GCM_256, 
    kemAlgorithm: KemAlgorithm.Kyber,       
    sigAlgorithm: SigAlgorithm.None,        
    headerObfuscatorSettings: {},
    storeCredentials: false
  });
  
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Create sessionSettings directly from state (now uses string enums)
      const sessionSettings: SessionSecuritySettingsTS = {
        securityLevel: securitySettings.securityLevel,
        secrecyMode: securitySettings.secrecyMode,
        encryptionAlgorithm: securitySettings.encryptionAlgorithm,
        kemAlgorithm: securitySettings.kemAlgorithm,
        sigAlgorithm: securitySettings.sigAlgorithm,
        headerObfuscatorSettings: securitySettings.headerObfuscatorSettings
      };
      
      // Prepare the request object with camelCase keys (matching TS interface)
      const connectRequest: ConnectRequestTS = {
        username: username,
        password: stringToUint8Array(password), 
        connectMode: ConnectMode.Standard,
        udpMode: UdpMode.Enabled,
        keepAliveTimeoutMs: 60000,
        sessionSecuritySettings: sessionSettings,
        serverPassword: undefined
      };
      
      // Call the connect command, mapping keys to snake_case for Rust backend
      const result = await invoke<ConnectSuccessTS>('connect', {
          request: {
              username: connectRequest.username,
              password: connectRequest.password,
              connect_mode: connectRequest.connectMode,         
              udp_mode: connectRequest.udpMode,             
              keep_alive_timeout_ms: connectRequest.keepAliveTimeoutMs, 
              session_security_settings: {                  
                security_level: sessionSettings.securityLevel,
                secrecy_mode: sessionSettings.secrecyMode,
                encryption_algorithm: sessionSettings.encryptionAlgorithm,
                kem_algorithm: sessionSettings.kemAlgorithm,
                sig_algorithm: sessionSettings.sigAlgorithm,
                header_obfuscator_settings: sessionSettings.headerObfuscatorSettings
              },
              server_password: connectRequest.serverPassword      
          }
      });
      
      // If we get here, the connection was successful (or we would have caught an error)
      onNext(result.cid);
      
      toast({
        title: "Login successful",
        description: "Connected to workspace successfully",
      });
    } catch (err: any) {
      // The error is likely a ConnectFailureTS object
      const errorMessage = err.message || "Failed to connect to workspace";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: errorMessage,
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
      secrecyMode: values.secrecyMode as SecrecyMode, 
      encryptionAlgorithm: values.encryptionAlgorithm as EncryptionAlgorithm,
      kemAlgorithm: values.kemAlgorithm as KemAlgorithm,
      sigAlgorithm: values.sigAlgorithm as SigAlgorithm,
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
                {loading ? "Connecting..." : "Connect"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
