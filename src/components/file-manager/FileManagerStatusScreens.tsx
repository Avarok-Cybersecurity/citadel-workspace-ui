import { Loader2, Users, FolderOpen, Server, RefreshCw } from "lucide-react";

interface ConnectingScreenProps {}

export function ConnectingScreen(_props: ConnectingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-4 p-8">
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
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-4 p-8">
      <Users className="h-12 w-12" />
      <h2 className="text-xl text-foreground">No Peers Connected</h2>
      <p className="text-sm text-center max-w-md">
        Register a P2P peer to start using the shared file system,
        or use Server Storage for private encrypted files.
      </p>
      <button
        onClick={onSwitchToServer}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
      >
        <Server className="h-4 w-4" />
        Use Server Storage
      </button>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-4">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p>Loading file system...</p>
    </div>
  );
}

interface ErrorScreenProps {
  error: string | null;
  /**
   * Re-fetch the tree. The hook has always exposed this; the screen just never
   * offered it, so one timed-out fetch on a flaky link (the tree request has a
   * 30s budget) painted a permanent dead end for what was a transient blip.
   * The only way out was to navigate away and back.
   */
  onRetry: () => void;
}

export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-4 p-8">
      <FolderOpen className="h-12 w-12" />
      <h2 className="text-xl text-foreground">File System Error</h2>
      <p className="text-sm text-center max-w-md">{error ?? 'Failed to load tree'}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try Again
      </button>
    </div>
  );
}
