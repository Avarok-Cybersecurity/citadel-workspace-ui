import { forgetSession, withoutForgotten } from '@/lib/sessions/forgotten-sessions';
import { syncSelectedSessionToWasm } from './sync-selected-session-to-wasm';
import { useState, useCallback } from "react";
import type { UseOrphanSessionsResult } from './useOrphanSessions-types';
import { useAttentionGlow } from './use-attention-glow';
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
import { setSelectedUser } from "@/lib/tab-context";
import { wasmConnectionManager } from "@/lib/wasm-connection-manager";
import { startMessagingForSession } from "@/lib/start-messaging";
import { instanceManager, instanceChannel } from "@/lib/multi-instance";
import { notificationService, type UnreadCountChange } from "@/lib/notification-service";
import { getWorkspacePath } from "@/lib/workspace-navigation";
import { serverAutoConnectService } from "@/lib/server-auto-connect-service";
import { eventEmitter } from "@/lib/event-emitter";
import { postAuthSetup } from "@/lib/post-auth-setup";
import { debugLog } from '@/lib/debug-config';
import type { NavigateFunction } from 'react-router';
import { signOutSession, type SignOutResult, type SignOutTarget } from './sign-out-session';

export interface OrphanSessionWithWorkspace extends ActiveSession {
  workspaceName: string;
  storedSessionIndex: number;
  lastAccessed?: number;
}

export function useOrphanSessions(): UseOrphanSessionsResult {
  const navigate: NavigateFunction = useNavigate();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<OrphanSessionWithWorkspace[]>([]);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    session: ActiveSession;
    workspaceName: string;
  } | null>(null);
  const { glowing: glowingSessionCid, observe } = useAttentionGlow();
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
      const visibleSessions: typeof activeSessions = withoutForgotten(activeSessions);

      const storedSessions: StoredSessions = connectionManager.getStoredSessions();

      const sessionsWithWorkspace: OrphanSessionWithWorkspace[] = withWorkspaceNames(
        visibleSessions,
        storedSessions.sessions,
        readLastAccessed,
      );
      setSessions(sessionsWithWorkspace);

      await syncSelectedSessionToWasm(sessionsWithWorkspace);
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
    const target: SignOutTarget = {
      cid: disconnectTarget.session.cid,
      username: disconnectTarget.session.username,
      serverAddress: disconnectTarget.session.server_address,
    };

    setDisconnectTarget(null);
    setLoadingModal({ open: true, status: "disconnecting", workspaceName });

    const result: SignOutResult = await signOutSession(
      {
        markUserDisconnected: (username, serverAddress) =>
          serverAutoConnectService.markUserDisconnected(username, serverAddress),
        currentWasmCid: () => wasmConnectionManager.getCurrentCid(),
        stopWasm: () => wasmConnectionManager.stop(),
        deregister: (cid) => websocketService.deregister(cid),
        disconnect: (cid) => websocketService.disconnect(cid),
        invalidateSessionCache: () => connectionManager.invalidateSessionCache(),
        removeSession: (username, serverAddress) =>
          connectionManager.removeSession(username, serverAddress),
        forget: (cid) => {
          // Both: the state now, and every list until the server agrees.
          forgetSession(cid);
          setSessions(prev => prev.filter(s => s.cid !== cid));
        },
        reload: () => loadActiveSessions(),
      },
      target,
      action,
      () => setLoadingModal(prev => ({ ...prev, status: "cleaning" })),
    );

    if (result.status === 'done') {
      setLoadingModal(prev => ({ ...prev, status: "ready" }));
      return;
    }

    setLoadingModal(prev => ({ ...prev, status: "error", errorMessage: result.message }));
    // A refusal is a decision the user can act on and stays until dismissed; a
    // failure is transient and clears itself, as it always has.
    if (result.status === 'failed') {
      setTimeout(() => { setLoadingModal(prev => ({ ...prev, open: false })); }, 3000);
    }
  };

  const handleLoadingComplete = (): void => {
    setLoadingModal(prev => ({ ...prev, open: false }));
  };

  // WebSocket connection success handler
  const handleWsConnectionSuccess: () => Promise<void> = useCallback(async (): Promise<void> => {
    debugLog('OrphanSessionsNavbar', 'WebSocket connected, reloading sessions...');
    await loadActiveSessions();
  }, [loadActiveSessions]);

  useEventListener('on-ws-connection-success', handleWsConnectionSuccess);

  // Notification count handler
  const handleUnreadCountChanged: (change: UnreadCountChange) => void = useCallback((change: UnreadCountChange): void => {
    const next: Map<string, number> = new Map(change.byCid);
    setNotificationCounts(next);
    // The glow the chip was built for, and which nothing used to start.
    observe(next);
  }, [observe]);

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
    notificationService,
  };
}
