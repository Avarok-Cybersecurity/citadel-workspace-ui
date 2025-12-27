import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConnectionManager } from "@/lib/connection-manager";
import { websocketService } from "@/lib/websocket-service";
import WorkspaceService from "@/lib/workspace-service";
import type { ActiveSession } from "@/types/session-types";
import { OrphanSessionIcon } from "./OrphanSessionIcon";
import { DisconnectConfirmModal, type DisconnectAction } from "./DisconnectConfirmModal";
import { useToast } from "@/hooks/use-toast";
import { setSelectedUser } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";
import { notificationService, UnreadCountChange } from "@/lib/notification-service";
import { eventEmitter } from "@/lib/event-emitter";
import { getWorkspacePath } from "@/lib/workspace-navigation";

interface OrphanSessionWithWorkspace extends ActiveSession {
  workspaceName: string;
  storedSessionIndex: number;
  lastAccessed?: number; // Unix timestamp for ordering by most recently used
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
  const [notificationCounts, setNotificationCounts] = useState<Map<string, number>>(new Map());

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

          // Get last accessed time from localStorage, default to 0 for ordering
          const lastAccessedKey = `session_last_accessed_${activeSession.cid}`;
          const lastAccessed = parseInt(localStorage.getItem(lastAccessedKey) || '0', 10);

          return {
            ...activeSession,
            workspaceName: storedSession?.username || activeSession.username,
            storedSessionIndex: storedIndex,
            lastAccessed,
          };
        }
      );

      // Sort by most recently accessed (highest timestamp first)
      sessionsWithWorkspace.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

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
        // Now validates against server before syncing to filter out stale peers
        if (session.peer_connections) {
          await p2pRegistrationService.syncPeerConnectionsFromSession(session.peer_connections);
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

  // Subscribe to notification count changes
  useEffect(() => {
    const updateCounts = (change: UnreadCountChange) => {
      setNotificationCounts(new Map(change.byCid));
    };

    eventEmitter.on('unread-count-changed', updateCounts);

    // Initialize with current counts
    setNotificationCounts(notificationService.getUnreadCountsByCid());

    return () => {
      eventEmitter.off('unread-count-changed', updateCounts);
    };
  }, []);

  const handleNavigate = async (session: OrphanSessionWithWorkspace) => {
    try {
      console.log('OrphanSessionsNavbar: Navigating to workspace:', session.workspaceName);

      // Update last accessed time for ordering
      const lastAccessedKey = `session_last_accessed_${session.cid}`;
      localStorage.setItem(lastAccessedKey, Date.now().toString());

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
      navigate(getWorkspacePath());

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

  const handleConfirmDisconnect = async (action: DisconnectAction) => {
    if (!disconnectTarget) return;

    try {
      const cid = disconnectTarget.session.cid;
      console.log(`OrphanSessionsNavbar: ${action === 'deregister' ? 'Deregistering' : 'Disconnecting'} session:`, cid);

      // Stop WASM connection manager if this is the current session
      if (wasmConnectionManager.getCurrentCid() === cid) {
        wasmConnectionManager.stop();
      }

      if (action === 'deregister') {
        // Deregister permanently removes the account from the server
        await websocketService.deregister(cid);
        toast({
          title: "Account Deregistered",
          description: `${disconnectTarget.workspaceName} has been permanently removed from the server.`,
          className: "bg-red-900/80 border-red-800 text-white",
        });
      } else {
        // Disconnect just ends the session (temporary)
        await websocketService.disconnect(cid);
        toast({
          title: "Disconnected",
          description: `${disconnectTarget.workspaceName} session ended. You can reconnect later.`,
          className: "bg-[#343A5C] border-purple-800 text-purple-200",
        });
      }

      // Reload the active sessions list to update the navbar
      await loadActiveSessions();

      console.log(`OrphanSessionsNavbar: Successfully ${action === 'deregister' ? 'deregistered' : 'disconnected'}`);
    } catch (error) {
      console.error(`OrphanSessionsNavbar: Failed to ${action}:`, error);
      toast({
        title: "Error",
        description: `Failed to ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
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
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-[#1C1D28]/95 backdrop-blur-sm border-b border-gray-800"
        data-testid="previous-sessions-navbar"
      >
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-sm text-gray-400 font-medium whitespace-nowrap flex-shrink-0">
              Previous Sessions:
            </span>
            {/* Scrollable container for sessions */}
            <div
              className="flex items-center gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent pb-1"
              style={{
                scrollbarWidth: 'thin',
                msOverflowStyle: 'auto',
              }}
              data-testid="sessions-scroll-container"
            >
              {sessions.map((session) => (
                <OrphanSessionIcon
                  key={session.cid}
                  session={session}
                  workspaceName={session.workspaceName}
                  onNavigate={() => handleNavigate(session)}
                  onDisconnect={() => handleDisconnect(session)}
                  shouldGlow={glowingSessionCid === session.cid}
                  unreadCount={notificationCounts.get(session.cid) || 0}
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
