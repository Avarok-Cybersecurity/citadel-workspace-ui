import { AppLayout } from "@/components/layout/AppLayout";
import { P2PPeerList } from "@/components/p2p/P2PPeerList";
import { P2PChat } from "@/components/p2p/P2PChat";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Shield } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { connectionManager } from "@/lib/connection";
import { useRegisteredPeers } from "@/hooks";
import { peerDisplayName } from "@/lib/peer-display";

const Messages = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const channel = new URLSearchParams(location.search).get("channel");
  const [selectedPeerCid, setSelectedPeerCid] = useState<string | null>(channel);
  const { registeredPeers } = useRegisteredPeers();

  // Get current user info
  const connectionInfo = connectionManager.getConnectionInfo();
  const currentUserCid = connectionInfo?.cid;
  const currentUserName = connectionInfo?.username || 'You';

  // Resolve peer CID to username
  const selectedPeerName = useMemo(() => {
    if (!selectedPeerCid) return '';
    const peer = registeredPeers.find(p => p.cid === selectedPeerCid);
    const username = peer && peer.username !== 'Unknown' ? peer.username : undefined;
    // peerDisplayName, not a truncated CID: the decimal prefix is unreadable and
    // identical for peers whose CIDs share leading digits. See lib/peer-display.
    return peerDisplayName({ cid: selectedPeerCid, username });
  }, [selectedPeerCid, registeredPeers]);

  // Sync URL param with selected peer
  useEffect(() => {
    setSelectedPeerCid(channel);
  }, [channel]);

  const handleSelectPeer = (peerCid: string) => {
    setSelectedPeerCid(peerCid);
    navigate(`/messages?channel=${peerCid}`, { replace: true });
  };

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Conversation List */}
        <div className="w-72 border-r border-border bg-input flex-shrink-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Conversations
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <P2PPeerList
              onSelectPeer={handleSelectPeer}
              selectedPeerCid={selectedPeerCid || undefined}
            />
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedPeerCid && currentUserCid ? (
            <P2PChat
              peerCid={BigInt(selectedPeerCid)}
              peerName={selectedPeerName}
              currentUserCid={currentUserCid}
              currentUserName={currentUserName}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="flex flex-col items-center max-w-xs text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary-accent/10 flex items-center justify-center mb-5">
                  <MessageCircle className="h-8 w-8 text-primary-accent" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No conversation selected</h3>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  Choose a peer from the list to start an encrypted conversation
                </p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-accent/5 border border-primary-accent/10">
                  <Shield className="w-3.5 h-3.5 text-primary-accent" />
                  <span className="text-[11px] text-muted-foreground">End-to-end encrypted</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Messages;
