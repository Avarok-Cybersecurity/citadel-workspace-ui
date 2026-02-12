import React, { useEffect, useState } from 'react';
import { workspaceEvents, type ErrorPayload, type ConnectionInfo, type ProtocolWarningPayload, type MessagePayload } from '../lib/workspace-events';
import type { WorkspaceMetadataTS } from '../types/workspace-protocol';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
import { WorkspaceProvider, WorkspaceState } from '@/contexts/WorkspaceContext';
import { saveToStorage, loadFromStorage } from '../lib/storage-utils';
import WorkspaceService from '../lib/workspace-service';
import { WorkspaceInitializationModal } from './WorkspaceInitializationModal';
import { connectionManager } from '../lib/connection';
// P2P startup is now centralized in SessionStartupService, but we still need stop() for cleanup
import { p2pRegistrationService } from '../lib/p2p-registration-service';
import { runAsyncSetup } from '@/lib/utils/async-utils';

// Import extracted hooks
import {
  useWorkspaceEventSetup,
  useMemberEventSetup,
  useEventEmitterSetup,
  useNodeEventSetup,
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
 *
 * This component doesn't render anything visible but acts as an event manager
 * to update application state based on events from the Rust backend.
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
    loading: {
      workspace: false,
      members: false,
      nodes: false,
    },
    needsWorkspaceInitialization: false,
    messages: {
      byPeer: loadFromStorage<Record<string, Array<{
        content: string;
        timestamp: number;
        id?: string;
        pending?: boolean;
      }>>>('workspace-messages', {}),
      lastMessageTimestamp: Date.now(),
    },
    typing: {
      peerIds: [],
      lastUpdated: Date.now(),
    }
  });

  const [showInitModal, setShowInitModal] = useState(false);
  const [initModalDismissed, setInitModalDismissed] = useState(false);

  // Watch for initialization requirement and show modal
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

  // Set up remaining event listeners (messages, errors, protocol warnings)
  useEffect(() => {
    const setupMessageListeners = async () => {
      await workspaceEvents.onMessageEvent('message:received', (payload: MessagePayload) => {
        debugLog('WorkspaceEventHandler', `Received message from peer: ${payload.peerCid}, length: ${payload.contentLength}`);

        if (!payload.contents) {
          console.warn('Received message event without contents');
          return;
        }

        const peerCidStr = (payload.peerCid ?? 0n).toString();

        setState(prev => {
          const peerMessages = prev.messages.byPeer[peerCidStr] || [];
          const updatedTypingPeerIds = prev.typing.peerIds.filter(id => id !== peerCidStr);

          return {
            ...prev,
            messages: {
              ...prev.messages,
              byPeer: {
                ...prev.messages.byPeer,
                [peerCidStr]: [
                  ...peerMessages,
                  {
                    content: payload.contents as string,
                    timestamp: Date.now(),
                    id: payload.connection.request_id
                  }
                ]
              },
              lastMessageTimestamp: Date.now()
            },
            typing: {
              ...prev.typing,
              peerIds: updatedTypingPeerIds,
              lastUpdated: Date.now()
            },
            lastRequestId: payload.connection.request_id
          };
        });
      });

      await workspaceEvents.onMessageEvent('typing:started', (payload: { peerCid: bigint, connection: ConnectionInfo }) => {
        const peerCidStr = payload.peerCid.toString();
        setState(prev => {
          if (!prev.typing.peerIds.includes(peerCidStr)) {
            return {
              ...prev,
              typing: {
                peerIds: [...prev.typing.peerIds, peerCidStr],
                lastUpdated: Date.now()
              },
              lastRequestId: payload.connection.request_id
            };
          }
          return prev;
        });
      });

      await workspaceEvents.onMessageEvent('typing:stopped', (payload: { peerCid: bigint, connection: ConnectionInfo }) => {
        const peerCidStr = payload.peerCid.toString();
        setState(prev => ({
          ...prev,
          typing: {
            peerIds: prev.typing.peerIds.filter(id => id !== peerCidStr),
            lastUpdated: Date.now()
          },
          lastRequestId: payload.connection.request_id
        }));
      });
    };

    const setupErrorHandling = async () => {
      await workspaceEvents.onOperationEvent('operation:error', (payload: ErrorPayload) => {
        setState(prev => ({
          ...prev,
          error: payload.message,
          lastRequestId: payload.connection.request_id,
          needsWorkspaceInitialization: payload.message.includes('No workspace found')
        }));

        console.error(`Operation error:`, payload.message);

        if (payload.message.includes('No workspace found')) {
          debugLog('WorkspaceEventHandler', 'Workspace initialization needed - showing modal');
          setShowInitModal(true);
        } else {
          setTimeout(() => {
            setState(prev => ({ ...prev, error: undefined }));
          }, 5000);
        }
      });

      await workspaceEvents.onOperationEvent('operation:success', (connectionInfo: ConnectionInfo) => {
        debugLog('WorkspaceEventHandler', `Operation successful (CID: ${connectionInfo.cid}, request ID: ${connectionInfo.request_id})`);
        setState(prev => ({
          ...prev,
          lastRequestId: connectionInfo.request_id
        }));
      });
    };

    const setupProtocolWarningHandling = async () => {
      await workspaceEvents.onProtocolEvent('protocol:warning', (payload: ProtocolWarningPayload) => {
        console.warn(`Protocol warning: ${payload.message}`, {
          requestType: payload.requestType,
          connectionInfo: payload.connection
        });

        setState(prev => ({
          ...prev,
          protocolWarning: {
            message: payload.message,
            requestType: payload.requestType,
            timestamp: Date.now(),
          },
          lastRequestId: payload.connection.request_id
        }));

        setTimeout(() => {
          setState(prev => ({ ...prev, protocolWarning: undefined }));
        }, 10000);
      });
    };

    const initializeEvents = async () => {
      await setupMessageListeners();
      await setupErrorHandling();
      await setupProtocolWarningHandling();
      debugLog('WorkspaceEventHandler', 'Workspace event listeners initialized');
    };

    runAsyncSetup(initializeEvents);

    return () => {
      runAsyncSetup(async () => { workspaceEvents.cleanupAllListeners(); });
      p2pRegistrationService.stop();
    };
  }, []);

  // Persist messages to local storage whenever they change
  useEffect(() => {
    saveToStorage('workspace-messages', state.messages.byPeer);
  }, [state.messages.byPeer]);

  // Function to send a message to a peer
  const sendMessage = async (_content: string, _recipientId: string) => {
    try {
      throw new Error('sendMessage not implemented - use WorkspaceService.sendWorkspaceRequest instead');
    } catch (error) {
      console.error('Error sending message:', error);
      setState(prev => ({
        ...prev,
        error: `Failed to send message: ${error}`
      }));
      return false;
    }
  };

  // Notify parent component of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  const handleWorkspaceInitialized = () => {
    setShowInitModal(false);
    setState(prev => ({
      ...prev,
      needsWorkspaceInitialization: false,
      error: undefined
    }));

    WorkspaceService.loadWorkspace()
      .then(() => {
        debugLog('WorkspaceEventHandler', 'Workspace reloaded after initialization');
      })
      .catch(error => {
        console.error('Error reloading workspace after initialization:', error);
      });
  };

  return (
    <>
      <WorkspaceProvider state={state as WorkspaceState} sendMessage={sendMessage}>
        {children}
      </WorkspaceProvider>
      <WorkspaceInitializationModal
        isOpen={showInitModal}
        onClose={() => {
          setShowInitModal(false);
          setInitModalDismissed(true);
        }}
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
