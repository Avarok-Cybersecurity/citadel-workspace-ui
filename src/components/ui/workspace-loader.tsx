import React from 'react';
import { useWorkspace } from '@/lib/workspace-context';

interface WorkspaceLoaderProps {
  children: React.ReactNode;
}

/**
 * A component that only renders its children when the workspace is fully loaded
 * Shows a loading state while workspace data is being fetched
 */
export const WorkspaceLoader: React.FC<WorkspaceLoaderProps> = ({ children }) => {
  const { state } = useWorkspace();
  
  // Check if workspace is still loading
  const isLoading = 
    !state.workspace || 
    state.loading.workspace || 
    state.loading.offices;
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#1C1D28] z-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-t-4 border-[#6E59A5] border-solid rounded-full animate-spin"></div>
          <div className="text-white text-lg font-medium">Loading workspace...</div>
        </div>
      </div>
    );
  }
  
  // Workspace is loaded, render children
  return <>{children}</>;
}

export default WorkspaceLoader;
