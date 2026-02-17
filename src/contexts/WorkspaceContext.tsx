import React, { createContext, useContext } from 'react';
import { User } from '../types/workspace-entities';
import type { WorkspaceMetadataTS } from '../types/workspace-protocol';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';

// Define the shape of our workspace state
export interface WorkspaceState {
  workspace?: {
    id: string;
    name: string;
    description?: string;
    metadata?: Record<string, any>;
  };
  workspaces: WorkspaceMetadataTS[];
  currentUser?: {
    id: string;
    username: string;
    name: string;
    role?: string;
    displayName?: string;
    avatarUrl?: string; // Base64 data URL for avatar image
  };
  members: Record<string, User>;
  nodes: Record<string, DomainNode>;
  treeSchema: TreeSchema | null;
  loading: {
    workspace: boolean;
    members: boolean;
    nodes: boolean;
  };
  error?: string;
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
  lastRequestId?: string;
}

// Default initial state
const initialState: WorkspaceState = {
  workspace: undefined,
  workspaces: [],
  currentUser: undefined,
  members: {},
  nodes: {},
  treeSchema: null,
  loading: {
    workspace: false,
    members: false,
    nodes: false,
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
  sendMessage?: (content: string, recipientId: string) => Promise<boolean>;
}>({
  state: initialState
});

// Custom hook to use the workspace context
export const useWorkspace = () => useContext(WorkspaceContext);

// Provider component
export interface WorkspaceProviderProps {
  children: React.ReactNode;
  state: WorkspaceState;
  sendMessage?: (content: string, recipientId: string) => Promise<boolean>;
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
