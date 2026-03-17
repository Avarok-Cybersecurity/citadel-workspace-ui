import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Server, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { listKnownServers, StoredServer } from "@/lib/server-utils";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

export const Connect = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [servers, setServers] = useState<StoredServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  // Memoize the fetchServers function to prevent it from being recreated on each render
  const fetchServers = useCallback(async () => {
    try {
      // Using "1" as a valid u64 string representation for the connect page
      const response = await listKnownServers({ cid: "1" });
      setServers(response.servers);
      if (response.servers.length > 0) {
        setSelectedServer(response.servers[0].serverAddress);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog('Connect', 'Error fetching known servers:', error);
      debugLog('Connect', 'Error details:', errorMessage);
      toast({
        title: "Error",
        description: "Failed to load saved workspaces",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Run the effect only once when the component mounts
  useEffect(() => {
    runAsyncSetup(fetchServers);
  }, [fetchServers]);

  const handleConnect = async () => {
    if (!selectedServer) {
      toast({
        title: "No Server Selected",
        description: "Please select a server to connect to",
        variant: "destructive",
      });
      return;
    }

    const selectedServerInfo = servers.find(s => s.serverAddress === selectedServer);
    if (!selectedServerInfo) return;

    try {
      toast({
        title: "Connecting",
        description: `Connecting to ${selectedServer}...`,
      });

      navigate(getWorkspacePath());
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog('Connect', 'Error connecting to server:', error);
      debugLog('Connect', 'Connection error details:', errorMessage);
      toast({
        title: "Connection Failed",
        description: `Failed to connect to ${selectedServer}: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1C1D28]">
      <Card className="w-full max-w-xl bg-[#282A42] border-[#3D3F5A] shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-white" />
            <CardTitle className="text-white text-2xl">Connect to Workspace</CardTitle>
          </div>
          <CardDescription className="text-gray-300">Select a saved workspace to connect</CardDescription>
        </CardHeader>

        {loading ? (
          <CardContent className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
            <p className="text-white mt-4">Loading saved workspaces...</p>
          </CardContent>
        ) : servers.length === 0 ? (
          <CardContent className="text-center py-8">
            <p className="text-white mb-4">No saved workspaces found</p>
            <Button
              onClick={() => navigate("/")}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Go Back
            </Button>
          </CardContent>
        ) : (
          <>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Select Workspace
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {servers.map((server) => (
                  <div
                    key={server.serverAddress}
                    className={`flex items-center p-3 rounded-md cursor-pointer transition-colors ${selectedServer === server.serverAddress
                      ? "bg-purple-700/50 border border-purple-500"
                      : "bg-[#221F26]/70 hover:bg-[#221F26] border border-purple-400/20"
                      }`}
                    onClick={() => setSelectedServer(server.serverAddress)}
                  >
                    <Server className="w-5 h-5 text-purple-300 mr-3" />
                    <div>
                      <p className="text-white font-medium">{server.serverAddress}</p>
                      {server.serverName && (
                        <p className="text-gray-300 text-sm">{server.serverName}</p>
                      )}
                    </div>
                    {selectedServer === server.serverAddress && (
                      <ArrowRight className="w-5 h-5 text-purple-300 ml-auto" />
                    )}
                  </div>
                ))}
              </div>
            </div>

          </CardContent>
          <CardFooter className="flex justify-end gap-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/")}
                className="text-white hover:bg-purple-500/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConnect}
                className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                Connect
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
};

export default Connect;
