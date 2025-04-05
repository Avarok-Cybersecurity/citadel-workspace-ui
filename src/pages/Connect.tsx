import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Server, ArrowRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "@/hooks/use-toast";

interface ServerInfo {
  server_address: string;
  full_name: string;
  username: string;
  security_level: number;
  security_mode: number;
}

export const Connect = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await invoke<{ servers: ServerInfo[] }>("list_known_servers", {
          request: { cid: "connect-page" }
        });
        setServers(response.servers);
        if (response.servers.length > 0) {
          setSelectedServer(response.servers[0].server_address);
        }
      } catch (error: any) {
        console.error("Error fetching known servers:", error);
        const errorMessage = error.message || error.toString() || "Unknown error";
        console.error("Error details:", errorMessage);
        toast({
          title: "Error",
          description: "Failed to load saved workspaces",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, [toast]);

  const handleConnect = async () => {
    if (!selectedServer) {
      toast({
        title: "No Server Selected",
        description: "Please select a server to connect to",
        variant: "destructive",
      });
      return;
    }

    const selectedServerInfo = servers.find(s => s.server_address === selectedServer);
    if (!selectedServerInfo) return;

    try {
      // TODO: Call the appropriate Tauri command to connect to the server
      // This will be implemented once we have the connect command in the backend
      toast({
        title: "Connecting",
        description: `Connecting to ${selectedServer}...`,
      });
      
      // Placeholder for actual connection logic
      // In the future, we'll call a Tauri command like:
      // await invoke("connect_to_server", { 
      //   request: { 
      //     serverAddress: selectedServer,
      //     password: password 
      //   }
      // });
      
      // For now, just navigate to the office page
      navigate("/office");
    } catch (error: any) {
      console.error("Error connecting to server:", error);
      const errorMessage = error.message || error.toString() || "Unknown error";
      console.error("Connection error details:", errorMessage);
      toast({
        title: "Connection Failed",
        description: `Failed to connect to ${selectedServer}: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1C1D28]">
      <div className="w-full max-w-xl p-8 space-y-6 bg-[#4F5889]/95 backdrop-blur-sm border border-purple-500/20 shadow-lg rounded-lg">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-white" />
          <h1 className="text-2xl font-bold text-white">CONNECT TO WORKSPACE</h1>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
            <p className="text-white mt-4">Loading saved workspaces...</p>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white mb-4">No saved workspaces found</p>
            <Button 
              onClick={() => navigate("/")}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Go Back
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Select Workspace
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {servers.map((server) => (
                  <div
                    key={server.server_address}
                    className={`flex items-center p-3 rounded-md cursor-pointer transition-colors ${
                      selectedServer === server.server_address
                        ? "bg-purple-700/50 border border-purple-500"
                        : "bg-[#221F26]/70 hover:bg-[#221F26] border border-purple-400/20"
                    }`}
                    onClick={() => setSelectedServer(server.server_address)}
                  >
                    <Server className="w-5 h-5 text-purple-300 mr-3" />
                    <div>
                      <p className="text-white font-medium">{server.server_address}</p>
                      <p className="text-gray-300 text-sm">{server.username} ({server.full_name})</p>
                    </div>
                    {selectedServer === server.server_address && (
                      <ArrowRight className="w-5 h-5 text-purple-300 ml-auto" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-200 uppercase">
                Profile Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#221F26]/70 border border-purple-400/20 rounded-md p-2 text-white"
                placeholder="Enter your profile password"
              />
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/")}
                className="text-white hover:bg-purple-500/20"
              >
                CANCEL
              </Button>
              <Button
                onClick={handleConnect}
                className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                CONNECT
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Connect;
