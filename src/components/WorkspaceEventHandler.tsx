import React, { useEffect, useState } from 'react';
import { workspaceEvents, type OfficePayload, type RoomPayload, type ErrorPayload, type ConnectionInfo, type ProtocolWarningPayload, type MessagePayload } from '../lib/workspace-events';
import { Office, Room, User } from '../types/workspace-entities';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceProvider, WorkspaceState } from '../lib/workspace-context';
import { saveToStorage, loadFromStorage } from '../lib/storage-utils';
import WorkspaceService from '../lib/workspace-service';
import UserService from '../lib/user-service';
import { getWorkspaceLogo } from '../lib/workspace-metadata-service';

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
        const workspaceMetadata = payload.workspace.metadata || {};

        setState(prev => ({
          ...prev,
          workspace: {
            ...payload.workspace,
            // Process metadata for workspace logo if needed
            metadata: workspaceMetadata
          },
          loading: { ...prev.loading, workspace: false },
          lastRequestId: payload.connection.request_id
        }));

        // Try to load user information if not already loaded
        const userService = UserService;
        const currentUser = userService.getCurrentUser();

        if (currentUser) {
          setState(prev => ({
            ...prev,
            currentUser: {
              id: currentUser.username,
              username: currentUser.username,
              fullName: currentUser.fullName
            }
          }));
        }
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

        setState(prev => ({
          ...prev,
          rooms: {
            ...prev.rooms,
            ...roomsMap
          },
          loading: { ...prev.loading, rooms: false },
          lastRequestId: payload.connection.request_id
        }));
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

      await workspaceEvents.onMemberEvent('members:loaded', (payload) => {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, members: false },
          lastRequestId: payload.connection.request_id
        }));

        // Update the relevant office or room with the member information
        // This might require more complex state handling depending on your app structure
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
          lastRequestId: payload.connection.request_id
        }));

        console.error(`Operation error:`, payload.message);

        // Reset error after 5 seconds
        setTimeout(() => {
          setState(prev => ({ ...prev, error: undefined }));
        }, 5000);
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

    // Initialize all event listeners
    const initializeEvents = async () => {
      await setupWorkspaceListeners();
      await setupOfficeListeners();
      await setupRoomListeners();
      await setupMemberListeners();
      await setupErrorHandling();
      await setupProtocolWarningHandling();
      await setupMessageListeners();

      console.info('Workspace event listeners initialized');
    };

    initializeEvents();

    // Clean up all listeners when component unmounts
    return () => {
      workspaceEvents.cleanupAllListeners();
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
      // Call the Tauri command to send a message
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
  return (
    <WorkspaceProvider state={state as WorkspaceState} sendMessage={sendMessage}>
      {children}
    </WorkspaceProvider>
  );
};

export default WorkspaceEventHandler;
