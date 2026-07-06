import { Loader2, Users, FolderOpen, Server } from "lucide-react";
import { TreeScope } from "@/types/revfs-types";

interface ConnectingScreenProps {}

export function ConnectingScreen(_props: ConnectingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1C1D28] text-gray-400 gap-4 p-8">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p>Connecting...</p>
    </div>
  );
}

interface NoPeersScreenProps {
  onSwitchToServer: () => void;
}

export function NoPeersScreen({ onSwitchToServer }: NoPeersScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1C1D28] text-gray-400 gap-4 p-8">
      <Users className="h-12 w-12" />
      <h2 className="text-xl text-white">No Peers Connected</h2>
      <p className="text-sm text-center max-w-md">
        Register a P2P peer to start using the shared file system,
        or use Server Storage for private encrypted files.
      </p>
      <button
        onClick={onSwitchToServer}
        className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded hover:bg-purple-600 transition-colors"
      >
        <Server className="h-4 w-4" />
        Use Server Storage
      </button>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1C1D28] text-gray-400 gap-4">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p>Loading file system...</p>
    </div>
  );
}

interface ErrorScreenProps {
  error: string | null;
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1C1D28] text-gray-400 gap-4 p-8">
      <FolderOpen className="h-12 w-12" />
      <h2 className="text-xl text-white">File System Error</h2>
      <p className="text-sm">{error ?? 'Failed to load tree'}</p>
    </div>
  );
}
