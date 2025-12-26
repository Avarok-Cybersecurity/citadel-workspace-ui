/**
 * Workspace store using Zustand
 * 
 * This store manages the application state related to the workspace,
 * including offices, rooms, members, and connection information.
 */
import { create } from 'zustand';
import { OfficeTS, RoomTS, UserTS } from '../types/workspace-protocol';

// Connection information type
export interface ConnectionInfo {
  connection_id: string;
  peer_id: string;
}

// Error information type
export interface ErrorInfo {
  code: string;
  message: string;
}

// State interface for the workspace store
export interface WorkspaceState {
  // Collections
  offices: OfficeTS[];
  rooms: RoomTS[];
  members: UserTS[];
  
  // Active entities
  currentOffice: OfficeTS | null;
  currentRoom: RoomTS | null;
  
  // Connection state
  connectionInfo: ConnectionInfo | null;
  
  // Error state
  error: ErrorInfo | null;
  
  // Messages and notifications
  messages: Array<{
    id: string;
    sender_id: string;
    content: Uint8Array;
    timestamp: number;
  }>;
  
  // Action methods
  setOffices: (offices: OfficeTS[]) => void;
  setRooms: (rooms: RoomTS[]) => void;
  setMembers: (members: UserTS[]) => void;
  setCurrentOffice: (office: OfficeTS) => void;
  setCurrentRoom: (room: RoomTS) => void;
  setConnectionInfo: (info: ConnectionInfo) => void;
  setError: (error: ErrorInfo | null) => void;
  addMessage: (message: { id: string; sender_id: string; content: Uint8Array; timestamp: number }) => void;
  clearMessages: () => void;
  reset: () => void;
}

// Initial state
const initialState = {
  offices: [],
  rooms: [],
  members: [],
  currentOffice: null,
  currentRoom: null,
  connectionInfo: null,
  error: null,
  messages: []
};

// Create the store
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initialState,
  
  // Set collections
  setOffices: (offices) => set({ offices }),
  setRooms: (rooms) => set({ rooms }),
  setMembers: (members) => set({ members }),
  
  // Set current entities
  setCurrentOffice: (office) => set({ currentOffice: office }),
  setCurrentRoom: (room) => set({ currentRoom: room }),
  
  // Set connection info
  setConnectionInfo: (info) => set({ connectionInfo: info }),
  
  // Set error state
  setError: (error) => set({ error }),
  
  // Message management
  addMessage: (message) => 
    set((state) => ({ 
      messages: [...state.messages, message] 
    })),
  
  clearMessages: () => set({ messages: [] }),
  
  // Reset the entire store to initial state
  reset: () => set(initialState)
}));
