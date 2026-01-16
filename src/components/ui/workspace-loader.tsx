import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/lib/workspace-context';
import { ConnectionService } from '@/lib/connection-service';
import { ConnectionManager } from '@/lib/connection-manager';
import { websocketService } from '@/lib/websocket-service';
import { wasmConnectionManager } from '@/lib/wasm-connection-manager';
import WorkspaceService from '@/lib/workspace-service';
import { setSelectedUser, getSelectedUser, clearSelectedUser } from '@/lib/tab-context';

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
  const isDevMode = urlParams.get('dev') === 'true';

  // Check if workspace is still loading
  const isLoading =
    !state.workspace ||
    state.loading.workspace ||
    state.loading.offices;

  // Auto-claim an available session on mount if no connection exists
  // This fixes Issue #6: Direct navigation to protected routes fails without session claiming
  useEffect(() => {
    console.log('WorkspaceLoader: Auto-claim useEffect running, attempted:', autoClaimAttempted.current, 'devMode:', isDevMode);

    if (autoClaimAttempted.current || isDevMode) {
      console.log('WorkspaceLoader: Skipping auto-claim (already attempted or dev mode)');
      return;
    }
    autoClaimAttempted.current = true;

    const autoClaimSession = async () => {
      console.log('WorkspaceLoader: Starting auto-claim session process');

      const connectionManager = ConnectionManager.getInstance();

      // Check if already connected via ConnectionManager
      const currentConnection = connectionManager.getConnectionInfo();
      if (currentConnection?.cid && currentConnection.cid !== 0n) {
        console.log('WorkspaceLoader: Already connected with CID:', currentConnection.cid);

        // Set up tab context if not already set
        const existingSelection = await getSelectedUser();
        if (!existingSelection?.selectedCid) {
          // Get session info from active sessions to populate tab context
          const activeSessions = await connectionManager.getActiveSessions();
          const session = activeSessions.find(s => s.cid === currentConnection.cid);
          if (session) {
            void setSelectedUser({
              selectedUsername: session.username,
              selectedServerAddress: session.server_address,
              selectedCid: session.cid
            });
          }
        }

        // Set the connection ID in WorkspaceService
        WorkspaceService.setConnectionId(currentConnection.cid);

        // Trigger workspace loading (this is what was missing!)
        console.log('WorkspaceLoader: Triggering workspace loading for existing connection');
        void WorkspaceService.loadWorkspace();
        void WorkspaceService.listOffices();

        setHasConnection(true);
        return;
      }

      setIsAutoClaimingSession(true);

      try {
        // Wait for ConnectionManager to be ready (with timeout)
        console.log('WorkspaceLoader: Waiting for ConnectionManager to be ready...');
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('ConnectionManager ready timeout')), 10000)
        );
        await Promise.race([connectionManager.waitForReady(), timeoutPromise]);
        console.log('WorkspaceLoader: ConnectionManager is ready');

        // Get active sessions from internal service
        const activeSessions = await connectionManager.getActiveSessions();
        console.log('WorkspaceLoader: Found active sessions:', activeSessions.length);

        if (activeSessions.length === 0) {
          console.log('WorkspaceLoader: No active sessions available');
          setIsAutoClaimingSession(false);
          return;
        }

        // CRITICAL: Only claim a session when we have an explicit CID from tab context
        // NEVER blindly pick activeSessions[0] - that steals other users' sessions!
        const existingSelection = await getSelectedUser();

        if (!existingSelection?.selectedCid) {
          // No CID known for this tab - do NOT claim any session
          // User must explicitly select a session via UI (OrphanSessionsNavbar, Login, etc.)
          console.log('WorkspaceLoader: No session CID in tab context, skipping auto-claim');
          console.log('WorkspaceLoader: User must select a session via UI');
          setIsAutoClaimingSession(false);
          return;
        }

        // Try to find the session matching this tab's existing selection
        const session = activeSessions.find(s => s.cid === existingSelection.selectedCid);
        if (!session) {
          // Selected session no longer exists in backend - clear stale tab context
          console.log('WorkspaceLoader: Selected session no longer active, clearing tab context');
          void clearSelectedUser();
          setIsAutoClaimingSession(false);
          return;
        }

        console.log('WorkspaceLoader: Auto-claiming known session:', session.username, session.cid);

        // Try to claim the session (same logic as OrphanSessionsNavbar.handleNavigate)
        try {
          await websocketService.claimSession(session.cid, true);
          console.log('WorkspaceLoader: Session claimed successfully (was orphaned)');
        } catch (claimError: any) {
          if (claimError?.message?.includes('not orphaned')) {
            console.log('WorkspaceLoader: Session is still active (not orphaned), no claim needed');
          } else {
            // Re-throw if it's a different error
            throw claimError;
          }
        }

        // Set up tab context
        void setSelectedUser({
          selectedUsername: session.username,
          selectedServerAddress: session.server_address,
          selectedCid: session.cid
        });

        // Set the connection ID in WorkspaceService
        WorkspaceService.setConnectionId(session.cid);

        // Start WASM connection manager for P2P messaging
        try {
          await wasmConnectionManager.start(session.cid.toString());
          console.log('WorkspaceLoader: WASM connection manager started for CID:', session.cid);
        } catch (error) {
          console.error('WorkspaceLoader: Failed to start WASM connection manager:', error);
          // Don't block - P2P messaging may not be immediately needed
        }

        // Trigger workspace loading
        void WorkspaceService.loadWorkspace();
        void WorkspaceService.listOffices();

        setHasConnection(true);
        console.log('WorkspaceLoader: Auto-claim complete, workspace loading initiated');
      } catch (error) {
        console.error('WorkspaceLoader: Auto-claim session failed:', error);
      } finally {
        setIsAutoClaimingSession(false);
      }
    };

    void autoClaimSession();
  }, [isDevMode]);

  useEffect(() => {

    // Check connection status
    const connectionService = ConnectionService.getInstance();
    let mounted = true;
    
    // Listen for connection changes
    connectionService.onConnectionChange((connection) => {
      if (mounted) {
        setHasConnection(!!connection?.isConnected);
      }
    });
    
    // Set a timeout for loading - if we're still loading after 5 seconds, check connection
    const timeout = setTimeout(() => {
      if (mounted && isLoading && !hasConnection) {
        setLoadingTimeout(true);
      }
    }, 5000);
    
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [isLoading, hasConnection]);
  
  // If loading timed out and no connection, redirect to connect (but not in dev mode)
  useEffect(() => {
    if (loadingTimeout && !hasConnection && isLoading && !isDevMode) {
      console.log('WorkspaceLoader: No connection detected after timeout, redirecting to connect');
      navigate('/connect');
    }
  }, [loadingTimeout, hasConnection, isLoading, navigate, isDevMode]);

  // In dev mode, skip all loading checks
  if (isDevMode) {
    console.log('Dev mode: Bypassing workspace loader');
    return <>{children}</>;
  }

  if (isLoading || isAutoClaimingSession) {
    const loadingMessage = isAutoClaimingSession
      ? 'Connecting to session...'
      : loadingTimeout
        ? 'Checking connection...'
        : 'Loading workspace...';

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#1C1D28] z-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-t-4 border-[#6E59A5] border-solid rounded-full animate-spin"></div>
          <div className="text-white text-lg font-medium">
            {loadingMessage}
          </div>
          {loadingTimeout && !isAutoClaimingSession && (
            <button
              onClick={() => navigate('/connect')}
              className="mt-4 px-4 py-2 bg-[#9b87f5] text-white rounded hover:bg-[#7c68d6] transition-colors"
            >
              Go to Connect
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Workspace is loaded, render children
  return <>{children}</>;
}

export default WorkspaceLoader;
