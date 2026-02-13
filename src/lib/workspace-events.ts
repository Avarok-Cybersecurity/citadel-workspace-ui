// Workspace events for WebSocket integration
import { User } from '../types/workspace-entities';
import type { WorkspaceMetadataTS } from '../types/workspace-protocol';
import type { DomainNode, TreeNode, TreeSchema } from '@/components/layout/sidebar/TreeNodesSection';
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
    metadata?: Record<string, unknown>;
  };
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
  // Node events (generic hierarchy)
  | 'node:loaded'
  | 'node:deleted'
  | 'node:moved'
  | 'nodes:loading'
  | 'nodes:loaded'
  | 'tree:structure:loaded'
  | 'tree:schema:loaded'
  | 'node:types:loaded'
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

  // PINCH POINT: Implementation accepts any callback type to bridge overloaded signatures.
  // TypeScript overloads require the implementation to accept ALL overload parameter types.
  private registerListener(event: WorkspaceEventType, callback: (...args: any[]) => void): () => void {
    const unlistenFn = eventEmitter.on(event, callback);
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(unlistenFn);
    return () => {
      unlistenFn();
      const listeners = this.listeners.get(event) || [];
      const index = listeners.indexOf(unlistenFn);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  // Workspace events
  public onWorkspaceEvent(event: 'workspace:loaded', callback: (payload: WorkspacePayload) => void): () => void;
  public onWorkspaceEvent(event: 'workspace:loading', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: 'workspace:not-initialized', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: 'workspaces:listed', callback: (payload: WorkspacesPayload) => void): () => void;
  public onWorkspaceEvent(event: 'members:reload', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onWorkspaceEvent(event: WorkspaceEventType, callback: (payload: any) => void): () => void;
  public onWorkspaceEvent(event: WorkspaceEventType, callback: (...args: any[]) => void): () => void {
    return this.registerListener(event, callback);
  }

  // Node events (generic hierarchy)
  public onNodeEvent(event: 'node:loaded', callback: (payload: { node: DomainNode; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: 'nodes:loaded', callback: (payload: { nodes: DomainNode[]; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: 'nodes:loading', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onNodeEvent(event: 'node:deleted', callback: (payload: { nodeId: string; childrenDeleted: string[]; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: 'node:moved', callback: (payload: { nodeId: string; oldParentId: string | null; newParentId: string | null; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: 'tree:structure:loaded', callback: (payload: { root: TreeNode; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: 'tree:schema:loaded', callback: (payload: { schema: TreeSchema; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: 'node:types:loaded', callback: (payload: { nodeTypes: unknown[]; connection: ConnectionInfo }) => void): () => void;
  public onNodeEvent(event: WorkspaceEventType, callback: (payload: any) => void): () => void;
  public onNodeEvent(event: WorkspaceEventType, callback: (...args: any[]) => void): () => void {
    return this.registerListener(event, callback);
  }

  // Member events
  public onMemberEvent<T>(event: 'member:loaded', callback: (payload: MemberPayload) => void): () => void;
  public onMemberEvent<T>(event: 'members:loaded', callback: (payload: MembersPayload) => void): () => void;
  public onMemberEvent<T>(event: 'member:adding', callback: (payload: { user_id: string, domain_id?: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:loading' | 'member:updating_role', callback: (payload: { user_id: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:updating_permissions', callback: (payload: { userId: string, domainId: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:removing', callback: (payload: { userId: string, domainId?: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'members:loading', callback: (payload: { domainId?: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:added', callback: (payload: { member: User, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:removed', callback: (payload: { userId: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'member:role-updated', callback: (payload: { userId: string, role: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: 'user:permissions:loaded', callback: (payload: { userId: string, role: string, permissions: unknown[], domainId: string, connection: ConnectionInfo }) => void): () => void;
  public onMemberEvent<T>(event: WorkspaceEventType, callback: (payload: any) => void): () => void;
  public onMemberEvent<T>(event: WorkspaceEventType, callback: (...args: any[]) => void): () => void {
    return this.registerListener(event, callback);
  }

  // Message events
  public onMessageEvent(event: 'message:received', callback: (payload: MessagePayload) => void): () => void;
  public onMessageEvent(event: 'typing:started' | 'typing:stopped', callback: (payload: TypingPayload) => void): () => void;
  public onMessageEvent(event: WorkspaceEventType, callback: (...args: any[]) => void): () => void {
    return this.registerListener(event, callback);
  }

  // Operation events
  public onOperationEvent(event: 'operation:success', callback: (connectionInfo: ConnectionInfo) => void): () => void;
  public onOperationEvent(event: 'operation:error', callback: (payload: ErrorPayload) => void): () => void;
  public onOperationEvent(event: WorkspaceEventType, callback: (...args: any[]) => void): () => void {
    return this.registerListener(event, callback);
  }

  // Protocol events
  public onProtocolEvent(event: 'protocol:warning', callback: (payload: ProtocolWarningPayload) => void): () => void {
    return this.registerListener(event, callback);
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
