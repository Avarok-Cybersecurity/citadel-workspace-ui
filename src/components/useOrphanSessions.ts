import { useState, useCallback } from "react";
import { readLastLocation } from '@/lib/sessions/last-location';
import { claimSessionForThisTab, SESSION_OWNED_ELSEWHERE , type ClaimOutcome } from '@/lib/sessions/claim-session';
import { describeFailure } from '@/lib/failure-message';
import { withWorkspaceNames } from '@/lib/sessions/with-workspace';
import { markLastAccessed, readLastAccessed } from '@/lib/sessions/last-accessed';
import { useNavigate } from "react-router-dom";
import { connectionManager } from "@/lib/connection";
import { websocketService } from "@/lib/websocket-service";
import type { ActiveSession, StoredSessions } from "@/types/session-types";
import type { DisconnectAction } from "./DisconnectConfirmModal";
import type { DisconnectStatus } from "./LoadingModal";
import { useToast, useEventListener } from "@/hooks";
import { setSelectedUser, getSelectedUser , type TabUserContext } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { startMessagingForSession } from "@/lib/start-messaging";
import { instanceManager, instanceChannel } from "@/lib/multi-instance";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";
import { notificationService, type UnreadCountChange } from "@/lib/notification-service";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { serverAutoConnectService } from "@/lib/server-auto-connect-service";
import { eventEmitter } from "@/lib/event-emitter";
import { postAuthSetup } from "@/lib/post-auth-setup";
import { debugLog } from '@/lib/debug-config';
import type { NavigateFunction } from 'react-router';

export interface OrphanSessionWithWorkspace extends ActiveSession {
  workspaceName: string;
  storedSessionIndex: number;
  lastAccessed?: number;
}

export function useOrphanSessions() {
  const navigate: NavigateFunction = useNavigate();
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

  const loadActiveSessions: () => Promise<void> = useCallback(async (): Promise<void> => {
    try {
      await connectionManager.waitForReady();
      const { ok, sessions: activeSessions } = await connectionManager.getActiveSessionsResult();
      // A query that was never answered is not the answer "no sessions". The
      // navbar renders nothing at zero, so treating a timeout as emptiness made
      // the Active Sessions strip disappear and the user log in again -- and
      // CIDs are permanent, so a stale list is strictly better than an empty
      // one here.
      if (!ok) return;
      const storedSessions: StoredSessions = connectionManager.getStoredSessions();

      const sessionsWithWorkspace: OrphanSessionWithWorkspace[] = withWorkspaceNames(
        activeSessions,
        storedSessions.sessions,
        readLastAccessed,
      );
      setSessions(sessionsWithWorkspace);
      debugLog('OrphanSessionsNavbar', 'Loaded active sessions:', sessionsWithWorkspace);

      const tabSelection: TabUserContext | null = await getSelectedUser();
      if (tabSelection?.selectedCid) {
        const sel: OrphanSessionWithWorkspace | undefined = sessionsWithWorkspace.find(s => s.cid === tabSelection.selectedCid);
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
      // Keep whatever was last known good. Clearing here asserted "you have no
      // sessions" on the strength of a failure.
      debugLog('OrphanSessionsNavbar', 'Failed to load active sessions:', error);
    }
  }, []);

  const handleNavigate = async (session: OrphanSessionWithWorkspace): Promise<void> => {
    try {
      debugLog('OrphanSessionsNavbar', 'Navigating to workspace:', session.workspaceName);

      markLastAccessed(session.cid);

      toast({
        title: "Reconnecting...",
        description: `Loading ${session.workspaceName}`,
        variant: 'success',
      });

      const outcome: ClaimOutcome = await claimSessionForThisTab(session.cid);
      if (outcome.status === 'owned-by-another-tab') {
        toast(SESSION_OWNED_ELSEWHERE);
        return;
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

      // Was `catch (_) { }`. Best-effort is fine; invisible is not -- a claim
      // that brought back a session with dead messaging looked exactly like one
      // that worked.
      await startMessagingForSession(session.cid.toString());

      eventEmitter.emit('session:activated', {
        cid: session.cid.toString(), username: session.username,
        serverAddress: session.server_address, activationType: 'claim' as const
      });

      // Back where they were, when there is a where. An in-tab refresh keeps
      // its place because the URL is the state; this path -- the actual second
      // session, from the landing page -- navigated to the workspace root with
      // no params, so a user who closed the browser mid-conversation landed on
      // the default office and re-found it by hand, every day.
      navigate(readLastLocation(session.cid) ?? getWorkspacePath());

      toast({
        title: "Connected!",
        description: `Now viewing ${session.workspaceName}`,
        variant: 'success',
      });
    } catch (error) {
      debugLog('OrphanSessionsNavbar', 'Failed to navigate to workspace:', error);
      toast({
        title: "Connection Failed",
        description: describeFailure(error, "Could not reconnect to workspace. Please try logging in again."),
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = (session: OrphanSessionWithWorkspace): void => {
    setDisconnectTarget({ session, workspaceName: session.workspaceName });
  };

  const handleConfirmDisconnect = async (action: DisconnectAction): Promise<void> => {
    if (!disconnectTarget) return;

    const workspaceName: string = disconnectTarget.workspaceName;
    const cid: bigint = disconnectTarget.session.cid;
    const username: string = disconnectTarget.session.username;
    const serverAddress: string = disconnectTarget.session.server_address;

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

  const handleLoadingComplete = (): void => {
    setLoadingModal(prev => ({ ...prev, open: false }));
  };

  const triggerGlow = (cid: bigint): void => {
    setGlowingSessionCid(cid);
    setTimeout(() => { setGlowingSessionCid(null); }, 4000);
  };

  // WebSocket connection success handler
  const handleWsConnectionSuccess: () => Promise<void> = useCallback(async (): Promise<void> => {
    debugLog('OrphanSessionsNavbar', 'WebSocket connected, reloading sessions...');
    await loadActiveSessions();
  }, [loadActiveSessions]);

  useEventListener('on-ws-connection-success', handleWsConnectionSuccess);

  // Notification count handler
  const handleUnreadCountChanged: (change: UnreadCountChange) => void = useCallback((change: UnreadCountChange): void => {
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
