import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/empty-state';
import { Users, RefreshCw, Loader2, Signal } from 'lucide-react';
import { usePeerDiscovery } from './usePeerDiscovery';
import { PeerListItem } from './PeerListItem';
import { shortPeerHandle } from '@/lib/peer-display';

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
      <DialogContent className="bg-card text-foreground border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Peer Discovery
            </span>
            <Button
              aria-label="Refresh peer list"
              variant="ghost"
              size="sm"
              onClick={() => void discoverPeers()}
              disabled={loading}
              className="text-primary-accent hover:text-primary-accent"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Discover and connect with other users in your workspace
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="mb-3 p-3 bg-card rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Signal className="h-4 w-4 text-success-emphasis" />
                <span className="text-sm">You are connected as: <strong>{currentUsername}</strong></span>
              </div>
              {currentCid !== undefined && currentCid !== null && (
                <span className="text-xs text-muted-foreground">
                  {/* A short handle, not the raw routing identifier — enough to tell two
                      sessions apart in a screenshot without putting a u64 in the UI. */}
                  Session {shortPeerHandle(currentCid)}
                </span>
              )}
            </div>
          </div>

          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-accent" />
              </div>
            ) : peers.length === 0 ? (
              /* The second line here used to read "Open another tab and connect
                 as a different user to test P2P" -- developer instructions,
                 shipped to end users as their only guidance on an empty screen. */
              <EmptyState
                icon={Users}
                title="No other users in this workspace yet"
                description="People who join this workspace appear here, and you can connect to them directly from this list."
              />
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
            <div className="mt-4 p-3 bg-surface rounded-lg">
              <p className="text-xs text-muted-foreground">
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
