import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, UserPlus, UserCheck, RefreshCw, Loader2, Signal, Clock } from 'lucide-react';
import { websocketService } from '@/lib/websocket-service';
import { connectionManager } from '@/lib/connection-manager';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/lib/workspace-context';
import { peerRegistrationStore, OutgoingPeerRequest, PendingPeerRequest } from '@/lib/peer-registration-store';
import { getSelectedUser } from '@/lib/tab-context';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';

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
  const [outgoingRequests, setOutgoingRequests] = useState<Set<string>>(new Set());
  const [incomingRequests, setIncomingRequests] = useState<Map<string, PendingPeerRequest>>(new Map());
  const [loading, setLoading] = useState(false);
  const [acceptingPeerCid, setAcceptingPeerCid] = useState<string | null>(null);
  const { toast } = useToast();
  const { state } = useWorkspace();
  
  // Get current connection CID and username from tab-specific session
  // Priority: 1) Tab context selectedCid/selectedUsername (set during session switch), 2) StoredSession, 3) Global connection
  const tabSelection = getSelectedUser();
  const tabSession = connectionManager.getTabSelectedSession();
  const currentCid = tabSelection?.selectedCid || tabSession?.cid || connectionManager.getConnectionInfo()?.cid || null;
  const currentUsername = tabSelection?.selectedUsername || tabSession?.username || state.currentUser?.username || 'Unknown';

  useEffect(() => {
    if (isOpen) {
      discoverPeers();
      // Load initial outgoing requests
      setOutgoingRequests(peerRegistrationStore.getOutgoingRequestCids());
    }
  }, [isOpen]);

  // Listen for outgoing request updates
  useEffect(() => {
    const handleOutgoingUpdate = (data: { requests: OutgoingPeerRequest[]; cids: Set<string> }) => {
      setOutgoingRequests(data.cids);
    };

    eventEmitter.on('outgoing-peer-requests:updated', handleOutgoingUpdate);
    return () => {
      eventEmitter.off('outgoing-peer-requests:updated', handleOutgoingUpdate);
    };
  }, []);

  // Listen for incoming pending requests (for "Accept Request" button)
  useEffect(() => {
    const updateIncomingRequests = () => {
      const pending = peerRegistrationStore.getPendingRequests();
      const incomingMap = new Map<string, PendingPeerRequest>();
      pending.forEach(req => {
        incomingMap.set(req.peer_cid, req);
      });
      setIncomingRequests(incomingMap);
    };

    // Initial load when modal opens
    if (isOpen) {
      updateIncomingRequests();
    }

    // Listen for updates
    eventEmitter.on('peer-requests:updated', updateIncomingRequests);
    return () => {
      eventEmitter.off('peer-requests:updated', updateIncomingRequests);
    };
  }, [isOpen]);

  // Set up listener for incoming registration notifications
  // Delegate to peerRegistrationStore for persistence and non-disruptive UX
  useEffect(() => {
    const handleIncomingRegistration = (message: any) => {
      if (message.PeerRegisterNotification) {
        // Delegate to store - handles persistence, deduplication, and UI updates via badge
        peerRegistrationStore.handleIncomingRequest(message.PeerRegisterNotification);
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
      // Register request for cross-tab response routing
      broadcastChannelService.registerRequest(requestId, currentCid.toString());

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
          broadcastChannelService.clearRequest(requestId);
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
      
      // If ListAllPeers returns empty, try GetSessions as fallback
      // GetSessions queries the internal service's session map directly
      if (processedPeers.length === 0) {
        console.log('[PeerDiscovery] ListAllPeers returned empty, trying GetSessions fallback...');
        const sessionPeers = await discoverPeersViaGetSessions();
        if (sessionPeers.length > 0) {
          setPeers(sessionPeers);
          loadRegisteredPeers().catch(err => {
            console.warn('Could not load registered peers:', err);
          });
          toast({
            title: "Peers Discovered",
            description: `Found ${sessionPeers.length} other user${sessionPeers.length > 1 ? 's' : ''} via session lookup`,
            className: "bg-[#343A5C] border-purple-800 text-purple-200",
          });
          return;
        }
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
      console.error('Failed to discover peers via ListAllPeers:', error);
      // Try GetSessions as fallback on error
      try {
        console.log('[PeerDiscovery] ListAllPeers failed, trying GetSessions fallback...');
        const sessionPeers = await discoverPeersViaGetSessions();
        if (sessionPeers.length > 0) {
          setPeers(sessionPeers);
          loadRegisteredPeers().catch(err => {
            console.warn('Could not load registered peers:', err);
          });
          toast({
            title: "Peers Discovered",
            description: `Found ${sessionPeers.length} other user${sessionPeers.length > 1 ? 's' : ''} via session lookup`,
            className: "bg-[#343A5C] border-purple-800 text-purple-200",
          });
          return;
        }
      } catch (fallbackError) {
        console.error('GetSessions fallback also failed:', fallbackError);
      }
      toast({
        title: "Discovery Failed",
        description: "Could not discover peers in the workspace",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fallback discovery using GetSessions
   * This queries the internal service's session map directly
   * Works even when the Citadel SDK's peer discovery hasn't propagated yet
   */
  const discoverPeersViaGetSessions = async (): Promise<Peer[]> => {
    const requestId = crypto.randomUUID();
    // GetSessions doesn't need CID - it returns all sessions
    const request = {
      GetSessions: {
        request_id: requestId,
        cid: 0  // 0 means get all sessions
      }
    };

    const responsePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('GetSessions timed out'));
      }, 5000);

      const handleMessage = (message: any) => {
        if (message.GetSessionsResponse && message.GetSessionsResponse.request_id === requestId) {
          clearTimeout(timeout);
          eventEmitter.off('websocket-message', handleMessage);
          resolve(message.GetSessionsResponse);
        }
      };

      eventEmitter.on('websocket-message', handleMessage);
    });

    await websocketService.sendMessage(request);
    const response = await responsePromise;

    // Convert sessions to Peer format
    const sessions = response.sessions || [];
    console.log('[PeerDiscovery] GetSessions returned', sessions.length, 'sessions');

    return sessions
      .filter((s: any) => s.cid.toString() !== currentCid?.toString()) // Filter out self
      .map((s: any) => ({
        cid: s.cid.toString(),
        username: s.username || 'Unknown',
        fullName: undefined,
        is_online: true  // If they have a session, they're online
      }));
  };

  const loadRegisteredPeers = async () => {
    if (!currentCid) return;

    try {
      const requestId = crypto.randomUUID();
      // Register request for cross-tab response routing
      broadcastChannelService.registerRequest(requestId, currentCid.toString());

      const request = {
        ListRegisteredPeers: {
          request_id: requestId,
          cid: currentCid
        }
      };

      const responsePromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          broadcastChannelService.clearRequest(requestId);
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
        // peers is a HashMap<u64, PeerInformation>, not an array
        // Keys are the peer CIDs
        Object.keys(response.peers).forEach((peerCid: string) => {
          registered.add(peerCid);
        });
      }
      setRegisteredPeers(registered);
    } catch (error) {
      console.error('Failed to load registered peers:', error);
    }
  };

  /**
   * Accept an incoming peer registration request from the Peer Discovery modal.
   * Uses the same logic as PendingRequestsModal's handleAccept.
   */
  const acceptIncomingRequest = async (request: PendingPeerRequest) => {
    setAcceptingPeerCid(request.peer_cid);
    try {
      await peerRegistrationStore.acceptRequest(request.id);
      // Toast removed - modal already shows success state
      // Refresh the registered peers list
      loadRegisteredPeers();
    } catch (error) {
      toast({
        title: 'Failed to Accept',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAcceptingPeerCid(null);
    }
  };

  const registerWithPeer = async (peerCid: string, peerUsername: string) => {
    if (!currentCid) {
      toast({
        title: "Not Connected",
        description: "Please connect to a workspace first",
        variant: "destructive",
      });
      return;
    }

    // Fire-and-forget pattern: send request, add to outgoing, show "Awaiting Response..."
    try {
      const requestId = crypto.randomUUID();
      // Register request for cross-tab response routing
      broadcastChannelService.registerRequest(requestId, currentCid.toString());

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
          connect_after_register: false,
          peer_session_password: null
        }
      };

      // Add to outgoing requests store (persisted to LocalDB)
      const now = Date.now();
      await peerRegistrationStore.addOutgoingRequest({
        id: requestId,
        fromCid: currentCid.toString(),
        toCid: peerCid,
        peerUsername: peerUsername,
        timestamp: now,
        timeLastSent: now
      });

      // Send the registration request (fire-and-forget - no timeout)
      await websocketService.sendMessage(request);

      toast({
        title: "Request Sent",
        description: `Connection request sent to ${peerUsername}. They will receive it when online.`,
        className: "bg-[#343A5C] border-purple-600 text-purple-400",
      });

      // The peerRegistrationStore handles PeerRegisterSuccess/Failure events
      // and will automatically remove from outgoing + update UI via event emitter
    } catch (error) {
      console.error('Failed to send registration request:', error);
      toast({
        title: "Request Failed",
        description: "Could not send registration request",
        variant: "destructive",
      });
    }
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
                      ) : outgoingRequests.has(peer.cid) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="border-yellow-600/50 text-yellow-400 cursor-not-allowed"
                        >
                          <Clock className="h-3 w-3 mr-1 animate-pulse" />
                          Awaiting Response...
                        </Button>
                      ) : incomingRequests.has(peer.cid) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acceptIncomingRequest(incomingRequests.get(peer.cid)!)}
                          disabled={acceptingPeerCid === peer.cid}
                          className="border-green-600 text-green-400 hover:bg-green-600 hover:text-white"
                        >
                          {acceptingPeerCid === peer.cid ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <UserPlus className="h-3 w-3 mr-1" />
                          )}
                          Accept Request
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => registerWithPeer(peer.cid, peer.username)}
                          className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
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