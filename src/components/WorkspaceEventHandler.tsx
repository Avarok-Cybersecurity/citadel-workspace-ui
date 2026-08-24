import React, { useEffect, useState } from 'react';
import type { WorkspaceMetadataTS } from '../types/workspace-protocol';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
import type { User } from '../types/workspace-entities';
import { WorkspaceProvider, WorkspaceState } from '@/contexts/WorkspaceContext';
import { saveToStorage, loadFromStorage } from '../lib/storage-utils';
import WorkspaceService from '../lib/workspace-service';
import { WorkspaceInitializationModal } from './WorkspaceInitializationModal';
import { connectionManager } from '../lib/connection';

import {
  useWorkspaceEventSetup,
  useMemberEventSetup,
  useEventEmitterSetup,
  useNodeEventSetup,
  useMessageEventSetup,
} from './hooks';
import { debugLog } from '@/lib/debug-config';
import { WorkspaceThemeProvider } from './theme/WorkspaceThemeProvider';

export interface WorkspaceEventState {
  workspace?: {
    id: string;
    name: string;
    metadata?: Record<string, unknown>;
  };
  workspaces: WorkspaceMetadataTS[];
  nodes: Record<string, DomainNode>;
  treeSchema: TreeSchema | null;
  loading: {
    workspace: boolean;
    members: boolean;
    nodes: boolean;
  };
  error?: string;
  members: Record<string, User>;
  needsWorkspaceInitialization?: boolean;
  protocolWarning?: {
    message: string;
    requestType: string;
    timestamp: number;
  };
  messages: {
    byPeer: Record<string, Array<{
      content: string;
      timestamp: number;
      id?: string;
      pending?: boolean;
    }>>;
    lastMessageTimestamp?: number;
  };
  typing: {
    peerIds: string[];
    lastUpdated: number;
  };
  currentUser?: {
    id: string;
    username: string;
    name: string;
    role?: string;
    displayName?: string;
    avatarUrl?: string;
  };
  lastRequestId?: string;
}

/**
 * Component that handles workspace events and provides a central place
 * for managing workspace state updates.
 */
export const WorkspaceEventHandler: React.FC<{
  onStateChange?: (state: WorkspaceEventState) => void;
  children?: React.ReactNode;
}> = ({ onStateChange, children }) => {
  const [state, setState] = useState<WorkspaceEventState>({
    workspace: undefined,
    workspaces: [],
    nodes: {},
    treeSchema: null,
    members: {},
    loading: { workspace: false, members: false, nodes: false },
    needsWorkspaceInitialization: false,
    messages: {
      byPeer: loadFromStorage<Record<string, Array<{
        content: string; timestamp: number; id?: string; pending?: boolean;
      }>>>('workspace-messages', {}),
      lastMessageTimestamp: Date.now(),
    },
    typing: { peerIds: [], lastUpdated: Date.now() }
  });

  const [showInitModal, setShowInitModal] = useState(false);
  const [initModalDismissed, setInitModalDismissed] = useState(() => {
    return sessionStorage.getItem('workspace-init-modal-dismissed') === 'true';
  });

  useEffect(() => {
    if (state.needsWorkspaceInitialization && !showInitModal && !initModalDismissed) {
      debugLog('WorkspaceEventHandler', 'Workspace needs initialization - showing modal');
      setShowInitModal(true);
    }
  }, [state.needsWorkspaceInitialization, showInitModal, initModalDismissed]);

  // Use extracted hooks for event setup
  useWorkspaceEventSetup({ setState });
  useMemberEventSetup({ setState });
  useNodeEventSetup({ setState });
  useEventEmitterSetup({ setState });
  useMessageEventSetup({ setState });

  // Persist messages to local storage
  useEffect(() => {
    saveToStorage('workspace-messages', state.messages.byPeer);
  }, [state.messages.byPeer]);

  const sendMessage = async (_content: string, _recipientId: string) => {
    try {
      throw new Error('sendMessage not implemented - use WorkspaceService.sendWorkspaceRequest instead');
    } catch (error) {
      debugLog('WorkspaceEventHandler', 'Error sending message:', error);
      setState(prev => ({ ...prev, error: `Failed to send message: ${error}` }));
      return false;
    }
  };

  useEffect(() => {
    if (onStateChange) onStateChange(state);
  }, [state, onStateChange]);

  const handleWorkspaceInitialized = () => {
    setShowInitModal(false);
    sessionStorage.removeItem('workspace-init-modal-dismissed');
    setState(prev => ({ ...prev, needsWorkspaceInitialization: false, error: undefined }));
    WorkspaceService.loadWorkspace()
      .then(() => debugLog('WorkspaceEventHandler', 'Workspace reloaded after initialization'))
      .catch(error => debugLog('WorkspaceEventHandler', 'Error reloading workspace after initialization:', error));
  };

  /**
   * Cancelling initialisation means declining to set this workspace up, so it
   * returns to the index rather than leaving the user inside a workspace that
   * does not exist yet — which showed an empty, non-functional shell with no
   * way back and no explanation.
   *
   * A location assignment, NOT useNavigate: this component is mounted ABOVE
   * BrowserRouter (App.tsx renders WorkspaceApp outside it), so the router hooks
   * throw here and take the whole app down with them — tsc cannot see that, and
   * the first symptom is a blank page. A full load is also the right semantics
   * for declining setup, since it drops the half-built workspace context.
   */
  const handleInitCancelled = () => {
    setShowInitModal(false);
    setInitModalDismissed(true);
    sessionStorage.setItem('workspace-init-modal-dismissed', 'true');
    window.location.assign('/');
  };

  return (
    <>
      <WorkspaceProvider state={state as WorkspaceState} sendMessage={sendMessage}>
        {/* Inside WorkspaceProvider: the theme lives in the workspace's metadata,
            so it can only be read once the workspace is in context. */}
        <WorkspaceThemeProvider>{children}</WorkspaceThemeProvider>
      </WorkspaceProvider>
      <WorkspaceInitializationModal
        isOpen={showInitModal}
        onClose={handleInitCancelled}
        onSuccess={handleWorkspaceInitialized}
        workspaceName={state.workspace?.name}
        workspaceId={state.workspace?.id || 'root'}
        serverAddress={connectionManager.getStoredSessionsArray()[0]?.serverAddress}
        username={state.currentUser?.username && state.currentUser.username !== 'Loading...' ? state.currentUser.username : connectionManager.getStoredSessionsArray()[0]?.username}
        fullName={state.currentUser?.name && state.currentUser.name !== 'Loading...' ? state.currentUser.name : connectionManager.getStoredSessionsArray()[0]?.fullName}
      />
    </>
  );
};

export default WorkspaceEventHandler;
