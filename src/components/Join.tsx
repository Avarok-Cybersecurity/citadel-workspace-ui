import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceConfig } from "@/types/workspace";
import { invoke } from "@tauri-apps/api/core";

interface JoinProps {
  onNext: () => void;
  onBack: () => void;
}

export const Join = ({ onNext, onBack }: JoinProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isRegistering, setIsRegistering] = useState(false);
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

  const securitySettings = queryClient.getQueryData(['securitySettings']) as {
    securityLevel: string;
    securityMode: string;
    encryptionAlgorithm: string;
    kemAlgorithm: string;
    signingAlgorithm: string;
    headerObfuscatorMode: string;
    psk: string;
  } || {
    securityLevel: 'standard',
    securityMode: 'enhanced',
    encryptionAlgorithm: 'aes',
    kemAlgorithm: 'kyber',
    signingAlgorithm: 'falcon',
    headerObfuscatorMode: 'off',
    psk: '',
  };

  console.log('Retrieved server data:', serverData);
  console.log('Retrieved security settings:', securitySettings);

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

    // Create workspace configuration
    const workspaceConfig: WorkspaceConfig = {
      // Connection details
      serverAddress: serverData.serverAddress,
      password: serverData.password,
      
      // Security settings
      securityLevel: securitySettings.securityLevel,
      securityMode: securitySettings.securityMode,
      
      // Advanced settings
      encryptionAlgorithm: securitySettings.encryptionAlgorithm,
      kemAlgorithm: securitySettings.kemAlgorithm,
      signingAlgorithm: securitySettings.signingAlgorithm,
      headerObfuscatorMode: securitySettings.headerObfuscatorMode,
      psk: securitySettings.psk,
      
      // Profile details
      fullName: formData.fullName,
      username: formData.username,
      profilePassword: formData.password,
    };

    console.log('Final workspace configuration:', workspaceConfig);
    
    // Map security levels and modes to numeric values for the Rust backend
    const securityLevelMap: Record<string, number> = {
      'standard': 0,
      'enhanced': 1,
      'maximum': 2
    };
    
    const securityModeMap: Record<string, number> = {
      'standard': 0,
      'enhanced': 1,
      'maximum': 2
    };
    
    const encryptionAlgorithmMap: Record<string, number> = {
      'aes': 0,
      'chacha20': 1
    };
    
    const kemAlgorithmMap: Record<string, number> = {
      'kyber': 0,
      'classic': 1
    };
    
    const sigAlgorithmMap: Record<string, number> = {
      'falcon': 0,
      'classic': 1
    };
    
    try {
      setIsRegistering(true);
      
      // Prepare the registration request for the Rust backend
      const registrationRequest = {
        workspaceIdentifier: workspaceConfig.serverAddress,
        workspacePassword: workspaceConfig.password || "",
        securityLevel: securityLevelMap[workspaceConfig.securityLevel] || 0,
        securityMode: securityModeMap[workspaceConfig.securityMode] || 0,
        encryptionAlgorithm: encryptionAlgorithmMap[workspaceConfig.encryptionAlgorithm] || 0,
        kemAlgorithm: kemAlgorithmMap[workspaceConfig.kemAlgorithm] || 0,
        sigAlgorithm: sigAlgorithmMap[workspaceConfig.signingAlgorithm] || 0,
        fullName: workspaceConfig.fullName,
        username: workspaceConfig.username,
        profilePassword: workspaceConfig.profilePassword
      };
      
      console.log("Sending registration request:", JSON.stringify(registrationRequest, null, 2));
      console.log("Registration request data:", registrationRequest);
      
      // Call the Rust backend to register
      const response = await invoke<{ message: string, success: boolean }>("register", {
        request: registrationRequest
      });
      
      if (response.success) {
        toast({
          title: "Registration Successful",
          description: response.message,
        });
        onNext();
      } else {
        toast({
          title: "Registration Failed",
          description: response.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Registration error:", error);
      
      // Extract error message from Tauri error object
      const errorMessage = error.message || error.toString() || "Unknown error occurred";
      
      toast({
        title: "Registration Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="w-full max-w-xl p-8 space-y-6 bg-[#4F5889]/95 backdrop-blur-sm border border-purple-500/20 shadow-lg rounded-lg">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-white" />
          <h1 className="text-2xl font-bold text-white">ADD A NEW WORKSPACE</h1>
        </div>

        <div className="space-y-8">
          <h2 className="text-xl font-semibold text-white">SERVER PROFILE</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Full Name Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Full Name
              </label>
              <div className="relative">
                <Input
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="bg-[#221F26]/70 border-purple-400/20 text-white pr-12"
                  placeholder="John Doe"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                      <p>Enter your full name as it will appear in the workspace</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Username Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Username
              </label>
              <div className="relative">
                <Input
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className="bg-[#221F26]/70 border-purple-400/20 text-white pr-12"
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

            {/* Password Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Profile Password
              </label>
              <div className="relative">
                <Input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="bg-[#221F26]/70 border-purple-400/20 text-white pr-12"
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

            {/* Confirm Password Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Confirm Profile Password
              </label>
              <div className="relative">
                <Input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="bg-[#221F26]/70 border-purple-400/20 text-white pr-12"
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

            <div className="flex justify-end gap-4 mt-8">
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
                    <span className="mr-2">REGISTERING...</span>
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                  </>
                ) : "JOIN"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
