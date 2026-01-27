/**
 * event-processor.ts
 * 
 * Central event processing system for the Citadel Workspace application.
 * Handles events from the Rust backend, processes them, and updates UI state.
 */

import { eventEmitter } from './event-emitter';
import { create } from 'zustand';
import { generateRequestId } from './workspace-protocol';

// Import workspace types
import { OfficeTS, RoomTS, UserTS } from '../types/workspace-protocol';

// ==========================================
// State Definitions
// ==========================================

interface ConnectionState {
  connected: boolean;
  cid: string | null;
  error: string | null;
}

interface PeerState {
  peers: Record<string, UserTS>;
  activePeer: string | null;
}

export interface Message {
  id: string;
  peerCid: string;
  content: Uint8Array;
  timestamp: number;
  fromSelf: boolean;
}

interface MessageState {
  messages: Record<string, Message[]>; // peerCid -> messages
}

interface WorkspaceState {
  offices: OfficeTS[];
  rooms: Record<string, RoomTS[]>; // officeId -> rooms
  members: Record<string, UserTS[]>; // roomId or officeId -> members
  currentOffice: string | null;
  currentRoom: string | null;
}

// ==========================================
// Action Definitions
// ==========================================

interface ConnectionActions {
  setConnected: (connected: boolean, cid?: string) => void;
  setConnectionError: (error: string | null) => void;
}

interface PeerActions {
  updatePeers: (peers: UserTS[]) => void;
  setActivePeer: (peerCid: string | null) => void;
}

interface MessageActions {
  addMessage: (message: Message) => void;
}

interface WorkspaceActions {
  updateOffices: (offices: OfficeTS[]) => void;
  updateRooms: (officeId: string, rooms: RoomTS[]) => void;
  updateMembers: (domainId: string, members: UserTS[]) => void;
  setCurrentOffice: (officeId: string | null) => void;
  setCurrentRoom: (roomId: string | null) => void;
}

// ==========================================
// Combined State + Actions
// ==========================================

interface AppState extends
  ConnectionActions,
  PeerActions,
  MessageActions,
  WorkspaceActions {
  connection: ConnectionState;
  peers: PeerState;
  messages: MessageState;
  workspace: WorkspaceState;
}

// ==========================================
// State Store Creation
// ==========================================

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  connection: {
    connected: false,
    cid: null,
    error: null,
  },
  peers: {
    peers: {},
    activePeer: null,
  },
  messages: {
    messages: {},
  },
  workspace: {
    offices: [],
    rooms: {},
    members: {},
    currentOffice: null,
    currentRoom: null,
  },

  // Connection actions
  setConnected: (connected, cid) => set((state) => ({
    connection: {
      ...state.connection,
      connected,
      cid: cid || state.connection.cid,
      error: connected ? null : state.connection.error,
    }
  })),

  setConnectionError: (error) => set((state) => ({
    connection: {
      ...state.connection,
      error,
    }
  })),

  // Peer actions
  updatePeers: (peers) => set((state) => {
    const peersMap = { ...state.peers.peers };
    peers.forEach(peer => {
      peersMap[peer.id] = peer;
    });

    return {
      peers: {
        ...state.peers,
        peers: peersMap,
      }
    };
  }),

  setActivePeer: (peerCid) => set((state) => ({
    peers: {
      ...state.peers,
      activePeer: peerCid,
    }
  })),

  // Message actions
  addMessage: (message) => set((state) => {
    const existingMessages = state.messages.messages[message.peerCid] || [];

    return {
      messages: {
        ...state.messages,
        messages: {
          ...state.messages.messages,
          [message.peerCid]: [...existingMessages, message],
        }
      }
    };
  }),

  // Workspace actions
  updateOffices: (offices) => set((state) => ({
    workspace: {
      ...state.workspace,
      offices,
    }
  })),

  updateRooms: (officeId, rooms) => set((state) => ({
    workspace: {
      ...state.workspace,
      rooms: {
        ...state.workspace.rooms,
        [officeId]: rooms,
      }
    }
  })),

  updateMembers: (domainId, members) => set((state) => ({
    workspace: {
      ...state.workspace,
      members: {
        ...state.workspace.members,
        [domainId]: members,
      }
    }
  })),

  setCurrentOffice: (officeId) => set((state) => ({
    workspace: {
      ...state.workspace,
      currentOffice: officeId,
    }
  })),

  setCurrentRoom: (roomId) => set((state) => ({
    workspace: {
      ...state.workspace,
      currentRoom: roomId,
    }
  })),
}));

// ==========================================
// Event Processor Implementation
// ==========================================

/**
 * Event processor class that handles events from the Rust backend
 * and updates the application state accordingly.
 * 
 * Implemented as a singleton to ensure only one instance exists.
 */
type UnlistenFn = () => void;

export class EventProcessor {
  private static instance: EventProcessor;
  private unlisteners: UnlistenFn[] = [];
  private initialized = false;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the EventProcessor singleton instance
   */
  public static getInstance(): EventProcessor {
    if (!EventProcessor.instance) {
      EventProcessor.instance = new EventProcessor();
    }
    return EventProcessor.instance;
  }

  /**
   * Initialize event listeners
   */
  public initialize(): void {
    if (this.initialized) {
      console.info('Event processor already initialized');
      return;
    }

    // Clean up any existing listeners
    this.cleanup();

    // Set up listeners for all event types
    this.unlisteners = [
      ...this.setupConnectionListeners(),
      ...this.setupPeerListeners(),
      ...this.setupMessageListeners(),
      ...this.setupWorkspaceListeners(),
      ...this.setupErrorListeners(),
    ];

    this.initialized = true;

    console.info('Event processor initialized with all listeners');
  }

  /**
   * Clean up all event listeners
   */
  public cleanup(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
    this.initialized = false;
    console.info('Event processor cleaned up all listeners');
  }

  /**
   * Set up connection event listeners
   */
  private setupConnectionListeners(): UnlistenFn[] {
    const connectionStatusUnlisten = eventEmitter.on('connection-status-changed', (payload: { connected: boolean, cid?: string }) => {
      const { connected, cid } = payload;
      useAppStore.getState().setConnected(connected, cid);
      console.info(`Connection status changed: connected=${connected}, cid=${cid}`);
    });

    return [connectionStatusUnlisten];
  }

  /**
   * Set up peer event listeners
   */
  private setupPeerListeners(): UnlistenFn[] {
    const peerStatusUnlisten = eventEmitter.on('peer-online', (payload: { peer: UserTS }) => {
      const { peer } = payload;
      useAppStore.getState().updatePeers([peer]);
      console.info(`Peer online: ${peer.id}`);
    });

    const peerOfflineUnlisten = eventEmitter.on('peer-offline', (payload: { peer_cid: string }) => {
      const { peer_cid } = payload;
      const peerState = useAppStore.getState().peers;

      if (peerState.peers[peer_cid]) {
        const updatedPeer = {
          ...peerState.peers[peer_cid],
          online: false
        };

        useAppStore.getState().updatePeers([updatedPeer]);
        console.info(`Peer offline: ${peer_cid}`);
      }
    });

    return [peerStatusUnlisten, peerOfflineUnlisten];
  }

  /**
   * Set up message event listeners
   */
  private setupMessageListeners(): UnlistenFn[] {
    const messageReceivedUnlisten = eventEmitter.on('message:received', (payload: {
      connection: { cid: string, peer_cid: string, request_id?: string },
      contents: string
    }) => {
      const { connection, contents } = payload;

      // Decode contents from base64 if necessary or parse as needed
      let contentBytes: Uint8Array;
      try {
        // Attempt to parse as string first
        contentBytes = new TextEncoder().encode(contents);
      } catch (error) {
        console.error('Failed to process message contents:', error);
        return;
      }

      const message: Message = {
        id: connection.request_id || generateRequestId(),
        peerCid: connection.peer_cid,
        content: contentBytes,
        timestamp: Date.now(),
        fromSelf: false
      };

      useAppStore.getState().addMessage(message);
      console.info(`Message received from peer ${connection.peer_cid}`);
    });

    return [messageReceivedUnlisten];
  }

  /**
   * Set up workspace event listeners
   */
  private setupWorkspaceListeners(): UnlistenFn[] {
    const officeLoadedUnlisten = eventEmitter.on('office:loaded', (payload: {
      office: OfficeTS,
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { office } = payload;

      useAppStore.getState().updateOffices([office]);
      console.info(`Office loaded: ${office.id}`);
    });

    const officesLoadedUnlisten = eventEmitter.on('offices:loaded', (payload: {
      offices: OfficeTS[],
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { offices } = payload;

      useAppStore.getState().updateOffices(offices);
      console.info(`${offices.length} offices loaded`);
    });

    const roomLoadedUnlisten = eventEmitter.on('room:loaded', (payload: {
      room: RoomTS,
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { room } = payload;

      const officeId = room.office_id;
      const existingRooms = useAppStore.getState().workspace.rooms[officeId] || [];

      // Replace room if it exists, otherwise add it
      const updatedRooms = existingRooms.map(r =>
        r.id === room.id ? room : r
      );

      if (!updatedRooms.some(r => r.id === room.id)) {
        updatedRooms.push(room);
      }

      useAppStore.getState().updateRooms(officeId, updatedRooms);
      console.info(`Room loaded: ${room.id} in office ${officeId}`);
    });

    const roomsLoadedUnlisten = eventEmitter.on('rooms:loaded', (payload: {
      rooms: RoomTS[],
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { rooms } = payload;

      // Group rooms by office ID
      const roomsByOffice: Record<string, RoomTS[]> = {};

      rooms.forEach(room => {
        const officeId = room.office_id;
        if (!roomsByOffice[officeId]) {
          roomsByOffice[officeId] = [];
        }
        roomsByOffice[officeId].push(room);
      });

      // Update rooms for each office
      Object.entries(roomsByOffice).forEach(([officeId, officeRooms]) => {
        useAppStore.getState().updateRooms(officeId, officeRooms);
      });

      console.info(`${rooms.length} rooms loaded across ${Object.keys(roomsByOffice).length} offices`);
    });

    const membersLoadedUnlisten = eventEmitter.on('members:loaded', (payload: {
      members: UserTS[],
      domain_id: string, // office_id or room_id
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { members, domain_id } = payload;

      useAppStore.getState().updateMembers(domain_id, members);
      console.info(`${members.length} members loaded for domain ${domain_id}`);
    });

    return [
      officeLoadedUnlisten,
      officesLoadedUnlisten,
      roomLoadedUnlisten,
      roomsLoadedUnlisten,
      membersLoadedUnlisten
    ];
  }

  /**
   * Set up error event listeners
   */
  private setupErrorListeners(): UnlistenFn[] {
    const operationErrorUnlisten = eventEmitter.on('operation:error', (payload: {
      message: string,
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { message } = payload;

      useAppStore.getState().setConnectionError(message);

      console.error(`Operation error: ${message}`);
    });

    const protocolWarningUnlisten = eventEmitter.on('protocol:warning', (payload: {
      message: string,
      connection: { cid: string, peer_cid?: string, request_id?: string }
    }) => {
      const { message } = payload;

      // Log warning but don't update error state
      console.warn(`Protocol warning: ${message}`);
    });

    return [operationErrorUnlisten, protocolWarningUnlisten];
  }
}

// Export singleton instance
export const eventProcessor = EventProcessor.getInstance();
