import React, { useState } from 'react';
import { P2PPeerList } from './P2PPeerList';
import { P2PChat } from './P2PChat';
import { X } from 'lucide-react';
import { connectionManager } from '@/lib/connection-manager';

interface DirectMessagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DirectMessagesPanel: React.FC<DirectMessagesPanelProps> = ({ isOpen, onClose }) => {
  const [selectedPeerCid, setSelectedPeerCid] = useState<string>('demo-peer-kathy');
  const connectionInfo = connectionManager.getConnectionInfo();
  const currentUserCid = connectionInfo?.cid || undefined;
  const currentUserName = connectionInfo?.fullName || 'You';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Panel */}
      <div className="relative ml-auto h-full w-full max-w-4xl bg-[#1C1D28] shadow-2xl flex">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white transition-colors"
          title="Close"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Peer List */}
        <div className="w-80 bg-[#1a1b26] border-r border-[#262C4A]/50">
          <div className="p-4 border-b border-[#262C4A]/50">
            <h2 className="text-lg font-semibold text-white">Direct Messages</h2>
          </div>
          <P2PPeerList 
            onSelectPeer={(cid) => setSelectedPeerCid(cid)}
            selectedPeerCid={selectedPeerCid}
          />
        </div>

        {/* Chat Area */}
        <div className="flex-1">
          <P2PChat 
            peerCid={selectedPeerCid}
            peerName={selectedPeerCid === 'demo-peer-kathy' ? 'Kathy McCooper' : undefined}
            currentUserCid={currentUserCid}
            currentUserName={currentUserName}
          />
        </div>
      </div>
    </div>
  );
};