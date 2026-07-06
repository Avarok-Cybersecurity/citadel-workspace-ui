import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, RefreshCw, Loader2, Signal } from 'lucide-react';
import { usePeerDiscovery } from './usePeerDiscovery';
import { PeerListItem } from './PeerListItem';

interface PeerDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PeerDiscoveryModal: React.FC<PeerDiscoveryModalProps> = ({ isOpen, onClose }) => {
  const {
    peers,
    registeredPeers,
    outgoingRequests,
    incomingRequests,
    loading,
    acceptingPeerCid,
    currentCid,
    currentUsername,
    discoverPeers,
    acceptIncomingRequest,
    registerWithPeer,
  } = usePeerDiscovery(isOpen);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#232536] text-white border-gray-700 max-w-2xl">
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
          <div className="mb-3 p-3 bg-[#232536] rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Signal className="h-4 w-4 text-green-400" />
                <span className="text-sm">You are connected as: <strong>{currentUsername}</strong></span>
              </div>
              <span className="text-xs text-gray-400">CID: {currentCid?.toString()}</span>
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
                  <PeerListItem
                    key={peer.cid}
                    peer={peer}
                    isRegistered={registeredPeers.has(peer.cid)}
                    isOutgoing={outgoingRequests.has(peer.cid)}
                    incomingRequest={incomingRequests.get(peer.cid)}
                    acceptingPeerCid={acceptingPeerCid}
                    onAccept={acceptIncomingRequest}
                    onRegister={registerWithPeer}
                  />
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
