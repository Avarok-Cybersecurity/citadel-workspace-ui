import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, UserPlus, UserCheck, RefreshCw, Loader2, Signal } from 'lucide-react';
import { websocketService } from '@/lib/websocket-service';
import { connectionManager } from '@/lib/connection-manager';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/lib/workspace-context';

interface Peer {
  cid: string;
  username: string;
  fullName?: string;
  is_online: boolean;
  is_registered?: boolean;
}

interface PeerDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PeerDiscoveryModal: React.FC<PeerDiscoveryModalProps> = ({ isOpen, onClose }) => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [registeredPeers, setRegisteredPeers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [registeringPeer, setRegisteringPeer] = useState<string | null>(null);
  const [incomingRegistrations, setIncomingRegistrations] = useState<Map<string, any>>(new Map());
  const { toast } = useToast();
  const { state } = useWorkspace();
  
  // Get current connection CID and username from tab-specific session
  const currentCid = connectionManager.getConnectionInfo()?.cid || null;
  const tabSession = connectionManager.getTabSelectedSession();
  const currentUsername = tabSession?.username || state.currentUser?.username || 'Unknown';

  useEffect(() => {
    if (isOpen) {
      discoverPeers();
    }
  }, [isOpen]);

  // Set up listener for incoming registration notifications
  useEffect(() => {
    const handleIncomingRegistration = (message: any) => {
      if (message.PeerRegisterNotification) {
        const notification = message.PeerRegisterNotification;
        const peerCid = notification.peer_cid;
        
        // Store the incoming registration
        setIncomingRegistrations(prev => new Map(prev).set(peerCid, notification));
        
        toast({
          title: "Registration Request",
          description: `Peer ${peerCid.slice(0, 8)}... wants to connect`,
          className: "bg-[#343A5C] border-yellow-600 text-yellow-400",
          action: (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-green-600 text-green-400"
                onClick={() => acceptRegistration(peerCid)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-600 text-red-400"
                onClick={() => rejectRegistration(peerCid)}
              >
                Reject
              </Button>
            </div>
          ),
        });
      }
    };

    eventEmitter.on('websocket-message', handleIncomingRegistration);
    return () => {
      eventEmitter.off('websocket-message', handleIncomingRegistration);
    };
  }, []);

  const discoverPeers = async () => {
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
      
      // Create request for listing all peers
      const request = {
        ListAllPeers: {
          request_id: requestId,
          cid: currentCid
        }
      };

      // Set up response handler before sending request
      const responsePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);

        const handleMessage = (message: any) => {
          if (message.ListAllPeersResponse && message.ListAllPeersResponse.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            resolve(message.ListAllPeersResponse);
          } else if (message.ListAllPeersFailure && message.ListAllPeersFailure.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            reject(new Error(message.ListAllPeersFailure.message || 'Failed to list peers'));
          }
        };

        eventEmitter.on('websocket-message', handleMessage);
      });

      // Send the request
      await websocketService.sendMessage(request);
      
      // Wait for response
      const response = await responsePromise;
      
      // Process peers - response contains peer_information object
      const peerInfo = response.peer_information || {};
      const peerList = Object.values(peerInfo);
      const processedPeers = peerList
        .filter((p: any) => p.cid !== currentCid) // Filter out self
        .map((p: any) => ({
          cid: p.cid.toString(),
          username: p.username || 'Unknown',
          fullName: p.full_name,
          is_online: p.is_online || false
        }));
      
      setPeers(processedPeers);
      
      // Try to get registered peers but don't block on it
      loadRegisteredPeers().catch(err => {
        console.warn('Could not load registered peers:', err);
        // Continue anyway - we can still show peers without registration status
      });
      
      if (processedPeers.length === 0) {
        toast({
          title: "No Peers Found",
          description: "You are the only user connected to this workspace",
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      } else {
        toast({
          title: "Peers Discovered",
          description: `Found ${processedPeers.length} other user${processedPeers.length > 1 ? 's' : ''} in the workspace`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      }
    } catch (error) {
      console.error('Failed to discover peers:', error);
      toast({
        title: "Discovery Failed",
        description: "Could not discover peers in the workspace",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRegisteredPeers = async () => {
    if (!currentCid) return;

    try {
      const requestId = crypto.randomUUID();
      const request = {
        ListRegisteredPeers: {
          request_id: requestId,
          cid: currentCid
        }
      };

      const responsePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);

        const handleMessage = (message: any) => {
          if (message.ListRegisteredPeersResponse && message.ListRegisteredPeersResponse.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            resolve(message.ListRegisteredPeersResponse);
          } else if (message.ListRegisteredPeersFailure && message.ListRegisteredPeersFailure.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            reject(new Error(message.ListRegisteredPeersFailure.message || 'Failed to list registered peers'));
          }
        };

        eventEmitter.on('websocket-message', handleMessage);
      });

      await websocketService.sendMessage(request);
      const response = await responsePromise;
      
      const registered = new Set<string>();
      if (response.peers) {
        response.peers.forEach((p: any) => {
          registered.add(p.cid.toString());
        });
      }
      setRegisteredPeers(registered);
    } catch (error) {
      console.error('Failed to load registered peers:', error);
    }
  };

  const registerWithPeer = async (peerCid: string) => {
    if (!currentCid) {
      toast({
        title: "Not Connected",
        description: "Please connect to a workspace first",
        variant: "destructive",
      });
      return;
    }

    setRegisteringPeer(peerCid);
    try {
      const requestId = crypto.randomUUID();
      const request = {
        PeerRegister: {
          request_id: requestId,
          cid: currentCid,
          peer_cid: peerCid,
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

      // Set up response handler before sending request
      const responsePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Registration request timed out'));
        }, 10000);

        const handleMessage = (message: any) => {
          if (message.PeerRegisterSuccess && message.PeerRegisterSuccess.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            resolve(message.PeerRegisterSuccess);
          } else if (message.PeerRegisterFailure && message.PeerRegisterFailure.request_id === requestId) {
            clearTimeout(timeout);
            eventEmitter.off('websocket-message', handleMessage);
            reject(new Error(message.PeerRegisterFailure.message || 'Registration failed'));
          }
        };

        eventEmitter.on('websocket-message', handleMessage);
      });

      // Send the registration request
      await websocketService.sendMessage(request);
      
      try {
        // Wait for response
        const response = await responsePromise;
        
        toast({
          title: "Registration Successful",
          description: `Successfully registered with peer ${peerCid.slice(0, 8)}...`,
          className: "bg-[#343A5C] border-green-600 text-green-400",
        });

        // Add to registered peers set
        setRegisteredPeers(prev => new Set([...prev, peerCid]));

        // If connect_after_register was true, open P2P connection
        if (request.PeerRegister.connect_after_register) {
          try {
            await websocketService.openP2PConnection(currentCid, peerCid);
            toast({
              title: "P2P Connected",
              description: "P2P connection established",
              className: "bg-[#343A5C] border-blue-600 text-blue-400",
            });
          } catch (connErr) {
            console.error('Failed to open P2P connection:', connErr);
          }
        }
      } catch (error) {
        console.error('Registration failed:', error);
        toast({
          title: "Registration Failed",
          description: error instanceof Error ? error.message : "Could not register with peer",
          variant: "destructive",
        });
      }

      // Refresh the lists after a short delay
      setTimeout(() => {
        loadRegisteredPeers();
      }, 1000);
    } catch (error) {
      console.error('Failed to send registration request:', error);
      toast({
        title: "Request Failed",
        description: "Could not send registration request",
        variant: "destructive",
      });
    } finally {
      setRegisteringPeer(null);
    }
  };

  const acceptRegistration = async (peerCid: string) => {
    // For now, auto-accept by registering back with the peer
    // In a real implementation, you'd send an accept response
    const registration = incomingRegistrations.get(peerCid);
    if (registration) {
      // Register back with the peer to complete mutual registration
      await registerWithPeer(peerCid);
      
      // Remove from incoming registrations
      setIncomingRegistrations(prev => {
        const newMap = new Map(prev);
        newMap.delete(peerCid);
        return newMap;
      });
    }
  };

  const rejectRegistration = (peerCid: string) => {
    // Remove from incoming registrations
    setIncomingRegistrations(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerCid);
      return newMap;
    });
    
    toast({
      title: "Registration Rejected",
      description: `Rejected connection from ${peerCid.slice(0, 8)}...`,
      className: "bg-[#343A5C] border-red-600 text-red-400",
    });
  };

  const getUserInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#343A5C] text-white border-gray-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Peer Discovery
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={discoverPeers}
              disabled={loading}
              className="text-purple-400 hover:text-purple-300"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Discover and connect with other users in your workspace
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="mb-3 p-3 bg-[#444A6C] rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Signal className="h-4 w-4 text-green-400" />
                <span className="text-sm">You are connected as: <strong>{currentUsername}</strong></span>
              </div>
              <span className="text-xs text-gray-400">CID: {currentCid}</span>
            </div>
          </div>

          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              </div>
            ) : peers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No other users found in the workspace</p>
                <p className="text-sm mt-2">Open another tab and connect as a different user to test P2P</p>
              </div>
            ) : (
              <div className="space-y-2">
                {peers.map((peer) => (
                  <div
                    key={peer.cid}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#444A6C] hover:bg-[#4F5889] transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
                        {getUserInitial(peer.username)}
                      </div>
                      <div>
                        <p className="font-medium">{peer.username}</p>
                        {peer.fullName && (
                          <p className="text-xs text-gray-400">{peer.fullName}</p>
                        )}
                        <p className="text-xs text-gray-500">CID: {peer.cid}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {peer.is_online && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                          <div className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />
                          Online
                        </Badge>
                      )}
                      {registeredPeers.has(peer.cid) ? (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                          <UserCheck className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => registerWithPeer(peer.cid)}
                          disabled={registeringPeer === peer.cid}
                          className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
                        >
                          {registeringPeer === peer.cid ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <UserPlus className="h-3 w-3 mr-1" />
                          )}
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {peers.length > 0 && (
            <div className="mt-4 p-3 bg-[#3A3F5C] rounded-lg">
              <p className="text-xs text-gray-400">
                <strong>Tip:</strong> Click "Connect" to establish a P2P connection with a peer. 
                Once connected, you can exchange direct messages without going through the server.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PeerDiscoveryModal;