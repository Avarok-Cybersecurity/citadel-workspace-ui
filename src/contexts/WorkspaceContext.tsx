import React, { createContext, useContext, useMemo } from 'react';
import { User } from '../types/workspace-entities';
import type { WorkspaceMetadataTS } from '../types/workspace-protocol';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
import type { WorkspaceMetadataBytes } from '@/types/workspace-metadata';

// Define the shape of our workspace state
export interface WorkspaceState {
  workspace?: {
    id: string;
    name: string;
    description?: string;
    /** Raw `Vec<u8>` from the wire. Decode it; do not read properties off it. */
    metadata?: WorkspaceMetadataBytes;
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
}>({
  state: initialState
});

// Custom hook to use the workspace context
export const useWorkspace = () => useContext(WorkspaceContext);

// Provider component
export interface WorkspaceProviderProps {
  children: React.ReactNode;
  state: WorkspaceState;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({
  children,
  state
}) => {
  // Memoised: an object literal here is a new reference on every render of the
  // provider, and context propagation bypasses React's element-identity
  // bailout — so all 20 useWorkspace() consumers re-rendered whenever the
  // provider did, regardless of whether `state` had changed.
  const value = useMemo(() => ({ state }), [state]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};
