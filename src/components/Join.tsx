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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SecuritySettingsValues } from "./SecuritySettings";
import { SecurityLevel, SecrecyMode, EncryptionAlgorithm, KemAlgorithm, SigAlgorithm } from "@/types";

interface JoinProps {
  onNext: (cid: string) => void;
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

  const securitySettings = queryClient.getQueryData<SecuritySettingsValues>(['securitySettings']) || {
    securityLevel: SecurityLevel.Standard,
    secrecyMode: SecrecyMode.BestEffort,
    encryptionAlgorithm: EncryptionAlgorithm.AES_GCM_256,
    kemAlgorithm: KemAlgorithm.Kyber,
    sigAlgorithm: SigAlgorithm.None,
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

      // The Rust handler returns a RegisterSuccessTS on success
      const response = await invoke<{ cid: string, request_id?: string }>("register", registerPayload);

      console.info("Register Response:", response);

      toast({
        title: "Registration Successful",
        description: "Your account has been registered successfully.",
        variant: "default",
      });

      // Optionally store the received CID or other data if needed
      // queryClient.setQueryData(['connectionInfo'], { cid: response.cid });

      // Pass the connection ID to the next step
      if (response && response.cid) {
        console.info(`Calling onNext() with cid: ${response.cid}...`);
        onNext(response.cid);
        console.info("onNext() finished.");
      } else {
        // Handle cases where response or cid might be missing (shouldn't happen on success)
        console.error("Registration successful but cid missing in response:", response);
        toast({
          title: "Registration Issue",
          description: "Registration succeeded but failed to get connection ID. Please try logging in.",
        });
        // Potentially navigate to login or show an error state
      }
    } catch (error: any) {
      console.error("Registration Error:", error); // Add logging

      toast({
        title: "Registration Failed",
        description: error.message || "An unknown error occurred during registration.",
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
              Create your profile for this workspace
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
                    <span className="mr-2">REGISTERING...</span>
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                  </>
                ) : "JOIN"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};
