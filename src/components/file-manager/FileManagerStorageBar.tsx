import { UserCircle2, Server } from "lucide-react";
import { TreeScope } from "@/types/revfs-types";
import type { Peer } from "@/lib/p2p-registration-service";
import { peerDisplayName } from '@/lib/peer-display';

interface FileManagerStorageBarProps {
  storageMode: TreeScope;
  setStorageMode: (mode: TreeScope) => void;
  registeredPeers: Peer[];
  selectedPeerCid: bigint | null;
  setSelectedPeerCid: (cid: bigint) => void;
}

export function FileManagerStorageBar({
  storageMode,
  setStorageMode,
  registeredPeers,
  selectedPeerCid,
  setSelectedPeerCid,
}: FileManagerStorageBarProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-surface">
      {/* Storage mode tabs */}
      <div className="flex items-center gap-1 bg-card rounded p-1">
        <button
          onClick={() => setStorageMode(TreeScope.Peer)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
            storageMode === TreeScope.Peer
              ? 'bg-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCircle2 className="h-3.5 w-3.5" />
          P2P Storage
        </button>
        <button
          onClick={() => setStorageMode(TreeScope.Server)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
            storageMode === TreeScope.Server
              ? 'bg-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          Server Storage
        </button>
      </div>

      {/* Peer selector (only in P2P mode with multiple peers) */}
      {storageMode === TreeScope.Peer && registeredPeers.length > 1 && (
        <>
          <div className="w-px h-6 bg-primary" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Peer:</span>
            {registeredPeers.map((peer) => (
              <button
                key={peer.cid.toString()}
                onClick={() => setSelectedPeerCid(peer.cid)}
                className={`px-2 py-1 text-xs rounded ${
                  selectedPeerCid === peer.cid
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground/80 hover:bg-border'
                }`}
              >
                {peerDisplayName({ cid: peer.cid, username: peer.username })}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Server storage indicator */}
      {storageMode === TreeScope.Server && (
        <>
          <div className="w-px h-6 bg-primary" />
          <span className="text-xs text-muted-foreground">
            Private encrypted storage on Citadel server
          </span>
        </>
      )}
    </div>
  );
}
