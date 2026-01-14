import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface ServerConnectProps {
  onNext: () => void;
  onCancel?: () => void;
  defaultServer?: string;
  title?: string;
}

export const ServerConnect = ({ onNext, onCancel, defaultServer, title }: ServerConnectProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Get existing data from cache
  const cachedData = queryClient.getQueryData(['serverConnectForm']) as { serverAddress: string; password: string } | undefined;

  const [serverAddress, setServerAddress] = useState(defaultServer || cachedData?.serverAddress || '');
  const [password, setPassword] = useState(cachedData?.password || '');

  // Update cache when component mounts to ensure it's initialized
  useEffect(() => {
    if (!cachedData) {
      queryClient.setQueryData(['serverConnectForm'], { serverAddress, password });
    }
  }, [queryClient, cachedData, serverAddress, password]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverAddress) {
      toast({
        title: "Server address required",
        description: "Please enter a server address to connect",
        variant: "destructive",
      });
      return;
    }
    
    // Save form data to React Query cache
    queryClient.setQueryData(['serverConnectForm'], { serverAddress, password });
    
    onNext();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg">
          <CardHeader>
            <CardTitle className="text-white text-xl">{title || "Add a New Workspace"}</CardTitle>
            <CardDescription className="text-gray-300">
              {defaultServer ? "Connect with a different account" : "Enter workspace details to get started"}
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleConnect}>
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-scroll">
              <div className="space-y-2">
                <Label htmlFor="serverAddress" className="text-gray-300">
                  Workspace Location
                </Label>
                <div className="relative">
                  <Input
                    id="serverAddress"
                    value={serverAddress}
                    onChange={(e) => setServerAddress(e.target.value)}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
                    placeholder="workspace-name.avarok.net"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                        <p>Enter your workspace server address</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">
                  Workspace Password (Optional)
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
                    placeholder="Enter workspace password"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                        <p>Optional: Enter the workspace password if required</p>
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
                onClick={onCancel || (() => navigate("/"))}
                className="text-white hover:bg-purple-500/20"
              >
                CANCEL
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                NEXT
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};
