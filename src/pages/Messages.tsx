import { AppLayout } from "@/components/layout/AppLayout";
import { P2PPeerList } from "@/components/p2p/P2PPeerList";
import { P2PChat } from "@/components/p2p/P2PChat";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { connectionManager } from "@/lib/connection";

const Messages = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const channel = new URLSearchParams(location.search).get("channel");
  const [selectedPeerCid, setSelectedPeerCid] = useState<string | null>(channel);

  // Get current user info
  const connectionInfo = connectionManager.getConnectionInfo();
  const currentUserCid = connectionInfo?.cid;
  const currentUserName = connectionInfo?.username || 'You';

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
        <div className="w-72 border-r border-[#2D3548] bg-[#1C2333] flex-shrink-0">
          <div className="p-3 border-b border-[#2D3548]">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Conversations
            </h2>
          </div>
          <P2PPeerList
            onSelectPeer={handleSelectPeer}
            selectedPeerCid={selectedPeerCid || undefined}
          />
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-[#1C1D28]">
          {selectedPeerCid && currentUserCid ? (
            <P2PChat
              peerCid={BigInt(selectedPeerCid)}
              peerName={`User ${selectedPeerCid.slice(0, 8)}...`}
              currentUserCid={currentUserCid}
              currentUserName={currentUserName}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <MessageCircle className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg font-medium mb-1">No conversation selected</p>
              <p className="text-sm text-gray-600">
                Choose a peer from the list to start messaging
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Messages;