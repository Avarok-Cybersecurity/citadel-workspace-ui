import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/lib/workspace-context';
import { ConnectionService } from '@/lib/connection-service';

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
  
  // Check for dev mode
  const urlParams = new URLSearchParams(window.location.search);
  const isDevMode = urlParams.get('dev') === 'true';
  
  // In dev mode, skip all loading checks
  if (isDevMode) {
    console.log('Dev mode: Bypassing workspace loader');
    return <>{children}</>;
  }
  
  // Check if workspace is still loading
  const isLoading = 
    !state.workspace || 
    state.loading.workspace || 
    state.loading.offices;
  
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
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#1C1D28] z-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-t-4 border-[#6E59A5] border-solid rounded-full animate-spin"></div>
          <div className="text-white text-lg font-medium">
            {loadingTimeout ? 'Checking connection...' : 'Loading workspace...'}
          </div>
          {loadingTimeout && (
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
