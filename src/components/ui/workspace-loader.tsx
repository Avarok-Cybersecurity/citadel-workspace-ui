import React, { useEffect, useState, useRef } from 'react';
import { useWorkspaceDataTimeout } from './use-workspace-data-timeout';
import { ConnectionService } from '@/lib/connection-service';
import { TIMEOUT } from '@/lib/timeout-constants';
import { useAutoClaimSession } from './use-auto-claim-session';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { debugLog } from '@/lib/debug-config';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [isAutoClaimingSession, setIsAutoClaimingSession] = useState(false);
  const autoClaimAttempted = useRef(false);

  // Check for dev mode
  const urlParams = new URLSearchParams(window.location.search);
  const isDevMode: boolean = urlParams.get('dev') === 'true' && import.meta.env.VITE_DEV_MODE === 'true';

  // Check if workspace is still loading
  const isLoading: boolean =
    !state.workspace ||
    state.loading.workspace ||
    state.loading.nodes;

  useAutoClaimSession({
    isDevMode,
    toast,
    setHasConnection,
    setIsAutoClaimingSession,
    autoClaimAttempted,
  });

  useEffect(() => {
    if (isDevMode) return;

    const connectionService: ConnectionService = ConnectionService.getInstance();
    let mounted: boolean = true;

    // `mounted` made stale handlers inert but never removed them. See onConnectionChange.
    const unsubscribeConnection: () => void = connectionService.onConnectionChange((connection): void => {
      if (mounted) {
        setHasConnection(!!connection?.isConnected);
      }
    });

    const timeout = setTimeout((): void => {
      if (mounted && isLoading && !hasConnection) {
        setLoadingTimeout(true);
      }
    }, TIMEOUT.SERVER_REQUEST_MS);

    return (): void => {
      mounted = false;
      unsubscribeConnection();
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
  const workspaceDataTimeout: boolean = useWorkspaceDataTimeout(hasConnection, isLoading, isDevMode);

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
