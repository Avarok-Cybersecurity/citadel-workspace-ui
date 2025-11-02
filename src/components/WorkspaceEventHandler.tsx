import React, { useEffect, useState } from 'react';
import { workspaceEvents, type OfficePayload, type RoomPayload, type ErrorPayload, type ConnectionInfo, type ProtocolWarningPayload, type MessagePayload } from '../lib/workspace-events';
import { Office, Room, User } from '../types/workspace-entities';
import { WorkspaceProvider, WorkspaceState } from '../lib/workspace-context';
import { saveToStorage, loadFromStorage } from '../lib/storage-utils';
import WorkspaceService from '../lib/workspace-service';
import UserService from '../lib/user-service';
import { getWorkspaceLogo } from '../lib/workspace-metadata-service';
import { WorkspaceInitializationModal } from './WorkspaceInitializationModal';
import { eventEmitter } from '../lib/event-emitter';
import { broadcastChannelService } from '../lib/broadcast-channel-service';
import { p2pRegistrationService } from '../lib/p2p-registration-service';
import { connectionManager } from '../lib/connection-manager';

interface WorkspaceEventState {
  workspace?: {
    id: string;
    name: string;
    metadata?: Record<string, any>;
  };
  offices: Record<string, Office>;
  rooms: Record<string, Room>;
  loading: {
    workspace: boolean;
    offices: boolean;
    rooms: boolean;
    members: boolean;
  };
  error?: string;
  needsWorkspaceInitialization?: boolean;
  protocolWarning?: {
    message: string;
    requestType: string;
    timestamp: number;
  };
  messages: {
    byPeer: Record<number, Array<{
      content: string;
      timestamp: number;
      id?: string;
      pending?: boolean;
    }>>;
    lastMessageTimestamp?: number;
  };
  typing: {
    peerIds: number[];
    lastUpdated: number;
  };
  currentUser?: {
    id: string;
    username: string;
    fullName: string;
  };
  lastRequestId?: string; // Track the last request ID for correlation
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
    offices: {},
    rooms: {},
    loading: {
      workspace: false,
      offices: false,
      rooms: false,
      members: false,
    },
    needsWorkspaceInitialization: false,
    messages: {
      byPeer: loadFromStorage<Record<number, Array<{
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

  // Watch for initialization requirement and show modal
  useEffect(() => {
    if (state.needsWorkspaceInitialization && !showInitModal) {
      console.info('Workspace needs initialization - showing modal');
      setShowInitModal(true);
    }
  }, [state.needsWorkspaceInitialization, showInitModal]);

  useEffect(() => {
    // Set up event listeners for workspace
    const setupWorkspaceListeners = async () => {
      // Loading state
      await workspaceEvents.onWorkspaceEvent('workspace:loading', (connectionInfo: ConnectionInfo) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, workspace: true },
          lastRequestId: connectionInfo.request_id
        }));
      });

      // Workspace loaded event
      await workspaceEvents.onWorkspaceEvent('workspace:loaded', (payload) => {
        const workspaceMetadata = payload.workspace.metadata || [];

        // Parse metadata as JSON to check initialization status
        let isInitialized = false;
        try {
          if (workspaceMetadata.length > 0) {
            const metadataString = new TextDecoder().decode(new Uint8Array(workspaceMetadata));
            const metadataJson = JSON.parse(metadataString);
            isInitialized = metadataJson.initialized === true;
          }
        } catch (error) {
          console.warn('Failed to parse workspace metadata as JSON:', error);
          // If metadata can't be parsed, assume not initialized
          isInitialized = false;
        }

        const newState = {
          workspace: {
            ...payload.workspace,
            // Process metadata for workspace logo if needed
            metadata: workspaceMetadata
          },
          loading: { workspace: false },
          needsWorkspaceInitialization: !isInitialized,
          lastRequestId: payload.connection.request_id
        };

        setState(prev => ({
          ...prev,
          ...newState
        }));

        // Start P2P registration service if workspace is initialized
        if (isInitialized) {
          p2pRegistrationService.start({
            autoRegisterAll: true,
            connectAfterRegister: false
          }).catch(error => {
            console.error('Failed to start P2P registration service:', error);
          });
        }

        // Broadcast workspace state to other tabs (excluding currentUser which is tab-specific)
        const { currentUser: excludedUser, ...stateWithoutUser } = newState;
        broadcastChannelService.broadcastStateSync({
          type: 'workspace',
          data: stateWithoutUser
        });

        // Try to load user information if not already loaded
        const userService = UserService;
        const currentUser = userService.getCurrentUser();

        if (currentUser) {
          setState(prev => ({
            ...prev,
            currentUser: {
              id: currentUser.username,
              username: currentUser.username,
              name: currentUser.fullName || currentUser.username
            }
          }));
        }
      });

      // Workspace not initialized event
      await workspaceEvents.onWorkspaceEvent('workspace:not-initialized', () => {
        setState(prev => ({
          ...prev,
          needsWorkspaceInitialization: true,
          loading: { ...prev.loading, workspace: false }
        }));
      });
    };

    // Set up event listeners for offices
    const setupOfficeListeners = async () => {
      // Loading states
      await workspaceEvents.onOfficeEvent('offices:loading', (connectionInfo: ConnectionInfo) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, offices: true },
          lastRequestId: connectionInfo.request_id
        }));
      });

      await workspaceEvents.onOfficeEvent('office:loading', (payload) => {
        console.info(`Loading office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Data loaded events
      await workspaceEvents.onOfficeEvent('offices:loaded', (payload) => {
        const officesMap: Record<string, Office> = {};
        payload.offices.forEach(office => {
          officesMap[office.id] = office;
        });

        setState(prev => ({
          ...prev,
          offices: officesMap,
          loading: { ...prev.loading, offices: false },
          lastRequestId: payload.connection.request_id
        }));

        // Broadcast offices state to other tabs
        broadcastChannelService.broadcastStateSync({
          type: 'offices',
          data: officesMap
        });

        // After offices are loaded, load rooms for each office
        if (payload.offices.length > 0) {
          console.info(`Loading rooms for ${payload.offices.length} offices`);
          payload.offices.forEach(office => {
            WorkspaceService.listRooms(office.id)
              .then(() => {
                console.info(`Rooms loading initiated for office: ${office.id}`);
              })
              .catch(error => {
                console.error(`Error loading rooms for office ${office.id}:`, error);
              });
          });
        }
      });

      await workspaceEvents.onOfficeEvent('office:loaded', (payload: OfficePayload) => {
        setState(prev => ({
          ...prev,
          offices: {
            ...prev.offices,
            [payload.office.id]: payload.office
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Creation and update events
      await workspaceEvents.onOfficeEvent('office:creating', (connectionInfo: ConnectionInfo) => {
        console.info('Creating new office...', connectionInfo.request_id);
        setState(prev => ({
          ...prev,
          lastRequestId: connectionInfo.request_id
        }));
      });

      await workspaceEvents.onOfficeEvent('office:updating', (payload) => {
        console.info(`Updating office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      await workspaceEvents.onOfficeEvent('office:deleting', (payload) => {
        console.info(`Deleting office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Office created event
      await workspaceEvents.onOfficeEvent('office:created', (payload: any) => {
        console.info('Office created:', payload.office);
        setState(prev => ({
          ...prev,
          offices: {
            ...prev.offices,
            [payload.office.id]: payload.office
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Office updated event
      await workspaceEvents.onOfficeEvent('office:updated', (payload: any) => {
        console.info('Office updated:', payload.office);
        setState(prev => ({
          ...prev,
          offices: {
            ...prev.offices,
            [payload.office.id]: payload.office
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Office deleted event
      await workspaceEvents.onOfficeEvent('office:deleted', (payload: any) => {
        console.info('Office deleted:', payload.officeId);
        setState(prev => {
          const newOffices = { ...prev.offices };
          delete newOffices[payload.officeId];
          
          // Also remove all rooms belonging to this office
          const newRooms = { ...prev.rooms };
          Object.keys(newRooms).forEach(roomId => {
            if (newRooms[roomId].office_id === payload.officeId) {
              delete newRooms[roomId];
            }
          });
          
          return {
            ...prev,
            offices: newOffices,
            rooms: newRooms,
            lastRequestId: payload.connection.request_id
          };
        });
      });

      // Offices reload event
      await workspaceEvents.onWorkspaceEvent('offices:reload', async (connectionInfo: ConnectionInfo) => {
        console.info('Reloading offices list...');
        // Trigger a fresh load of offices
        await WorkspaceService.listOffices();
      });
    };

    // Set up event listeners for rooms
    const setupRoomListeners = async () => {
      // Loading states
      await workspaceEvents.onRoomEvent('rooms:loading', (payload) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, rooms: true },
          lastRequestId: payload.connection.request_id
        }));
        console.info(`Loading rooms for office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
      });

      await workspaceEvents.onRoomEvent('room:loading', (payload) => {
        console.info(`Loading room: ${payload.room_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Data loaded events
      await workspaceEvents.onRoomEvent('rooms:loaded', (payload) => {
        const roomsMap: Record<string, Room> = {};
        payload.rooms.forEach(room => {
          roomsMap[room.id] = room;
        });

        setState(prev => {
          const newRooms = {
            ...prev.rooms,
            ...roomsMap
          };
          
          // Broadcast rooms state to other tabs
          broadcastChannelService.broadcastStateSync({
            type: 'rooms',
            data: newRooms
          });
          
          return {
            ...prev,
            rooms: newRooms,
            loading: { ...prev.loading, rooms: false },
            lastRequestId: payload.connection.request_id
          };
        });
      });

      await workspaceEvents.onRoomEvent('room:loaded', (payload: RoomPayload) => {
        setState(prev => ({
          ...prev,
          rooms: {
            ...prev.rooms,
            [payload.room.id]: payload.room
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Creation and update events
      await workspaceEvents.onRoomEvent('room:creating', (payload) => {
        console.info(`Creating new room in office: ${payload.office_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      await workspaceEvents.onRoomEvent('room:updating', (payload) => {
        console.info(`Updating room: ${payload.room_id}, request ID: ${payload.connection.request_id}`);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      await workspaceEvents.onRoomEvent('room:deleting', (payload) => {
        console.info(`Deleting room: ${payload.room_id}, request ID: ${payload.connection.request_id}`);

        // Remove room from state
        setState(prev => {
          const newRooms = { ...prev.rooms };
          delete newRooms[payload.room_id];
          return {
            ...prev,
            rooms: newRooms,
            lastRequestId: payload.connection.request_id
          };
        });
      });

      // Room created event
      await workspaceEvents.onRoomEvent('room:created', (payload: any) => {
        console.info('Room created:', payload.room);
        setState(prev => ({
          ...prev,
          rooms: {
            ...prev.rooms,
            [payload.room.id]: payload.room
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Room updated event
      await workspaceEvents.onRoomEvent('room:updated', (payload: any) => {
        console.info('Room updated:', payload.room);
        setState(prev => ({
          ...prev,
          rooms: {
            ...prev.rooms,
            [payload.room.id]: payload.room
          },
          lastRequestId: payload.connection.request_id
        }));
      });

      // Room deleted event
      await workspaceEvents.onRoomEvent('room:deleted', (payload: any) => {
        console.info('Room deleted:', payload.roomId);
        setState(prev => {
          const newRooms = { ...prev.rooms };
          delete newRooms[payload.roomId];
          return {
            ...prev,
            rooms: newRooms,
            lastRequestId: payload.connection.request_id
          };
        });
      });

      // Rooms reload event
      await workspaceEvents.onWorkspaceEvent('rooms:reload', async (payload: any) => {
        console.info('Reloading rooms list...');
        // Trigger a fresh load of rooms for the office
        if (payload && payload.office_id) {
          await WorkspaceService.listRooms(payload.office_id);
        }
      });
    };

    // Set up event listeners for members
    const setupMemberListeners = async () => {
      // Member events
      await workspaceEvents.onMemberEvent('members:loading', (payload) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, members: true },
          lastRequestId: payload.connection.request_id
        }));

        if (payload.officeId) {
          console.info(`Loading members for office: ${payload.officeId}, request ID: ${payload.connection.request_id}`);
        } else if (payload.roomId) {
          console.info(`Loading members for room: ${payload.roomId}, request ID: ${payload.connection.request_id}`);
        }
      });

      await workspaceEvents.onMemberEvent('members:loaded', async (payload) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, members: false },
          lastRequestId: payload.connection.request_id
        }));

        // Don't re-emit the same event - it causes an infinite loop
        // The MembersSection will receive the event directly from workspace-events
      });

      // Member added event
      await workspaceEvents.onMemberEvent('member:added', (payload: any) => {
        console.info('Member added:', payload.member);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Member role updated event
      await workspaceEvents.onMemberEvent('member:role-updated', (payload: any) => {
        console.info('Member role updated:', payload.userId, payload.role);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Member removed event
      await workspaceEvents.onMemberEvent('member:removed', (payload: any) => {
        console.info('Member removed:', payload.userId);
        setState(prev => ({
          ...prev,
          lastRequestId: payload.connection.request_id
        }));
      });

      // Members reload event
      await workspaceEvents.onWorkspaceEvent('members:reload', async (connectionInfo: ConnectionInfo) => {
        console.info('Reloading members list...');
        // Trigger a fresh load of members
        const params = new URLSearchParams(window.location.search);
        const officeId = params.get("officeId");
        const roomId = params.get("roomId");
        await WorkspaceService.listMembers(officeId || undefined, roomId || undefined);
      });
    };

    // Set up event listeners for messages
    const setupMessageListeners = async () => {
      await workspaceEvents.onMessageEvent('message:received', (payload: MessagePayload) => {
        console.info(`Received message from peer: ${payload.peerCid}, length: ${payload.contentLength}`);

        if (!payload.contents) {
          console.warn('Received message event without contents');
          return;
        }

        // Get peer CID with fallback
        const peerCid = payload.peerCid || 0;

        // Update state with new message
        setState(prev => {
          // Get existing messages for this peer or create new array
          const peerMessages = prev.messages.byPeer[peerCid] || [];

          // Remove peer from typing list when a message is received
          const updatedTypingPeerIds = prev.typing.peerIds.filter(id => id !== peerCid);

          return {
            ...prev,
            messages: {
              ...prev.messages,
              byPeer: {
                ...prev.messages.byPeer,
                [peerCid]: [
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

      // Handle typing indicators
      await workspaceEvents.onMessageEvent('typing:started', (payload: { peerCid: number, connection: ConnectionInfo }) => {
        setState(prev => {
          // Add peer to typing list if not already there
          if (!prev.typing.peerIds.includes(payload.peerCid)) {
            return {
              ...prev,
              typing: {
                peerIds: [...prev.typing.peerIds, payload.peerCid],
                lastUpdated: Date.now()
              },
              lastRequestId: payload.connection.request_id
            };
          }
          return prev;
        });
      });

      await workspaceEvents.onMessageEvent('typing:stopped', (payload: { peerCid: number, connection: ConnectionInfo }) => {
        setState(prev => {
          // Remove peer from typing list
          return {
            ...prev,
            typing: {
              peerIds: prev.typing.peerIds.filter(id => id !== payload.peerCid),
              lastUpdated: Date.now()
            },
            lastRequestId: payload.connection.request_id
          };
        });
      });
    };

    // Set up error handling
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
          console.info('Workspace initialization needed - showing modal');
          setShowInitModal(true);
        } else {
          setTimeout(() => {
            setState(prev => ({ ...prev, error: undefined }));
          }, 5000);
        }
      });

      await workspaceEvents.onOperationEvent('operation:success', (connectionInfo: ConnectionInfo) => {
        console.info(`Operation successful (CID: ${connectionInfo.cid}, request ID: ${connectionInfo.request_id})`);
        setState(prev => ({
          ...prev,
          lastRequestId: connectionInfo.request_id
        }));
      });
    };

    // Set up protocol warning handling
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

        // Reset warning after 10 seconds
        setTimeout(() => {
          setState(prev => ({ ...prev, protocolWarning: undefined }));
        }, 10000);
      });
    };

    // Setup broadcast state sync listener
    const setupBroadcastSync = () => {
      eventEmitter.on('broadcast-state-sync', (data: any) => {
        console.log('WorkspaceEventHandler: Received broadcast state sync', data);
        
        if (data.type === 'workspace') {
          // When receiving workspace state, preserve our tab's currentUser
          const { currentUser: receivedUser, ...receivedData } = data.data;
          setState(prev => ({
            ...prev,
            ...receivedData,
            // Keep our tab's currentUser
            currentUser: prev.currentUser
          }));
        } else if (data.type === 'offices') {
          setState(prev => ({
            ...prev,
            offices: data.data
          }));
        } else if (data.type === 'rooms') {
          setState(prev => ({
            ...prev,
            rooms: data.data
          }));
        } else if (data.type === 'members') {
          setState(prev => ({
            ...prev,
            members: data.data
          }));
        }
      });
    };

    // Initialize all event listeners
    const initializeEvents = async () => {
      await setupWorkspaceListeners();
      await setupOfficeListeners();
      await setupRoomListeners();
      await setupMemberListeners();
      await setupErrorHandling();
      await setupProtocolWarningHandling();
      await setupMessageListeners();
      setupBroadcastSync();

      console.info('Workspace event listeners initialized');
    };

    initializeEvents();

    // Clean up all listeners when component unmounts
    return () => {
      workspaceEvents.cleanupAllListeners();
      p2pRegistrationService.stop();
    };
  }, []);

  // Persist messages to local storage whenever they change
  useEffect(() => {
    saveToStorage('workspace-messages', state.messages.byPeer);
  }, [state.messages.byPeer]);

  // Function to send a message to a peer
  // TODO: This is outdated and needs to be wrapped properly with the worspace-level subprotocol commands
  // via sendWorkspaceRequest from workspace-service.ts
  const sendMessage = async (content: string, recipientId: number) => {
    try {
      await invoke('send_workspace_request', {
        receiverId: recipientId.toString(),
        content
      });

      // Optimistically add the message to our state (will be official when we get the event back)
      setState(prev => {
        const peerMessages = prev.messages.byPeer[recipientId] || [];

        return {
          ...prev,
          messages: {
            ...prev.messages,
            byPeer: {
              ...prev.messages.byPeer,
              [recipientId]: [
                ...peerMessages,
                {
                  content,
                  timestamp: Date.now(),
                  pending: true // Mark as pending until confirmed
                }
              ]
            },
            lastMessageTimestamp: Date.now()
          },
          lastRequestId: prev.lastRequestId
        };
      });

      return true;
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

  // Wrap children with the WorkspaceProvider to make state available to all descendants
  const handleWorkspaceInitialized = () => {
    setShowInitModal(false);
    setState(prev => ({
      ...prev,
      needsWorkspaceInitialization: false,
      error: undefined
    }));

    // Reload workspace after initialization
    WorkspaceService.loadWorkspace()
      .then(() => {
        console.info('Workspace reloaded after initialization');
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
        onClose={() => setShowInitModal(false)}
        onSuccess={handleWorkspaceInitialized}
        workspaceName={state.workspace?.name}
        serverAddress={connectionManager.getStoredSessions()[0]?.serverAddress}
        username={state.currentUser?.username || connectionManager.getStoredSessions()[0]?.username}
      />
    </>
  );
};

export default WorkspaceEventHandler;
