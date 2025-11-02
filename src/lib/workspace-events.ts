// Workspace events for WebSocket integration
import { Office, Room, User } from '../types/workspace-entities';
import { websocketService, type InternalServiceResponse } from './websocket-service';
import { listen } from './event-emitter';

// Type for unlisten function
export type UnlistenFn = () => void;

// Connection information coming from the backend
export interface ConnectionInfo {
  cid: number;
  peer_cid?: number;
  request_id: string;
}

// Event payload types for different events
export interface WorkspacePayload {
  workspace: {
    id: string;
    name: string;
    metadata?: Record<string, any>;
  };
  connection: ConnectionInfo;
}

export interface OfficePayload {
  office: Office;
  connection: ConnectionInfo;
}

export interface OfficesPayload {
  offices: Office[];
  connection: ConnectionInfo;
}

export interface RoomPayload {
  room: Room;
  connection: ConnectionInfo;
}

export interface RoomsPayload {
  rooms: Room[];
  connection: ConnectionInfo;
}

export interface MemberPayload {
  member: User;
  connection: ConnectionInfo;
}

export interface MembersPayload {
  members: User[];
  connection: ConnectionInfo;
}

export interface ErrorPayload {
  message: string;
  connection: ConnectionInfo;
}

export interface MessagePayload {
  peerCid?: number;
  contentLength: number;
  contents?: string;
  connection: ConnectionInfo;
}

// Typing indicator payload
export interface TypingPayload {
  peerCid: number;
  connection: ConnectionInfo;
}

// Protocol warning payload for unexpected request types
export interface ProtocolWarningPayload {
  message: string;
  requestType: string;
  connection: ConnectionInfo;
}

// Define all event types
export type WorkspaceEventType = 
  // Workspace events
  | 'workspace:loading'
  | 'workspace:loaded'
  | 'workspace:not-initialized'
  // Office events
  | 'office:creating'
  | 'office:loading'
  | 'office:updating'
  | 'office:deleting'
  | 'office:loaded'
  | 'offices:loading'
  | 'offices:loaded'
  // Room events
  | 'room:creating'
  | 'room:loading'
  | 'room:updating'
  | 'room:deleting'
  | 'room:loaded'
  | 'rooms:loading'
  | 'rooms:loaded'
  // Member events
  | 'member:adding'
  | 'member:loading'
  | 'member:updating_role'
  | 'member:updating_permissions'
  | 'member:removing'
  | 'member:loaded'
  | 'members:loading'
  | 'members:loaded'
  // Message events
  | 'message:received'
  | 'typing:started'
  | 'typing:stopped'
  // Operation events
  | 'operation:success'
  | 'operation:error'
  // Protocol events
  | 'protocol:warning';

/**
 * Helper class to manage workspace event listeners
 */
export class WorkspaceEvents {
  private listeners: Map<string, UnlistenFn[]> = new Map();

  /**
   * Listen for workspace events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onWorkspaceEvent(event: 'workspace:loaded', callback: (payload: WorkspacePayload) => void): Promise<() => void>;
  public async onWorkspaceEvent(event: 'workspace:loading', callback: (connectionInfo: ConnectionInfo) => void): Promise<() => void>;
  public async onWorkspaceEvent(event: 'workspace:not-initialized', callback: (connectionInfo: ConnectionInfo) => void): Promise<() => void>;
  public async onWorkspaceEvent(event: WorkspaceEventType, callback: any): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Listen for office events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onOfficeEvent<T>(event: 'office:loaded', callback: (payload: OfficePayload) => void): Promise<() => void>;
  public async onOfficeEvent<T>(event: 'offices:loaded', callback: (payload: OfficesPayload) => void): Promise<() => void>;
  public async onOfficeEvent<T>(event: 'office:creating' | 'offices:loading', callback: (connectionInfo: ConnectionInfo) => void): Promise<() => void>;
  public async onOfficeEvent<T>(event: 'office:loading' | 'office:updating' | 'office:deleting', callback: (payload: { office_id: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onOfficeEvent<T>(event: WorkspaceEventType, callback: any): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Listen for room events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onRoomEvent<T>(event: 'room:loaded', callback: (payload: RoomPayload) => void): Promise<() => void>;
  public async onRoomEvent<T>(event: 'rooms:loaded', callback: (payload: RoomsPayload) => void): Promise<() => void>;
  public async onRoomEvent<T>(event: 'room:creating', callback: (payload: { office_id: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onRoomEvent<T>(event: 'room:loading' | 'room:updating' | 'room:deleting', callback: (payload: { room_id: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onRoomEvent<T>(event: 'rooms:loading', callback: (payload: { office_id: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onRoomEvent<T>(event: WorkspaceEventType, callback: any): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Listen for member events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onMemberEvent<T>(event: 'member:loaded', callback: (payload: MemberPayload) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: 'members:loaded', callback: (payload: MembersPayload) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: 'member:adding', callback: (payload: { user_id: string, office_id?: string, room_id?: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: 'member:loading' | 'member:updating_role', callback: (payload: { user_id: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: 'member:updating_permissions', callback: (payload: { userId: string, domainId: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: 'member:removing', callback: (payload: { userId: string, officeId?: string, roomId?: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: 'members:loading', callback: (payload: { officeId?: string, roomId?: string, connection: ConnectionInfo }) => void): Promise<() => void>;
  public async onMemberEvent<T>(event: WorkspaceEventType, callback: any): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Listen for message events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onMessageEvent(event: 'message:received', callback: (payload: MessagePayload) => void): Promise<() => void>;
  public async onMessageEvent(event: 'typing:started' | 'typing:stopped', callback: (payload: TypingPayload) => void): Promise<() => void>;
  public async onMessageEvent(event: WorkspaceEventType, callback: any): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Listen for operation events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onOperationEvent(event: 'operation:success', callback: (connectionInfo: ConnectionInfo) => void): Promise<() => void>;
  public async onOperationEvent(event: 'operation:error', callback: (payload: ErrorPayload) => void): Promise<() => void>;
  public async onOperationEvent(event: WorkspaceEventType, callback: any): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Listen for protocol events
   * @param event Event type to listen for
   * @param callback Callback function to be called when event is received
   * @returns A function to unsubscribe from the event
   */
  public async onProtocolEvent(event: 'protocol:warning', callback: (payload: ProtocolWarningPayload) => void): Promise<() => void> {
    const unlistenFn = await listen(event, ({ payload }) => {
      callback(payload as ProtocolWarningPayload);
    });

    // Store the unlisten function
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);

    // Return a function to unsubscribe from this specific event
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Clean up all event listeners
   */
  public async cleanupAllListeners(): Promise<void> {
    for (const [, listeners] of this.listeners.entries()) {
      for (const unlisten of listeners) {
        await unlisten();
      }
    }
    this.listeners.clear();
  }
}

// Export a singleton instance
export const workspaceEvents = new WorkspaceEvents();
