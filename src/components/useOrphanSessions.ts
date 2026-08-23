import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { connectionManager } from "@/lib/connection";
import { websocketService } from "@/lib/websocket-service";
import type { ActiveSession } from "@/types/session-types";
import type { DisconnectAction } from "./DisconnectConfirmModal";
import type { DisconnectStatus } from "./LoadingModal";
import { useToast, useEventListener } from "@/hooks";
import { setSelectedUser, getSelectedUser } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { instanceManager, instanceChannel } from "@/lib/multi-instance";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";
import { notificationService, type UnreadCountChange } from "@/lib/notification-service";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { serverAutoConnectService } from "@/lib/server-auto-connect-service";
import { eventEmitter } from "@/lib/event-emitter";
import { postAuthSetup } from "@/lib/post-auth-setup";
import { debugLog } from '@/lib/debug-config';

export interface OrphanSessionWithWorkspace extends ActiveSession {
  workspaceName: string;
  storedSessionIndex: number;
  lastAccessed?: number;
}

export function useOrphanSessions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<OrphanSessionWithWorkspace[]>([]);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    session: ActiveSession;
    workspaceName: string;
  } | null>(null);
  const [glowingSessionCid, setGlowingSessionCid] = useState<bigint | null>(null);
  const [notificationCounts, setNotificationCounts] = useState<Map<string, number>>(new Map());

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

  const loadActiveSessions = useCallback(async () => {
    try {
      await connectionManager.waitForReady();
      const activeSessions = await connectionManager.getActiveSessions();
      const storedSessions = connectionManager.getStoredSessions();

      const sessionsWithWorkspace: OrphanSessionWithWorkspace[] = activeSessions.map(
        (activeSession: ActiveSession) => {
          const storedIndex = storedSessions.sessions.findIndex(
            (stored) =>
              stored.username === activeSession.username &&
              stored.serverAddress === activeSession.server_address
          );
          const storedSession = storedSessions.sessions[storedIndex];
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

      sessionsWithWorkspace.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      setSessions(sessionsWithWorkspace);
      debugLog('OrphanSessionsNavbar', 'Loaded active sessions:', sessionsWithWorkspace);

      const tabSelection = await getSelectedUser();
      if (tabSelection?.selectedCid) {
        const sel = sessionsWithWorkspace.find(s => s.cid === tabSelection.selectedCid);
        if (sel?.cid !== undefined) {
          try {
            await wasmConnectionManager.addSession(sel.cid.toString());
            if (sel.peer_connections) {
              p2pRegistrationService.syncPeerConnectionsFromSession(sel.peer_connections).catch(() => {});
            }
          } catch (_) { /* WASM add session best-effort */ }
        }
      }
    } catch (error) {
      debugLog('OrphanSessionsNavbar', 'Failed to load active sessions:', error);
      setSessions([]);
    }
  }, []);

  const handleNavigate = async (session: OrphanSessionWithWorkspace) => {
    try {
      debugLog('OrphanSessionsNavbar', 'Navigating to workspace:', session.workspaceName);

      const lastAccessedKey = `session_last_accessed_${session.cid}`;
      localStorage.setItem(lastAccessedKey, Date.now().toString());

      toast({
        title: "Reconnecting...",
        description: `Loading ${session.workspaceName}`,
        variant: 'success',
      });

      try { await websocketService.claimSession(session.cid, true); }
      catch (e: unknown) {
        if (!(e instanceof Error && e.message?.includes('not orphaned'))) throw e;
      }

      if (session.storedSessionIndex >= 0) await connectionManager.setActiveSessionIndex(session.storedSessionIndex);
      await setSelectedUser({
        selectedUsername: session.username, selectedServerAddress: session.server_address, selectedCid: session.cid
      });

      instanceManager.setCid(session.cid);
      instanceChannel.announcePresence();

      // Single source of truth for post-auth setup. Previously this branch
      // hand-rolled `setConnectionId → loadWorkspace → listNodes` and
      // missed `getTreeSchema`, leaving the orphan-claim path divergent
      // from the login path. Using postAuthSetup keeps the two paths
      // aligned and ensures any future steps added to postAuthSetup are
      // applied uniformly.
      await postAuthSetup(session.cid);

      try { await wasmConnectionManager.start(session.cid.toString()); }
      catch (_) { /* WASM start best-effort */ }

      eventEmitter.emit('session:activated', {
        cid: session.cid.toString(), username: session.username,
        serverAddress: session.server_address, activationType: 'claim' as const
      });

      navigate(getWorkspacePath());

      toast({
        title: "Connected!",
        description: `Now viewing ${session.workspaceName}`,
        variant: 'success',
      });
    } catch (error) {
      debugLog('OrphanSessionsNavbar', 'Failed to navigate to workspace:', error);
      toast({
        title: "Connection Failed",
        description: "Could not reconnect to workspace. Please try logging in again.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = (session: OrphanSessionWithWorkspace) => {
    setDisconnectTarget({ session, workspaceName: session.workspaceName });
  };

  const handleConfirmDisconnect = async (action: DisconnectAction) => {
    if (!disconnectTarget) return;

    const workspaceName = disconnectTarget.workspaceName;
    const cid = disconnectTarget.session.cid;
    const username = disconnectTarget.session.username;
    const serverAddress = disconnectTarget.session.server_address;

    setDisconnectTarget(null);
    setLoadingModal({ open: true, status: "disconnecting", workspaceName });

    try {
      debugLog('OrphanSessionsNavbar', `${action === 'deregister' ? 'Deregistering' : 'Disconnecting'} session:`, cid);

      await serverAutoConnectService.markUserDisconnected(username, serverAddress);

      if (cid !== undefined && wasmConnectionManager.getCurrentCid() === cid.toString()) {
        wasmConnectionManager.stop();
      }

      if (action === 'deregister') {
        await websocketService.deregister(cid);
      } else {
        await websocketService.disconnect(cid);
      }

      connectionManager.invalidateSessionCache();
      await connectionManager.removeSession(username, serverAddress);

      setLoadingModal(prev => ({ ...prev, status: "cleaning" }));
      await loadActiveSessions();
      setLoadingModal(prev => ({ ...prev, status: "ready" }));

      debugLog('OrphanSessionsNavbar', `Successfully ${action === 'deregister' ? 'deregistered' : 'disconnected'}`);
    } catch (error) {
      debugLog('OrphanSessionsNavbar', `Failed to ${action}:`, error);
      setLoadingModal(prev => ({
        ...prev,
        status: "error",
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }));

      setTimeout(() => {
        setLoadingModal(prev => ({ ...prev, open: false }));
      }, 3000);
    }
  };

  const handleLoadingComplete = () => {
    setLoadingModal(prev => ({ ...prev, open: false }));
  };

  const triggerGlow = (cid: bigint) => {
    setGlowingSessionCid(cid);
    setTimeout(() => { setGlowingSessionCid(null); }, 4000);
  };

  // WebSocket connection success handler
  const handleWsConnectionSuccess = useCallback(async () => {
    debugLog('OrphanSessionsNavbar', 'WebSocket connected, reloading sessions...');
    await loadActiveSessions();
  }, [loadActiveSessions]);

  useEventListener('on-ws-connection-success', handleWsConnectionSuccess);

  // Notification count handler
  const handleUnreadCountChanged = useCallback((change: UnreadCountChange) => {
    setNotificationCounts(new Map(change.byCid));
  }, []);

  useEventListener<UnreadCountChange>('unread-count-changed', handleUnreadCountChanged);

  return {
    sessions,
    disconnectTarget,
    setDisconnectTarget,
    glowingSessionCid,
    notificationCounts,
    loadingModal,
    loadActiveSessions,
    handleNavigate,
    handleDisconnect,
    handleConfirmDisconnect,
    handleLoadingComplete,
    triggerGlow,
    notificationService,
  };
}
