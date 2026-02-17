import { UserCircle2, Server } from "lucide-react";
import { TreeScope } from "@/types/revfs-types";
import type { Peer } from "@/lib/p2p-registration-service";

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
    <div className="flex items-center gap-4 px-4 py-2 border-b border-purple-800 bg-[#2E3450]">
      {/* Storage mode tabs */}
      <div className="flex items-center gap-1 bg-[#1E2235] rounded p-1">
        <button
          onClick={() => setStorageMode(TreeScope.Peer)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
            storageMode === TreeScope.Peer
              ? 'bg-purple-700 text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <UserCircle2 className="h-3.5 w-3.5" />
          P2P Storage
        </button>
        <button
          onClick={() => setStorageMode(TreeScope.Server)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
            storageMode === TreeScope.Server
              ? 'bg-purple-700 text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          Server Storage
        </button>
      </div>

      {/* Peer selector (only in P2P mode with multiple peers) */}
      {storageMode === TreeScope.Peer && registeredPeers.length > 1 && (
        <>
          <div className="w-px h-6 bg-purple-800" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Peer:</span>
            {registeredPeers.map((peer) => (
              <button
                key={peer.cid.toString()}
                onClick={() => setSelectedPeerCid(peer.cid)}
                className={`px-2 py-1 text-xs rounded ${
                  selectedPeerCid === peer.cid
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#444A6C] text-gray-300 hover:bg-[#555B8C]'
                }`}
              >
                {peer.username ?? peer.cid.toString().slice(0, 8)}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Server storage indicator */}
      {storageMode === TreeScope.Server && (
        <>
          <div className="w-px h-6 bg-purple-800" />
          <span className="text-xs text-gray-400">
            Private encrypted storage on Citadel server
          </span>
        </>
      )}
    </div>
  );
}
