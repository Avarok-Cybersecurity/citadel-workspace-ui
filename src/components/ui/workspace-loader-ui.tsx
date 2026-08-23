/**
 * Loading UI component for WorkspaceLoader.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

interface WorkspaceLoaderSpinnerProps {
  loadingMessage: string;
  showConnectButton: boolean;
}

export const WorkspaceLoaderSpinner: React.FC<WorkspaceLoaderSpinnerProps> = ({
  loadingMessage,
  showConnectButton,
}) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-16 h-16 border-t-4 border-primary border-solid rounded-full animate-spin"></div>
        <div className="text-foreground text-lg font-medium">
          {loadingMessage}
        </div>
        {showConnectButton && (
          <button
            onClick={() => navigate('/connect')}
            className="mt-4 px-4 py-2 bg-primary-accent text-primary-foreground rounded hover:bg-primary transition-colors"
          >
            Go to Connect
          </button>
        )}
      </div>
    </div>
  );
};
