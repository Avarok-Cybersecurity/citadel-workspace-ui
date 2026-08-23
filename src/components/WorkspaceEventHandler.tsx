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
  useMessageEventSetup({ setState, setShowInitModal });

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

  return (
    <>
      <WorkspaceProvider state={state as WorkspaceState} sendMessage={sendMessage}>
        {children}
      </WorkspaceProvider>
      <WorkspaceInitializationModal
        isOpen={showInitModal}
        onClose={() => { setShowInitModal(false); setInitModalDismissed(true); sessionStorage.setItem('workspace-init-modal-dismissed', 'true'); }}
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
