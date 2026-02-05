// Workspace events for WebSocket integration
import { Office, Room, User } from '../types/workspace-entities';
import type { WorkspaceMetadataTS } from '../types/workspace-protocol';
import { eventEmitter } from './event-emitter';

// Type for unlisten function
export type UnlistenFn = () => void;

// Connection information coming from the backend
export interface ConnectionInfo {
  cid: bigint;
  peer_cid?: bigint;
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

export interface WorkspacesPayload {
  workspaces: WorkspaceMetadataTS[];
  connection: ConnectionInfo;
}

export interface ErrorPayload {
  message: string;
  connection: ConnectionInfo;
}

export interface MessagePayload {
  peerCid?: bigint;
  contentLength: number;
  contents?: string;
  connection: ConnectionInfo;
}

// Typing indicator payload
export interface TypingPayload {
  peerCid: bigint;
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
  | 'workspace:created'
  | 'workspace:not-initialized'
  | 'workspaces:listed'
  // Office events
  | 'office:creating'
  | 'office:created'
  | 'office:loading'
  | 'office:updating'
  | 'office:updated'
  | 'office:deleting'
  | 'office:deleted'
  | 'office:loaded'
  | 'offices:loading'
  | 'offices:loaded'
  | 'offices:reload'
  // Room events
  | 'room:creating'
  | 'room:created'
  | 'room:loading'
  | 'room:updating'
  | 'room:updated'
  | 'room:deleting'
  | 'room:deleted'
  | 'room:loaded'
  | 'rooms:loading'
  | 'rooms:loaded'
  | 'rooms:reload'
  // Member events
  | 'member:adding'
  | 'member:added'
  | 'member:loading'
  | 'member:updating_role'
  | 'member:updating_permissions'
  | 'member:removing'
  | 'member:removed'
  | 'member:loaded'
  | 'members:loading'
  | 'members:loaded'
  | 'members:reload'
  | 'member:role-updated'
  | 'user:permissions:loaded'
  // Message events
  | 'message:received'
  | 'typing:started'
  | 'typing:stopped'
  // Operation events
  | 'operation:success'
  | 'operation:error'
  | 'operation:deleted'
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
  public onWorkspaceEvent(event: 'workspace:loaded', callback: (payload: WorkspacePayload) => void): () => void;
  public onWorkspaceEvent(event: 'workspace:loading', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: 'workspace:not-initialized', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: 'workspaces:listed', callback: (payload: WorkspacesPayload) => void): () => void;
  public onWorkspaceEvent(event: 'offices:reload', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: 'rooms:reload', callback: (payload: { office_id?: string; connection: ConnectionInfo }) => void): () => void;
  public onWorkspaceEvent(event: 'members:reload', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: WorkspaceEventType, callback: (payload: any) => void): () => void;
  public onWorkspaceEvent(event: WorkspaceEventType, callback: any): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public onOfficeEvent<T>(event: 'office:loaded', callback: (payload: OfficePayload) => void): () => void;
  public onOfficeEvent<T>(event: 'offices:loaded', callback: (payload: OfficesPayload) => void): () => void;
  public onOfficeEvent<T>(event: 'office:creating' | 'offices:loading' | 'offices:reload', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onOfficeEvent<T>(event: 'office:loading' | 'office:updating' | 'office:deleting', callback: (payload: { office_id: string, connection: ConnectionInfo }) => void): () => void;
  public onOfficeEvent<T>(event: 'office:created' | 'office:updated', callback: (payload: { office: Office, connection: ConnectionInfo }) => void): () => void;
  public onOfficeEvent<T>(event: 'office:deleted', callback: (payload: { officeId: string, connection: ConnectionInfo }) => void): () => void;
  public onOfficeEvent<T>(event: WorkspaceEventType, callback: any): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public onRoomEvent<T>(event: 'room:loaded', callback: (payload: RoomPayload) => void): () => void;
  public onRoomEvent<T>(event: 'rooms:loaded', callback: (payload: RoomsPayload) => void): () => void;
  public onRoomEvent<T>(event: 'room:creating', callback: (payload: { office_id: string, connection: ConnectionInfo }) => void): () => void;
  public onRoomEvent<T>(event: 'room:loading' | 'room:updating' | 'room:deleting', callback: (payload: { room_id: string, connection: ConnectionInfo }) => void): () => void;
  public onRoomEvent<T>(event: 'rooms:loading' | 'rooms:reload', callback: (payload: { office_id: string, connection: ConnectionInfo }) => void): () => void;
  public onRoomEvent<T>(event: 'room:created' | 'room:updated', callback: (payload: { room: Room, connection: ConnectionInfo }) => void): () => void;
  public onRoomEvent<T>(event: 'room:deleted', callback: (payload: { roomId: string, connection: ConnectionInfo }) => void): () => void;
  public onRoomEvent<T>(event: WorkspaceEventType, callback: any): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public onMemberEvent<T>(event: 'member:loaded', callback: (payload: MemberPayload) => void): () => void;
  public onMemberEvent<T>(event: 'members:loaded', callback: (payload: MembersPayload) => void): () => void;
  public onMemberEvent<T>(event: 'member:adding', callback: (payload: { user_id: string, office_id?: string, room_id?: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:loading' | 'member:updating_role', callback: (payload: { user_id: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:updating_permissions', callback: (payload: { userId: string, domainId: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:removing', callback: (payload: { userId: string, officeId?: string, roomId?: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'members:loading', callback: (payload: { officeId?: string, roomId?: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:added', callback: (payload: { member: any, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:removed', callback: (payload: { userId: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:role-updated', callback: (payload: { userId: string, role: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'user:permissions:loaded', callback: (payload: { userId: string, role: string, permissions: any[], domainId: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: WorkspaceEventType, callback: (payload: any) => void): () => void;
  public onMemberEvent<T>(event: WorkspaceEventType, callback: any): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public onMessageEvent(event: 'message:received', callback: (payload: MessagePayload) => void): () => void;
  public onMessageEvent(event: 'typing:started' | 'typing:stopped', callback: (payload: TypingPayload) => void): () => void;
  public onMessageEvent(event: WorkspaceEventType, callback: any): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public onOperationEvent(event: 'operation:success', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onOperationEvent(event: 'operation:error', callback: (payload: ErrorPayload) => void): () => void;
  public onOperationEvent(event: WorkspaceEventType, callback: any): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public onProtocolEvent(event: 'protocol:warning', callback: (payload: ProtocolWarningPayload) => void): () => void {
    const unlistenFn = eventEmitter.on(event, callback);

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
  public cleanupAllListeners(): void {
    for (const [, listeners] of this.listeners.entries()) {
      for (const unlisten of listeners) {
        unlisten();
      }
    }
    this.listeners.clear();
  }
}

// Export a singleton instance
export const workspaceEvents = new WorkspaceEvents();
