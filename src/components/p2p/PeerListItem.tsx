import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, UserCheck, Loader2, Clock } from 'lucide-react';
import type { PendingPeerRequest } from '@/lib/peer-registration-store';
import type { Peer } from './usePeerDiscovery';
import { peerDisplayName, peerInitials, isUnnamedPeer } from '@/lib/peer-display';

interface PeerListItemProps {
  peer: Peer;
  isRegistered: boolean;
  isOutgoing: boolean;
  incomingRequest: PendingPeerRequest | undefined;
  acceptingPeerCid: string | null;
  onAccept: (request: PendingPeerRequest) => void;
  onRegister: (peerCid: string, peerUsername: string) => void;
}

export const PeerListItem: React.FC<PeerListItemProps> = ({
  peer,
  isRegistered,
  isOutgoing,
  incomingRequest,
  acceptingPeerCid,
  onAccept,
  onRegister,
}) => {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg bg-[#232536] hover:bg-[#4F5889] transition-colors"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
          {peerInitials(peer)}
        </div>
        <div>
          <p className="font-medium">{peerDisplayName(peer)}</p>
          {peer.fullName && peer.username && (
            <p className="text-xs text-gray-400">{peer.username}</p>
          )}
          {isUnnamedPeer(peer) && (
            <p className="text-xs text-gray-500">Name not shared yet</p>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {peer.is_online && (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />
            Online
          </Badge>
        )}
        {isRegistered ? (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
            <UserCheck className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        ) : isOutgoing ? (
          <Button
            variant="outline"
            size="sm"
            disabled
            className="border-yellow-600/50 text-yellow-400 cursor-not-allowed"
          >
            <Clock className="h-3 w-3 mr-1 animate-pulse" />
            Awaiting Response...
          </Button>
        ) : incomingRequest ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAccept(incomingRequest)}
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
            onClick={() => onRegister(peer.cid, peer.username)}
            className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
          >
            <UserPlus className="h-3 w-3 mr-1" />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
};
