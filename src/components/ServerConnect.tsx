import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface ServerConnectProps {
  onNext: (address: string, password: string) => void;
  onCancel?: () => void;
  defaultServer?: string;
  title?: string;
  initialAddress?: string;
  initialPassword?: string;
}

export const ServerConnect = ({ onNext, onCancel, defaultServer, title, initialAddress, initialPassword }: ServerConnectProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [serverAddress, setServerAddress] = useState(defaultServer || initialAddress || '');
  const [password, setPassword] = useState(initialPassword || '');

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCancel) onCancel();
        else navigate('/');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, navigate]);

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

    // Basic server address validation — must look like a hostname or IP
    const trimmed = serverAddress.trim();
    if (!trimmed.includes('.') && !trimmed.includes(':')) {
      toast({
        title: "Invalid server address",
        description: "Please enter a valid server address (e.g., workspace.avarok.net or 127.0.0.1:8080)",
        variant: "destructive",
      });
      return;
    }

    onNext(serverAddress, password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg">
          <CardHeader>
            <CardTitle className="text-white text-xl">{title || "Join Workspace"}</CardTitle>
            <CardDescription className="text-gray-300">
              {defaultServer ? "Connect with a different account" : "Enter workspace details to get started"}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-1">
                <div className="w-8 h-1 rounded-full bg-purple-500" />
                <div className="w-8 h-1 rounded-full bg-gray-600" />
                <div className="w-8 h-1 rounded-full bg-gray-600" />
              </div>
              <span className="text-xs text-gray-400">Step 1 of 3</span>
            </div>
          </CardHeader>

          <form onSubmit={handleConnect}>
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                      <p>Enter your workspace server address</p>
                    </TooltipContent>
                  </Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                      <p>Optional: Enter the workspace password if required</p>
                    </TooltipContent>
                  </Tooltip>
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
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                Next
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};
