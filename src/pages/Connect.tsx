import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Server, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { listKnownServers, getRecentServers, StoredServer } from "@/lib/server-utils";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { connectionManager } from "@/lib/connection";
import { websocketService } from "@/lib/websocket-service";
import { postAuthSetup } from "@/lib/post-auth-setup";
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { activateOnKey } from '@/lib/a11y';

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

      // Fall back to the servers we already have on disk.
      //
      // saveRecentServer writes this list on every successful connect,
      // documented as being "for offline/fallback access" so this page always
      // has data — but nothing ever read it. The one moment it exists for is
      // this one, and until now a user whose protocol call failed was told
      // "Failed to load saved workspaces" while their servers sat in
      // localStorage untouched.
      const cached = getRecentServers();
      if (cached.length > 0) {
        setServers(cached);
        setSelectedServer(cached[0].serverAddress);
        toast({
          // Said plainly: this list is from a previous session, so an address
          // that has since changed will not be reflected here.
          title: "Showing saved workspaces",
          description: "Could not reach the service, so these are from your last session.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to load saved workspaces",
          variant: "destructive",
        });
      }
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
      setLoading(true);
      toast({
        title: "Connecting",
        description: `Connecting to ${selectedServer}...`,
      });

      // Actually establish a connection by claiming any existing session for this server
      const storedSessions = connectionManager.getStoredSessions();
      const session = storedSessions.sessions.find(
        (s) => s.serverAddress === selectedServer
      );

      if (session?.cid) {
        // Try to claim the stored session
        try {
          await websocketService.claimSession(session.cid, true);
        } catch (claimError: unknown) {
          if (claimError instanceof Error && !claimError.message?.includes('not orphaned')) {
            throw claimError;
          }
        }

        await postAuthSetup(session.cid);
      }

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-xl bg-card border-surface shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-foreground" />
            <CardTitle className="text-foreground text-2xl">Connect to Workspace</CardTitle>
          </div>
          <CardDescription className="text-foreground/80">Select a saved workspace to connect</CardDescription>
        </CardHeader>

        {loading ? (
          <CardContent className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
            <p className="text-foreground mt-4">Loading saved workspaces...</p>
          </CardContent>
        ) : servers.length === 0 ? (
          <CardContent className="text-center py-8">
            <p className="text-foreground mb-4">No saved workspaces found</p>
            <Button
              onClick={() => navigate("/")}
              className="bg-purple-600 hover:bg-purple-700 text-foreground"
            >
              Go Back
            </Button>
          </CardContent>
        ) : (
          <>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {/* A group label, not a field label: it names a list of choices
                  rather than one control, so <label> was the wrong element —
                  it had nothing to be `for`. The list is a radiogroup labelled
                  by this heading. */}
              <h2 id="workspace-choice-label" className="text-sm font-medium text-foreground uppercase">
                Select Workspace
              </h2>
              <div
                role="radiogroup"
                aria-labelledby="workspace-choice-label"
                className="space-y-2 max-h-60 overflow-y-auto pr-2"
              >
                {servers.map((server) => (
                  <div
                    key={server.serverAddress}
                    className={`flex items-center p-3 rounded-md cursor-pointer transition-colors ${selectedServer === server.serverAddress
                      ? "bg-purple-700/50 border border-purple-500"
                      : "bg-card/70 hover:bg-card border border-purple-400/20"
                      }`}
                    onClick={() => setSelectedServer(server.serverAddress)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={activateOnKey(() => { (() => setSelectedServer(server.serverAddress))(); })}
                  >
                    <Server className="w-5 h-5 text-purple-300 mr-3" />
                    <div>
                      <p className="text-foreground font-medium">{server.serverAddress}</p>
                      {server.serverName && (
                        <p className="text-foreground/80 text-sm">{server.serverName}</p>
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
                className="text-foreground hover:bg-purple-500/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConnect}
                className="bg-purple-600 hover:bg-purple-700 text-foreground transition-colors"
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
