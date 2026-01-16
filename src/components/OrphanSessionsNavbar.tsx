import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { connectionManager } from "@/lib/connection-manager";
import { websocketService } from "@/lib/websocket-service";
import WorkspaceService from "@/lib/workspace-service";
import type { ActiveSession } from "@/types/session-types";
import { OrphanSessionIcon } from "./OrphanSessionIcon";
import { DisconnectConfirmModal, type DisconnectAction } from "./DisconnectConfirmModal";
import { DisconnectLoadingModal, type DisconnectStatus } from "./LoadingModal";
import { useToast } from "@/hooks/use-toast";
import { setSelectedUser, getSelectedUser } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { instanceManager } from "@/lib/instance-manager";
import { instanceChannel } from "@/lib/instance-channel";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";
import { notificationService, UnreadCountChange } from "@/lib/notification-service";
import { eventEmitter } from "@/lib/event-emitter";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { serverAutoConnectService } from "@/lib/server-auto-connect-service";

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
  const [glowingSessionCid, setGlowingSessionCid] = useState<bigint | null>(null);
  const [notificationCounts, setNotificationCounts] = useState<Map<string, number>>(new Map());

  // Loading modal state for disconnect flow
  const [loadingModal, setLoadingModal] = useState<{
    open: boolean;
    status: DisconnectStatus;
    workspaceName: string;
    errorMessage?: string;
  }>({
    open: false,
    status: "disconnecting",
    workspaceName: "",
  });

  // Fetch active sessions and map to workspace data
  const loadActiveSessions = async () => {
    try {
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

      // CRITICAL: Each tab should only manage its OWN session's WASM connection
      // Do NOT add ALL sessions - that causes Tab 2 to open messenger handles for Tab 1's CID
      // The WASM connection manager is set up in handleNavigate() when user explicitly selects a session
      const tabSelection = await getSelectedUser();

      if (tabSelection?.selectedCid) {
        // Only set up WASM for this tab's selected session
        const selectedSession = sessionsWithWorkspace.find(s => s.cid === tabSelection.selectedCid);
        if (selectedSession && selectedSession.cid !== undefined) {
          try {
            await wasmConnectionManager.addSession(selectedSession.cid.toString());
            console.log('OrphanSessionsNavbar: Added THIS TAB\'s session to WASM manager:', selectedSession.cid.toString());

            // Sync peer connections only for this tab's session
            if (selectedSession.peer_connections) {
              p2pRegistrationService.syncPeerConnectionsFromSession(selectedSession.peer_connections)
                .then(() => console.log('OrphanSessionsNavbar: Synced peer connections for session:', selectedSession.cid?.toString()))
                .catch(err => console.error('OrphanSessionsNavbar: Failed to sync peer connections:', selectedSession.cid?.toString(), err));
            }
          } catch (err) {
            console.error('OrphanSessionsNavbar: Failed to add session to WASM manager:', selectedSession.cid?.toString(), err);
          }
        }
      } else {
        console.log('OrphanSessionsNavbar: No tab selection - user must explicitly choose a session');
        // Do NOT automatically add any sessions - each tab must explicitly select its session
      }
    } catch (error) {
      console.error('OrphanSessionsNavbar: Failed to load active sessions:', error);
      setSessions([]);
    }
  };

  useEffect(() => {
    // Try to load immediately (will return empty if WebSocket not connected yet)
    void loadActiveSessions();

    // Also listen for WebSocket connection success to reload sessions
    // This handles the case where component mounts before WebSocket is ready
    const unsubscribe = eventEmitter.on('on-ws-connection-success', () => {
      console.log('OrphanSessionsNavbar: WebSocket connected, reloading sessions...');
      void loadActiveSessions();
    });

    return () => {
      unsubscribe();
    };
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
      void setSelectedUser({
        selectedUsername: session.username,
        selectedServerAddress: session.server_address,
        selectedCid: session.cid
      });

      // Update instance manager with this tab's designated CID
      // This is the "Instance = CID" pattern from the new architecture
      instanceManager.setCid(session.cid);
      instanceChannel.announcePresence();
      console.log('OrphanSessionsNavbar: Set instanceManager CID to', session.cid);

      // Set the connection ID in WorkspaceService (the session is already connected/claimed)
      WorkspaceService.setConnectionId(session.cid);

      // Start WASM connection manager for this CID (handles leader/follower transitions)
      try {
        await wasmConnectionManager.start(session.cid!.toString());
        console.log('OrphanSessionsNavbar: WASM connection manager started for CID:', session.cid?.toString());
      } catch (error) {
        console.error('OrphanSessionsNavbar: Failed to start WASM connection manager:', error);
        // Don't block navigation - P2P messaging may not be immediately needed
      }

      // CRITICAL: Emit session:activated to trigger P2P reconnection
      // This ensures ILM can deliver queued messages after ClaimSession
      eventEmitter.emit('session:activated', {
        cid: session.cid!.toString(),
        username: session.username,
        serverAddress: session.server_address,
        activationType: 'claim' as const
      });
      console.log('OrphanSessionsNavbar: Emitted session:activated for ClaimSession');

      // Trigger workspace loading
      void WorkspaceService.loadWorkspace();
      void WorkspaceService.listOffices();

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

    const workspaceName = disconnectTarget.workspaceName;
    const cid = disconnectTarget.session.cid;
    const username = disconnectTarget.session.username;
    const serverAddress = disconnectTarget.session.server_address;

    // Close the confirm modal and show the loading modal
    setDisconnectTarget(null);
    setLoadingModal({
      open: true,
      status: "disconnecting",
      workspaceName,
    });

    try {
      console.log(`OrphanSessionsNavbar: ${action === 'deregister' ? 'Deregistering' : 'Disconnecting'} session:`, cid);

      // Mark as user-disconnected BEFORE disconnecting to prevent auto-reconnect race
      // This respects user intent - if they explicitly disconnect, don't auto-reconnect
      serverAutoConnectService.markUserDisconnected(username, serverAddress);

      // Stop WASM connection manager if this is the current session
      if (cid !== undefined && wasmConnectionManager.getCurrentCid() === cid.toString()) {
        wasmConnectionManager.stop();
      }

      // Update status to show we're disconnecting (spinner)
      // The websocketService.disconnect() and deregister() now wait for
      // the actual DisconnectNotification/DeregisterSuccess signals from the backend
      // before resolving - no more sleeping!

      if (action === 'deregister') {
        // Deregister permanently removes the account from the server
        // This returns only after DeregisterSuccess signal is received
        await websocketService.deregister(cid);
      } else {
        // Disconnect just ends the session (temporary)
        // This returns only after DisconnectNotification signal is received
        await websocketService.disconnect(cid);
      }

      // CRITICAL: Invalidate the session cache to ensure loadActiveSessions() fetches fresh data
      // Without this, the 2-second cache TTL causes stale sessions to appear in navbar
      connectionManager.invalidateSessionCache();

      // Remove session from stored sessions (browser storage)
      // After explicit disconnect/deregister, user doesn't want session saved
      await connectionManager.removeSession(username, serverAddress);

      // Update status to cleaning - backend has confirmed disconnect, now update local state
      setLoadingModal(prev => ({ ...prev, status: "cleaning" }));

      // Reload the active sessions list to update the navbar
      // No artificial delay needed - backend has already confirmed cleanup via signal
      await loadActiveSessions();

      // Show ready status
      setLoadingModal(prev => ({ ...prev, status: "ready" }));

      console.log(`OrphanSessionsNavbar: Successfully ${action === 'deregister' ? 'deregistered' : 'disconnected'}`);
    } catch (error) {
      console.error(`OrphanSessionsNavbar: Failed to ${action}:`, error);
      setLoadingModal(prev => ({
        ...prev,
        status: "error",
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }));

      // Auto-close error modal after 3 seconds
      setTimeout(() => {
        setLoadingModal(prev => ({ ...prev, open: false }));
      }, 3000);
    }
  };

  // Handle loading modal completion
  const handleLoadingComplete = () => {
    setLoadingModal(prev => ({ ...prev, open: false }));
  };

  // Trigger glowing effect on a session
  const triggerGlow = (cid: bigint) => {
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
                  key={session.cid?.toString()}
                  session={session}
                  workspaceName={session.workspaceName}
                  onNavigate={() => handleNavigate(session)}
                  onDisconnect={() => handleDisconnect(session)}
                  shouldGlow={glowingSessionCid === session.cid}
                  unreadCount={notificationCounts.get(session.cid?.toString() ?? '') || 0}
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

      {/* Loading modal for disconnect progress */}
      <DisconnectLoadingModal
        open={loadingModal.open}
        status={loadingModal.status}
        workspaceName={loadingModal.workspaceName}
        errorMessage={loadingModal.errorMessage}
        onComplete={handleLoadingComplete}
      />
    </>
  );
};
