import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, UserCheck, RefreshCw, Loader2 } from 'lucide-react';
import { websocketService } from '@/lib/websocket-service';
import { eventEmitter } from '@/lib/event-emitter';
import { ConnectionService } from '@/lib/connection-service';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Peer {
  cid: bigint;
  username: string;
  is_online: boolean;
}

export const PeerTest = () => {
  const [allPeers, setAllPeers] = useState<Peer[]>([]);
  const [registeredPeers, setRegisteredPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentCid, setCurrentCid] = useState<bigint | null>(null);
  const { toast } = useToast();

  // Get current connection CID
  React.useEffect(() => {
    const connectionService = ConnectionService.getInstance();
    connectionService.onConnectionChange((connection) => {
      if (connection?.cid) {
        setCurrentCid(BigInt(connection.cid));
      }
    });
  }, []);

  // List all peers
  const listAllPeers = async () => {
    if (!currentCid) {
      toast({
        title: "Not Connected",
        description: "Please connect to a workspace first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const requestId = crypto.randomUUID();
      const request = {
        ListAllPeers: {
          request_id: requestId,
          cid: currentCid.toString()
        }
      };

      // Listen for response
      const handleResponse = (message: any) => {
        if (message.ListAllPeersResponse && message.ListAllPeersResponse.request_id === requestId) {
          const peerInfo = message.ListAllPeersResponse.peer_information || {};
          const peerList = Object.values(peerInfo) as any[];
          setAllPeers(peerList.map((p: any) => ({
            cid: BigInt(p.cid),
            username: p.username,
            is_online: p.is_online
          })));

          toast({
            title: "Peers Loaded",
            description: `Found ${peerList.length} peers in the workspace`,
            className: "bg-[#343A5C] border-purple-800 text-purple-200",
          });
        }
      };

      // Add listener
      eventEmitter.on('websocket-message', handleResponse);

      // Send request via websocket
      await websocketService.sendMessage(request);

      // Clean up after 5 seconds
      setTimeout(() => {
        eventEmitter.off('websocket-message', handleResponse);
      }, 5000);

    } catch (error) {
      console.error('Failed to list peers:', error);
      toast({
        title: "Error",
        description: "Failed to list peers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // List registered peers
  const listRegisteredPeers = async () => {
    if (!currentCid) {
      toast({
        title: "Not Connected",
        description: "Please connect to a workspace first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const requestId = crypto.randomUUID();
      const request = {
        ListRegisteredPeers: {
          request_id: requestId,
          cid: currentCid.toString()
        }
      };

      // Listen for response
      const handleResponse = (message: any) => {
        if (message.ListRegisteredPeersResponse && message.ListRegisteredPeersResponse.request_id === requestId) {
          const peerInfo = message.ListRegisteredPeersResponse.peer_information || {};
          const peerList = Object.values(peerInfo) as any[];
          setRegisteredPeers(peerList.map((p: any) => ({
            cid: BigInt(p.cid),
            username: p.username,
            is_online: p.is_online
          })));

          toast({
            title: "Registered Peers Loaded",
            description: `Found ${peerList.length} registered peers`,
            className: "bg-[#343A5C] border-purple-800 text-purple-200",
          });
        }
      };

      // Add listener
      eventEmitter.on('websocket-message', handleResponse);

      // Send request via websocket
      await websocketService.sendMessage(request);

      // Clean up after 5 seconds
      setTimeout(() => {
        eventEmitter.off('websocket-message', handleResponse);
      }, 5000);

    } catch (error) {
      console.error('Failed to list registered peers:', error);
      toast({
        title: "Error",
        description: "Failed to list registered peers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Register with a peer
  const registerWithPeer = async (peerCid: bigint) => {
    if (!currentCid) {
      toast({
        title: "Not Connected",
        description: "Please connect to a workspace first",
        variant: "destructive",
      });
      return;
    }

    try {
      const requestId = crypto.randomUUID();
      const request = {
        PeerRegister: {
          request_id: requestId,
          cid: currentCid.toString(),
          peer_cid: peerCid.toString(),
          session_security_settings: {
            security_level: "Standard",
            secrecy_mode: "BestEffort",
            crypto_params: {
              encryption_algorithm: "AES_GCM_256",
              kem_algorithm: "Kyber",
              sig_algorithm: "None"
            },
            header_obfuscator_settings: "Disabled"
          },
          connect_after_register: true,
          peer_session_password: null
        }
      };

      // Send request via websocket
      await websocketService.sendMessage(request);

      toast({
        title: "Registration Request Sent",
        description: "Waiting for peer to accept",
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });

      // Refresh lists after a delay
      setTimeout(() => {
        void listAllPeers();
        void listRegisteredPeers();
      }, 2000);

    } catch (error) {
      console.error('Failed to register with peer:', error);
      toast({
        title: "Error",
        description: "Failed to register with peer",
        variant: "destructive",
      });
    }
  };

  const isRegistered = (peerCid: bigint) => {
    return registeredPeers.some(p => p.cid === peerCid);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Peer Testing</h1>
        <p className="text-gray-400">
          Test peer discovery and registration functionality
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* All Peers */}
        <Card className="bg-[#343A5C] border-gray-700 text-white">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                All Workspace Peers
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={listAllPeers}
                disabled={loading}
                className="text-purple-400 hover:text-purple-300"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </CardTitle>
            <CardDescription className="text-gray-400">
              All peers connected to the same workspace server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {allPeers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No peers found</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={listAllPeers}
                    className="mt-3 border-gray-600 text-gray-300 hover:text-white"
                  >
                    Load Peers
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {allPeers.map((peer) => (
                    <div
                      key={peer.cid.toString()}
                      className="flex items-center justify-between p-3 rounded-lg bg-[#444A6C] hover:bg-[#4F5889] transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
                          {peer.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{peer.username}</p>
                          <p className="text-xs text-gray-400">CID: {peer.cid.toString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {peer.is_online && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                            Online
                          </Badge>
                        )}
                        {isRegistered(peer.cid) ? (
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Registered
                          </Badge>
                        ) : peer.cid !== currentCid && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => registerWithPeer(peer.cid)}
                            className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Register
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Registered Peers */}
        <Card className="bg-[#343A5C] border-gray-700 text-white">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <UserCheck className="h-5 w-5 mr-2" />
                Registered Peers
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={listRegisteredPeers}
                disabled={loading}
                className="text-purple-400 hover:text-purple-300"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </CardTitle>
            <CardDescription className="text-gray-400">
              Peers you've successfully registered with
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {registeredPeers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No registered peers</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={listRegisteredPeers}
                    className="mt-3 border-gray-600 text-gray-300 hover:text-white"
                  >
                    Check Registered Peers
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {registeredPeers.map((peer) => (
                    <div
                      key={peer.cid.toString()}
                      className="flex items-center justify-between p-3 rounded-lg bg-[#444A6C] hover:bg-[#4F5889] transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                          {peer.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{peer.username}</p>
                          <p className="text-xs text-gray-400">CID: {peer.cid.toString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {peer.is_online && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                            Online
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white"
                        >
                          Message
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="mt-6 bg-[#343A5C] border-gray-700 text-white">
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-gray-300">
          <p>1. Open two browser tabs and connect as different users (e.g., admin2 and roomadmin)</p>
          <p>2. In each tab, click "Load Peers" to see all connected peers</p>
          <p>3. Click "Register" next to a peer to establish a P2P connection</p>
          <p>4. Once registered, you can message each other directly</p>
          <p className="text-sm text-gray-400 mt-4">
            Note: Current CID is {currentCid?.toString() || 'Not connected'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PeerTest;