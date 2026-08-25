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
      className="flex items-center justify-between p-3 rounded-lg bg-card hover:bg-surface transition-colors"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
          {peerInitials(peer)}
        </div>
        <div>
          <p className="font-medium">{peerDisplayName(peer)}</p>
          {peer.fullName && peer.username && (
            <p className="text-xs text-muted-foreground">{peer.username}</p>
          )}
          {isUnnamedPeer(peer) && (
            <p className="text-xs text-muted-foreground">Name not shared yet</p>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {peer.is_online && (
          <Badge className="bg-success/20 text-success border-success/50">
            <div className="w-2 h-2 bg-success rounded-full mr-1 animate-pulse" />
            Online
          </Badge>
        )}
        {isRegistered ? (
          <Badge className="bg-primary-accent/20 text-primary-accent border-primary-accent/50">
            <UserCheck className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        ) : isOutgoing ? (
          <Button
            variant="outline"
            size="sm"
            disabled
            className="border-warning/50 text-warning cursor-not-allowed"
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
            className="border-success text-success hover:bg-success/90 hover:text-success-foreground"
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
            className="border-primary-accent text-primary-accent hover:bg-primary/90 hover:text-primary-foreground"
          >
            <UserPlus className="h-3 w-3 mr-1" />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
};
