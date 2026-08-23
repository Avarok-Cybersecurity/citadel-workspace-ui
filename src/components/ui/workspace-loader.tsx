import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ConnectionService } from '@/lib/connection-service';
import { ConnectionManager } from '@/lib/connection';
import { websocketService } from '@/lib/websocket-service';
import { postAuthSetup } from '@/lib/post-auth-setup';
import { setSelectedUser, getSelectedUser, clearSelectedUser } from '@/lib/tab-context';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { TIMEOUT } from '@/lib/timeout-constants';
import { WorkspaceLoaderSpinner } from './workspace-loader-ui';

interface WorkspaceLoaderProps {
  children: React.ReactNode;
}

/**
 * A component that only renders its children when the workspace is fully loaded
 * Shows a loading state while workspace data is being fetched
 * Redirects to connect page if no active connection after a timeout
 */
export const WorkspaceLoader: React.FC<WorkspaceLoaderProps> = ({ children }) => {
  const { state } = useWorkspace();
  const navigate = useNavigate();
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [isAutoClaimingSession, setIsAutoClaimingSession] = useState(false);
  const autoClaimAttempted = useRef(false);

  // Check for dev mode
  const urlParams = new URLSearchParams(window.location.search);
  const isDevMode = urlParams.get('dev') === 'true' && import.meta.env.VITE_DEV_MODE === 'true';

  // Check if workspace is still loading
  const isLoading =
    !state.workspace ||
    state.loading.workspace ||
    state.loading.nodes;

  // Auto-claim an available session on mount if no connection exists
  useEffect(() => {
    if (isDevMode) {
      debugLog('WorkspaceLoader', 'Dev mode: Skipping auto-claim');
      return;
    }

    debugLog('WorkspaceLoader', ' Auto-claim useEffect running, attempted:', autoClaimAttempted.current);

    if (autoClaimAttempted.current) {
      debugLog('WorkspaceLoader', ' Skipping auto-claim (already attempted)');
      return;
    }
    autoClaimAttempted.current = true;

    const autoClaimSession = async () => {
      debugLog('WorkspaceLoader', ' Starting auto-claim session process');

      const connectionManager = ConnectionManager.getInstance();

      const currentConnection = connectionManager.getConnectionInfo();
      debugLog('WorkspaceLoader', ' getConnectionInfo() returned:', {
        hasConnection: !!currentConnection,
        cid: currentConnection?.cid?.toString() ?? 'none',
        username: currentConnection?.username ?? 'none',
      });

      if (currentConnection?.cid && currentConnection.cid !== 0n) {
        debugLog('WorkspaceLoader', ' Already connected with CID:', currentConnection.cid);

        const existingSelection = await getSelectedUser();
        if (!existingSelection?.selectedCid) {
          const activeSessions = await connectionManager.getActiveSessions();
          const session = activeSessions.find(s => s.cid === currentConnection.cid);
          if (session) {
            await setSelectedUser({
              selectedUsername: session.username,
              selectedServerAddress: session.server_address,
              selectedCid: session.cid
            });
          }
        }

        await postAuthSetup(currentConnection.cid);

        setHasConnection(true);
        return;
      }

      setIsAutoClaimingSession(true);

      try {
        debugLog('WorkspaceLoader', ' Waiting for ConnectionManager to be ready...');
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('ConnectionManager ready timeout')), TIMEOUT.CLAIM_SESSION_MS)
        );
        await Promise.race([connectionManager.waitForReady(), timeoutPromise]);
        debugLog('WorkspaceLoader', ' ConnectionManager is ready');

        const activeSessions = await connectionManager.getActiveSessions();
        debugLog('WorkspaceLoader', ' Found active sessions:', activeSessions.length);

        if (activeSessions.length === 0) {
          debugLog('WorkspaceLoader', ' No active sessions available');
          setIsAutoClaimingSession(false);
          return;
        }

        const existingSelection = await getSelectedUser();
        debugLog('WorkspaceLoader', ' Tab context getSelectedUser() returned:', {
          hasSelection: !!existingSelection,
          selectedCid: existingSelection?.selectedCid?.toString() ?? 'none',
          selectedUsername: existingSelection?.selectedUsername ?? 'none',
        });

        let sessionToUse: typeof activeSessions[0] | undefined;

        if (existingSelection?.selectedCid) {
          sessionToUse = activeSessions.find(s => s.cid === existingSelection.selectedCid);
          if (!sessionToUse) {
            debugLog('WorkspaceLoader', ' Selected session no longer active, trying first available');
            await clearSelectedUser();
          }
        }

        if (!sessionToUse) {
          // No stored selection or stored selection invalid — use first active session
          sessionToUse = activeSessions[0];
          debugLog('WorkspaceLoader', ' Auto-selecting first available session:', sessionToUse?.username);
        }

        if (!sessionToUse) {
          debugLog('WorkspaceLoader', ' No usable session found');
          setIsAutoClaimingSession(false);
          return;
        }

        const session = sessionToUse;
        debugLog('WorkspaceLoader', ' Auto-claiming session:', session.username, session.cid);

        try {
          await websocketService.claimSession(session.cid, true);
          debugLog('WorkspaceLoader', ' Session claimed successfully (was orphaned)');
        } catch (claimError: unknown) {
          if (claimError instanceof Error && claimError.message?.includes('not orphaned')) {
            debugLog('WorkspaceLoader', ' Session is still active (not orphaned), no claim needed');
          } else {
            throw claimError;
          }
        }

        await setSelectedUser({
          selectedUsername: session.username,
          selectedServerAddress: session.server_address,
          selectedCid: session.cid
        });

        await postAuthSetup(session.cid);

        setHasConnection(true);
        debugLog('WorkspaceLoader', ' Auto-claim complete, workspace loading initiated');
      } catch (error) {
        debugLog('WorkspaceLoader', 'Auto-claim session failed:', error);
      } finally {
        setIsAutoClaimingSession(false);
      }
    };

    runAsyncSetup(autoClaimSession);
  }, [isDevMode]);

  useEffect(() => {
    if (isDevMode) return;

    const connectionService = ConnectionService.getInstance();
    let mounted = true;

    connectionService.onConnectionChange((connection) => {
      if (mounted) {
        setHasConnection(!!connection?.isConnected);
      }
    });

    const timeout = setTimeout(() => {
      if (mounted && isLoading && !hasConnection) {
        setLoadingTimeout(true);
      }
    }, TIMEOUT.SERVER_REQUEST_MS);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [isLoading, hasConnection, isDevMode]);

  useEffect(() => {
    if (isDevMode) return;

    if (loadingTimeout && !hasConnection && isLoading && !isAutoClaimingSession) {
      debugLog('WorkspaceLoader', ' No connection detected after timeout, redirecting to connect');
      navigate('/connect');
    }
  }, [loadingTimeout, hasConnection, isLoading, navigate, isDevMode, isAutoClaimingSession]);

  // Secondary safety net: workspace data loading timeout
  // Covers the case where connection is established (hasConnection=true) but
  // workspace data never loads (e.g., Follower tab doesn't own WASM client)
  const [workspaceDataTimeout, setWorkspaceDataTimeout] = useState(false);
  useEffect(() => {
    if (isDevMode || !hasConnection || !isLoading) {
      setWorkspaceDataTimeout(false);
      return;
    }
    const timer = setTimeout(() => {
      if (isLoading && hasConnection) {
        debugLog('WorkspaceLoader', 'Workspace data loading timeout — connection exists but data never arrived');
        setWorkspaceDataTimeout(true);
      }
    }, 10_000); // 10s for workspace data to load
    return () => clearTimeout(timer);
  }, [hasConnection, isLoading, isDevMode]);

  if (isDevMode) {
    debugLog('WorkspaceLoader', 'Dev mode: Bypassing workspace loader');
    return <>{children}</>;
  }

  if (isLoading || isAutoClaimingSession) {
    const loadingMessage = isAutoClaimingSession
      ? 'Connecting to session...'
      : workspaceDataTimeout
        ? 'Workspace data is taking longer than expected...'
        : loadingTimeout
          ? 'Checking connection...'
          : 'Loading workspace...';

    return (
      <WorkspaceLoaderSpinner
        loadingMessage={loadingMessage}
        showConnectButton={(loadingTimeout && !isAutoClaimingSession) || workspaceDataTimeout}
      />
    );
  }

  return <>{children}</>;
}

export default WorkspaceLoader;
