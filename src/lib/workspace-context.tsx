import React, { createContext, useContext } from 'react';
import { Office, Room, User } from '../types/workspace-entities';

// Define the shape of our workspace state
export interface WorkspaceState {
  workspace?: {
    id: string;
    name: string;
    metadata?: Record<string, any>;
  };
  currentUser?: {
    id: string;
    username: string;
    name: string;
    role?: string;
    displayName?: string;
    avatarUrl?: string; // Base64 data URL for avatar image
  };
  offices: Record<string, Office>;
  rooms: Record<string, Room>;
  members: Record<string, User>;
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
  lastRequestId?: string;
}

// Default initial state
const initialState: WorkspaceState = {
  workspace: undefined,
  currentUser: undefined,
  offices: {},
  rooms: {},
  members: {},
  loading: {
    workspace: false,
    offices: false,
    rooms: false,
    members: false,
  },
  messages: {
    byPeer: {},
  },
  typing: {
    peerIds: [],
    lastUpdated: 0
  }
};

// Create the context
export const WorkspaceContext = createContext<{
  state: WorkspaceState;
  sendMessage?: (content: string, recipientId: number) => Promise<boolean>;
}>({
  state: initialState
});

// Custom hook to use the workspace context
export const useWorkspace = () => useContext(WorkspaceContext);

// Provider component
export interface WorkspaceProviderProps {
  children: React.ReactNode;
  state: WorkspaceState;
  sendMessage?: (content: string, recipientId: number) => Promise<boolean>;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({
  children,
  state,
  sendMessage
}) => {
  return (
    <WorkspaceContext.Provider value={{ state, sendMessage }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
