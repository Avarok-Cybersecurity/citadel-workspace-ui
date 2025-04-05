import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from 'react';

interface ServerConnectProps {
  onNext: () => void;
  onCancel?: () => void;
}

export const ServerConnect = ({ onNext, onCancel }: ServerConnectProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Get existing data from cache
  const cachedData = queryClient.getQueryData(['serverConnectForm']) as { serverAddress: string; password: string } | undefined;

  const [serverAddress, setServerAddress] = useState(cachedData?.serverAddress || '');
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
    console.log('Saved server data to cache:', { serverAddress, password });
    
    onNext();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="w-full max-w-xl p-8 space-y-6 bg-[#4F5889]/95 backdrop-blur-sm border border-purple-500/20 shadow-lg rounded-lg">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-white" />
          <h1 className="text-2xl font-bold text-white">ADD A NEW WORKSPACE</h1>
        </div>

        <form onSubmit={handleConnect} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-200 uppercase">
            Workspace Location
          </label>
          <div className="relative">
            <Input
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              className="bg-[#221F26]/70 border-purple-400/20 text-white pr-12"
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
          <label className="text-sm font-medium text-gray-200 uppercase">
            Workspace Password (Optional)
          </label>
          <div className="relative">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#221F26]/70 border-purple-400/20 text-white pr-12"
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

        <div className="flex justify-end gap-4 mt-8">
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
        </div>
        </form>
      </div>
    </div>
  );
};
