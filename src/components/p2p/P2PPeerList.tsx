import React, { useState, useEffect, useCallback } from 'react';
import { P2PMessengerManager } from '@/lib/p2p';
import { p2pRegistrationService, type Peer } from '@/lib/p2p-registration-service';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, MessageCircle, Users, CheckCircle } from 'lucide-react';
import { useEventListener } from '@/hooks';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { isUsablePeerCid } from '@/lib/peer-cid-input';
import type { PeerInfo } from './P2PPeerListHelpers';
import { ConversationPeerItem } from './ConversationPeerItem';
import { peerDisplayName, peerInitials, isUnnamedPeer } from '@/lib/peer-display';

interface P2PPeerListProps {
  onSelectPeer: (peerCid: string) => void;
  selectedPeerCid?: string;
}

export function P2PPeerList({ onSelectPeer, selectedPeerCid }: P2PPeerListProps) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [availablePeers, setAvailablePeers] = useState<Peer[]>([]);
  const [showAvailablePeers, setShowAvailablePeers] = useState(false);
  const [newPeerCid, setNewPeerCid] = useState('');
  const [isAddingPeer, setIsAddingPeer] = useState(false);
  const [addPeerError, setAddPeerError] = useState<string | null>(null);

  const messenger = P2PMessengerManager.getInstance();

  const loadPeers = useCallback(() => {
    const conversations = messenger.getAllConversations();
    const peerList: PeerInfo[] = conversations.map(conv => {
      const lastMessage = conv.messages[conv.messages.length - 1];
      const peerCidStr = conv.peerCid.toString();
      return {
        cid: peerCidStr,
        name: peerDisplayName({ cid: conv.peerCid, username: conv.peerUsername }),
        isConnected: messenger.isConnected(conv.peerCid),
        unreadCount: conv.unreadCount,
        lastMessage: lastMessage?.content,
        lastMessageTime: lastMessage?.timestamp
      };
    });

    peerList.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    setPeers(peerList);
  }, [messenger]);

  useEffect(() => {
    const initPeers = async () => {
      await messenger.waitForReady();
      await messenger.syncConnectionsFromBackend();
      loadPeers();
      loadAvailablePeers();
    };
    initPeers().catch(err => debugLog('P2PPeerList', 'Failed to init peers:', err));

    const unsubscribeMessage = messenger.onMessage(() => {
      loadPeers();
    });

    const unsubscribeConnection = messenger.onConnectionChange(() => {
      loadPeers();
    });

    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
    };
  }, [loadPeers, messenger]);

  const handlePeersUpdated = useCallback((data: { allPeers: Peer[]; registeredPeers: Peer[] }) => {
    setAvailablePeers(data.allPeers);
    loadPeers();
  }, [loadPeers]);

  useEventListener<{ allPeers: Peer[]; registeredPeers: Peer[] }>('p2p:peers-updated', handlePeersUpdated);
  useEventListener('p2p:messages-loaded', loadPeers);

  const loadAvailablePeers = () => {
    const { allPeers } = p2pRegistrationService.getPeers();
    setAvailablePeers(allPeers);
  };

  const handleAddPeer = async () => {
    const entered = newPeerCid.trim();
    if (!entered) return;

    // Validate before BigInt rather than after. `BigInt('alice')` THROWS, and
    // the catch below used to hand that to debugLog — which compiles to a no-op
    // outside dev. So anything non-numeric, including a username, produced no
    // error, no message and no cleared field: the button simply did nothing.
    if (!isUsablePeerCid(entered)) {
      setAddPeerError('A peer CID is a number. Copy it from the peer\'s account, or find them in the directory.');
      return;
    }

    setIsAddingPeer(true);
    setAddPeerError(null);
    try {
      await messenger.autoRegisterPeer(BigInt(entered));
      setNewPeerCid('');
      loadPeers();
    } catch (error) {
      debugLog('P2PPeerList', 'Failed to add peer:', error);
      // Also shown, not only logged. The log is invisible in production, and a
      // request that failed silently is indistinguishable from one ignored.
      setAddPeerError('Could not add that peer. Check the CID and try again.');
    } finally {
      setIsAddingPeer(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-input">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary-accent" />
            Direct Messages
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAvailablePeers(!showAvailablePeers)}
            className="h-7 text-muted-foreground hover:text-foreground text-xs gap-1"
          >
            <Users className="h-3.5 w-3.5" />
            {availablePeers.length}
          </Button>
        </div>
      </div>

      <div className="flex-1 p-0 flex flex-col">
        <div className="p-3 border-b border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAsyncSetup(handleAddPeer);
            }}
            className="flex gap-2"
          >
            <Input
              value={newPeerCid}
              onChange={(e) => {
                setNewPeerCid(e.target.value);
                if (addPeerError) setAddPeerError(null);
              }}
              placeholder="Enter peer CID..."
              aria-invalid={addPeerError ? true : undefined}
              aria-describedby={addPeerError ? 'add-peer-error' : undefined}
              className="flex-1 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 h-9 rounded-lg text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isAddingPeer || !newPeerCid.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 w-9 rounded-lg"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </form>
          {addPeerError && (
            // role="alert" so it is announced: the field is at the top of a
            // panel and a sighted user sees the message appear, while a screen
            // reader user would otherwise get nothing at all.
            <p id="add-peer-error" role="alert" className="mt-2 text-xs text-destructive">
              {addPeerError}
            </p>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {showAvailablePeers && (
              <div className="mb-4">
                <div className="text-sm font-medium text-muted-foreground mb-2 px-2">
                  Available Peers ({availablePeers.length})
                </div>
                <div className="space-y-1">
                  {availablePeers.map((peer) => {
                    const peerCidStr = peer.cid.toString();
                    return (
                    <Button
                      key={peerCidStr}
                      variant="ghost"
                      className="w-full justify-start h-auto py-2 px-3"
                      onClick={() => {
                        if (!peer.isRegistered) {
                          setNewPeerCid(peerCidStr);
                          runAsyncSetup(handleAddPeer);
                        } else {
                          onSelectPeer(peerCidStr);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {peerInitials({ cid: peer.cid, username: peer.username, fullName: peer.fullName })}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 text-left">
                          <div className="font-medium text-sm">
                            {peerDisplayName({ cid: peer.cid, username: peer.username, fullName: peer.fullName })}
                          </div>
                          {isUnnamedPeer({ cid: peer.cid, username: peer.username, fullName: peer.fullName }) && (
                            <div className="text-xs text-muted-foreground">
                              Name not shared yet
                            </div>
                          )}
                        </div>

                        {peer.isRegistered ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </Button>
                    );
                  })}
                </div>
                <div className="my-4 border-b" />
              </div>
            )}
            {peers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">Add a peer to start messaging</p>
              </div>
            ) : (
              <div className="space-y-1">
                {peers.map((peer) => (
                  <ConversationPeerItem
                    key={peer.cid}
                    peer={peer}
                    isSelected={selectedPeerCid === peer.cid}
                    onSelect={onSelectPeer}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
