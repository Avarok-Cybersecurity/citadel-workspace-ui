import React, { useState, useEffect } from 'react';
import { P2PMessengerManager } from '@/lib/p2p-messenger-manager';
import { p2pRegistrationService, type Peer } from '@/lib/p2p-registration-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, MessageCircle, Circle, Users, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { eventEmitter } from '@/lib/event-emitter';
import type { P2PConversation } from '@/lib/p2p-messenger-manager';

interface P2PPeerListProps {
  onSelectPeer: (peerCid: string) => void;
  selectedPeerCid?: string;
}

interface PeerInfo {
  cid: string;
  name: string;
  isConnected: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
}

export function P2PPeerList({ onSelectPeer, selectedPeerCid }: P2PPeerListProps) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [availablePeers, setAvailablePeers] = useState<Peer[]>([]);
  const [showAvailablePeers, setShowAvailablePeers] = useState(false);
  const [newPeerCid, setNewPeerCid] = useState('');
  const [isAddingPeer, setIsAddingPeer] = useState(false);
  
  const messenger = P2PMessengerManager.getInstance();
  
  // Add demo peer for Kathy McCooper
  const DEMO_PEERS: PeerInfo[] = [
    {
      cid: 'demo-peer-kathy',
      name: 'Kathy McCooper',
      isConnected: true,
      unreadCount: 0,
      lastMessage: 'Hey! How\'s the project going?',
      lastMessageTime: Date.now() - 1000 * 60 * 5 // 5 minutes ago
    }
  ];

  useEffect(() => {
    // Wait for LocalDB to load before loading peers
    const initPeers = async () => {
      await messenger.waitForReady();
      // Sync connection status from backend BEFORE loading peers
      // This ensures status dots are accurate on page reload
      await messenger.syncConnectionsFromBackend();
      loadPeers();
      loadAvailablePeers();
    };
    initPeers();

    // Subscribe to message updates
    const unsubscribeMessage = messenger.onMessage(() => {
      loadPeers();
    });

    // Subscribe to connection changes
    const unsubscribeConnection = messenger.onConnectionChange(() => {
      loadPeers();
    });

    // Subscribe to peer updates from registration service
    const handlePeersUpdated = (data: { allPeers: Peer[]; registeredPeers: Peer[] }) => {
      setAvailablePeers(data.allPeers);
      loadPeers();
    };
    eventEmitter.on('p2p:peers-updated', handlePeersUpdated);

    // Also listen for messages-loaded event in case init completes after mount
    const handleMessagesLoaded = () => loadPeers();
    eventEmitter.on('p2p:messages-loaded', handleMessagesLoaded);

    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
      eventEmitter.off('p2p:peers-updated', handlePeersUpdated);
      eventEmitter.off('p2p:messages-loaded', handleMessagesLoaded);
    };
  }, []);

  const loadPeers = () => {
    const conversations = messenger.getAllConversations();
    const peerList: PeerInfo[] = conversations.map(conv => {
      const lastMessage = conv.messages[conv.messages.length - 1];
      const peerCidStr = conv.peerCid.toString();
      return {
        cid: peerCidStr,
        // Use stored username if available, otherwise fallback to truncated CID
        name: conv.peerUsername || `User ${peerCidStr.slice(0, 8)}...`,
        isConnected: messenger.isConnected(conv.peerCid),
        unreadCount: conv.unreadCount,
        lastMessage: lastMessage?.content,
        lastMessageTime: lastMessage?.timestamp
      };
    });

    // Add demo peers
    const allPeers = [...DEMO_PEERS, ...peerList];

    // Sort by last message time
    allPeers.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
    setPeers(allPeers);
  };

  const loadAvailablePeers = () => {
    const { allPeers } = p2pRegistrationService.getPeers();
    setAvailablePeers(allPeers);
  };

  const handleAddPeer = async () => {
    if (!newPeerCid.trim()) return;

    setIsAddingPeer(true);
    try {
      await messenger.autoRegisterPeer(BigInt(newPeerCid));
      setNewPeerCid('');
      loadPeers();
    } catch (error) {
      console.error('Failed to add peer:', error);
    } finally {
      setIsAddingPeer(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1b26]">
      <div className="p-4 border-b border-[#262C4A]/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Direct Messages
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAvailablePeers(!showAvailablePeers)}
            className="h-8 text-gray-400 hover:text-white"
          >
            <Users className="h-4 w-4 mr-1" />
            {availablePeers.length}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 p-0 flex flex-col">
        <div className="p-4 border-b border-[#262C4A]/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPeer();
            }}
            className="flex gap-2"
          >
            <Input
              value={newPeerCid}
              onChange={(e) => setNewPeerCid(e.target.value)}
              placeholder="Enter peer CID..."
              className="flex-1 bg-[#262C4A] border-[#3a3f5c] text-white placeholder-gray-400 focus:border-[#6E59A5]"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isAddingPeer || !newPeerCid.trim()}
              className="bg-[#6E59A5] hover:bg-[#7c68d6] text-white"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </form>
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
                          handleAddPeer();
                        } else {
                          onSelectPeer(peerCidStr);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {peer.username?.[0] || peerCidStr.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 text-left">
                          <div className="font-medium text-sm">
                            {peer.fullName || peer.username || `User ${peerCidStr.slice(0, 8)}...`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {peerCidStr.slice(0, 16)}...
                          </div>
                        </div>
                        
                        {peer.isRegistered ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
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
              <div className="text-center py-8 text-gray-400">
                <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">Add a peer to start messaging</p>
              </div>
            ) : (
              <div className="space-y-1">
                {peers.map((peer) => (
                  <Button
                    key={peer.cid}
                    variant="ghost"
                    className={`w-full justify-start h-auto py-2 px-3 text-left hover:bg-[#262C4A]/50 ${
                      selectedPeerCid === peer.cid ? 'bg-[#262C4A] text-white' : 'text-gray-300'
                    }`}
                    onClick={() => onSelectPeer(peer.cid)}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{peer.name[0]}</AvatarFallback>
                        </Avatar>
                        <Circle
                          className={`absolute bottom-0 right-0 h-3 w-3 ${
                            peer.isConnected ? 'fill-green-500 text-green-500' : 'fill-gray-400 text-gray-400'
                          }`}
                        />
                      </div>
                      
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate">
                            {peer.name}
                          </span>
                          {peer.lastMessageTime && (
                            <span className="text-xs text-muted-foreground">
                              {formatTime(peer.lastMessageTime)}
                            </span>
                          )}
                        </div>
                        
                        {peer.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate">
                            {peer.lastMessage}
                          </p>
                        )}
                      </div>

                      {peer.unreadCount > 0 && (
                        <Badge
                          variant="default"
                          className="h-5 min-w-[20px] rounded-full text-xs"
                        >
                          {peer.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}