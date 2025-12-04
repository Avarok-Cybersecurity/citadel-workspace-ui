import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConnectionManager } from "@/lib/connection-manager";
import { websocketService } from "@/lib/websocket-service";
import WorkspaceService from "@/lib/workspace-service";
import type { ActiveSession } from "@/types/session-types";
import { OrphanSessionIcon } from "./OrphanSessionIcon";
import { DisconnectConfirmModal } from "./DisconnectConfirmModal";
import { useToast } from "@/hooks/use-toast";
import { setSelectedUser } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";

interface OrphanSessionWithWorkspace extends ActiveSession {
  workspaceName: string;
  storedSessionIndex: number;
}

export const OrphanSessionsNavbar = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<OrphanSessionWithWorkspace[]>([]);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    session: ActiveSession;
    workspaceName: string;
  } | null>(null);
  const [glowingSessionCid, setGlowingSessionCid] = useState<string | null>(null);

  // Fetch active sessions and map to workspace data
  const loadActiveSessions = async () => {
    try {
      const connectionManager = ConnectionManager.getInstance();

      // Wait for connection manager to be ready before getting sessions
      // This prevents race conditions during component initialization
      await connectionManager.waitForReady();

      // Get active sessions from internal service
      const activeSessions = await connectionManager.getActiveSessions();

      // Get stored sessions to map workspace names
      const storedSessions = connectionManager.getStoredSessions();

      // Map active sessions to workspace data
      const sessionsWithWorkspace: OrphanSessionWithWorkspace[] = activeSessions.map(
        (activeSession: ActiveSession) => {
          // Find matching stored session
          const storedIndex = storedSessions.sessions.findIndex(
            (stored) =>
              stored.username === activeSession.username &&
              stored.serverAddress === activeSession.server_address
          );

          const storedSession = storedSessions.sessions[storedIndex];

          return {
            ...activeSession,
            workspaceName: storedSession?.username || activeSession.username,
            storedSessionIndex: storedIndex,
          };
        }
      );

      setSessions(sessionsWithWorkspace);
      console.log('OrphanSessionsNavbar: Loaded active sessions:', sessionsWithWorkspace);

      // Add ALL active sessions to WASM connection manager for P2P messaging support
      // This ensures messenger handles are maintained for all sessions, not just the current one
      for (const session of sessionsWithWorkspace) {
        try {
          await wasmConnectionManager.addSession(session.cid);
          console.log('OrphanSessionsNavbar: Added session to WASM manager:', session.cid);
        } catch (err) {
          console.error('OrphanSessionsNavbar: Failed to add session to WASM manager:', session.cid, err);
        }

        // Sync peer connections from GetSessions data to p2pRegistrationService
        // This is more reliable than ListRegisteredPeers when sessions are claimed/switched
        if (session.peer_connections) {
          p2pRegistrationService.syncPeerConnectionsFromSession(session.peer_connections);
          console.log('OrphanSessionsNavbar: Synced peer connections for session:', session.cid);
        }
      }
    } catch (error) {
      console.error('OrphanSessionsNavbar: Failed to load active sessions:', error);
      setSessions([]);
    }
  };

  useEffect(() => {
    loadActiveSessions();
  }, []);

  const handleNavigate = async (session: OrphanSessionWithWorkspace) => {
    try {
      console.log('OrphanSessionsNavbar: Navigating to workspace:', session.workspaceName);

      // Show loading toast
      toast({
        title: "Reconnecting...",
        description: `Loading ${session.workspaceName}`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });

      const connectionManager = ConnectionManager.getInstance();

      // Try to claim the session if it's orphaned
      // Note: If the session is still active (not orphaned), this will fail with "not orphaned"
      // In that case, we can skip the claim and just navigate directly
      try {
        await websocketService.claimSession(session.cid, true);
        console.log('OrphanSessionsNavbar: Session claimed successfully (was orphaned)');
      } catch (claimError: any) {
        if (claimError?.message?.includes('not orphaned')) {
          console.log('OrphanSessionsNavbar: Session is still active (not orphaned), no claim needed');
        } else {
          // Re-throw if it's a different error
          throw claimError;
        }
      }

      // Set the active session index
      if (session.storedSessionIndex >= 0) {
        await connectionManager.setActiveSessionIndex(session.storedSessionIndex);
      }

      // Update tab context to track which workspace this tab is viewing
      setSelectedUser({
        selectedUsername: session.username,
        selectedServerAddress: session.server_address,
        selectedCid: session.cid
      });

      // Set the connection ID in WorkspaceService (the session is already connected/claimed)
      WorkspaceService.setConnectionId(session.cid);

      // Start WASM connection manager for this CID (handles leader/follower transitions)
      try {
        await wasmConnectionManager.start(session.cid);
        console.log('OrphanSessionsNavbar: WASM connection manager started for CID:', session.cid);
      } catch (error) {
        console.error('OrphanSessionsNavbar: Failed to start WASM connection manager:', error);
        // Don't block navigation - P2P messaging may not be immediately needed
      }

      // Trigger workspace loading
      WorkspaceService.loadWorkspace();
      WorkspaceService.listOffices();

      // Navigate to the office page immediately
      navigate('/office');

      // Show success toast
      toast({
        title: "Connected!",
        description: `Now viewing ${session.workspaceName}`,
        className: "bg-[#343A5C] border-purple-800 text-purple-200",
      });
    } catch (error) {
      console.error('OrphanSessionsNavbar: Failed to navigate to workspace:', error);
      toast({
        title: "Connection Failed",
        description: "Could not reconnect to workspace. Please try logging in again.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = (session: OrphanSessionWithWorkspace) => {
    setDisconnectTarget({
      session,
      workspaceName: session.workspaceName,
    });
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;

    try {
      console.log('OrphanSessionsNavbar: Disconnecting session:', disconnectTarget.session.cid);

      // Stop WASM connection manager if this is the current session
      if (wasmConnectionManager.getCurrentCid() === disconnectTarget.session.cid) {
        wasmConnectionManager.stop();
      }

      // Disconnect the specific session via WebSocket service
      await websocketService.disconnect(disconnectTarget.session.cid);

      // Reload the active sessions list to update the navbar
      await loadActiveSessions();

      console.log('OrphanSessionsNavbar: Successfully disconnected');
    } catch (error) {
      console.error('OrphanSessionsNavbar: Failed to disconnect:', error);
    } finally {
      setDisconnectTarget(null);
    }
  };

  // Trigger glowing effect on a session
  const triggerGlow = (cid: string) => {
    setGlowingSessionCid(cid);

    // Remove glow after 4 seconds
    setTimeout(() => {
      setGlowingSessionCid(null);
    }, 4000);
  };

  // Don't render if no active sessions
  if (sessions.length === 0) {
    return null;
  }

  return (
    <>
      {/* Navbar container */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#1C1D28]/95 backdrop-blur-sm border-b border-gray-800">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 font-medium">Active Workspaces:</span>
            <div className="flex items-center gap-4">
              {sessions.map((session) => (
                <OrphanSessionIcon
                  key={session.cid}
                  session={session}
                  workspaceName={session.workspaceName}
                  onNavigate={() => handleNavigate(session)}
                  onDisconnect={() => handleDisconnect(session)}
                  shouldGlow={glowingSessionCid === session.cid}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Disconnect confirmation modal */}
      <DisconnectConfirmModal
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        session={disconnectTarget?.session || null}
        workspaceName={disconnectTarget?.workspaceName || null}
        onConfirm={handleConfirmDisconnect}
      />
    </>
  );
};
