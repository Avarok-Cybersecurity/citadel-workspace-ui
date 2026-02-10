import { SecurityLevel } from '@/types';
import { WorkspaceProtocolPayloadTS, WorkspaceProtocolRequestTS, GroupMessageTypeTS, PermissionTS, UpdateOperationTS } from '@/types/workspace-protocol';
import { Office, GroupMessageType } from '@/types/workspace-entities';
import { websocketService } from './websocket-service';
import type { WorkspaceProtocolRequest } from 'citadel-workspace-client-ts';
import { workspaceResponseHandler } from './workspace-response-handler';
import { eventEmitter } from './event-emitter';

/**
 * Workspace Service
 * 
 * Provides methods for interacting with workspace protocol via the message command.
 * WorkspaceProtocolRequests/Responses/Payloads ONLY work over the Message variant
 * for InternalServiceCommands.
 * 
 * NOTE: This should only work for servers, not clients. Commands for clients should go via workspace-protocl.ts
 */
export class WorkspaceService {
  private static instance: WorkspaceService;
  private currentCid: bigint | null = null;

  private constructor() { }

  /**
   * Get the singleton instance of the workspace service
   */
  public static getInstance(): WorkspaceService {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }

  /**
   * Set the current connection ID
   * @param cid Connection ID
   */
  public setConnectionId(cid: bigint): void {
    console.log('[WorkspaceService] setConnectionId called:', {
      newCid: cid.toString(),
      oldCid: this.currentCid?.toString() ?? 'null',
    });
    this.currentCid = cid;
  }

  private sendProtocolRequest(request: WorkspaceProtocolRequestTS): Promise<void> {
    return this.sendWorkspaceRequest({ Request: request });
  }

  /**
   * Send a workspace protocol request
   * @param request The workspace protocol request object
   * @returns Promise resolving to success or error
   */
  public async sendWorkspaceRequest(payload: WorkspaceProtocolPayloadTS): Promise<void> {
    if (!this.currentCid) {
      throw new Error('No active connection available. Please connect first.');
    }

    // NOTE: Don't check websocketService.getClient() here!
    // Follower tabs don't have a WebSocket client - they proxy through the leader.
    // websocketService.sendWorkspaceRequest() handles this routing automatically.

    try {
      console.info('[WorkspaceService] Sending payload:', payload);
      
      // Convert TypeScript payload to the format expected by the client
      let request: WorkspaceProtocolRequest;
      
      if ('Request' in payload && payload.Request) {
        // Map the TypeScript request format to the Rust format
        const tsRequest = payload.Request;
        
        // Convert based on the request type
        if ('GetWorkspace' in tsRequest) {
          const ws = tsRequest.GetWorkspace;
          // GetWorkspace changed from unit variant to struct with optional workspace_id
          request = {
            GetWorkspace: {
              workspace_id: (ws && typeof ws === 'object' && 'workspace_id' in ws) ? ws.workspace_id ?? null : null
            }
          };
        } else if ('ListWorkspaces' in tsRequest) {
          request = 'ListWorkspaces';
        } else if ('CreateWorkspace' in tsRequest) {
          const req = tsRequest.CreateWorkspace!;
          request = {
            CreateWorkspace: {
              name: req.name,
              description: req.description,
              workspace_master_password: req.workspace_master_password,
              metadata: req.metadata
            }
          };
        } else if ('UpdateWorkspace' in tsRequest) {
          const req = tsRequest.UpdateWorkspace!;
          request = {
            UpdateWorkspace: {
              workspace_id: req.workspace_id ?? null,
              name: req.name,
              description: req.description,
              workspace_master_password: req.workspace_master_password,
              metadata: req.metadata
            }
          };
        } else if ('ListOffices' in tsRequest) {
          request = 'ListOffices';
        } else {
          // For other request types, pass through as-is for now
          request = tsRequest as any;
        }
      } else {
        throw new Error('Invalid workspace protocol payload');
      }

      await websocketService.sendWorkspaceRequest(this.currentCid, request);
      console.info('[WorkspaceService] Request sent successfully');

    } catch (error) {
      if (error instanceof Error) {
        console.error(`[WorkspaceService] Error sending request:`, error.message);
        throw error;
      } else {
        console.error(`[WorkspaceService] Unknown error sending request:`, error);
        throw new Error('An unknown error occurred while sending the workspace request.');
      }
    }
  }

  /**
   * Load workspace data
   * This will trigger a workspace:loaded event when complete
   */
  public async loadWorkspace(): Promise<any> {
    console.log('[WorkspaceService] loadWorkspace called with CID:', this.currentCid?.toString());

    // Emit loading event
    workspaceResponseHandler.emitLoadingEvent('workspace:loading');

    // Use GetWorkspace variant to load workspace with metadata
    const requestPart: WorkspaceProtocolRequestTS = {
      GetWorkspace: null
    };
    console.log('[WorkspaceService] Sending GetWorkspace request');
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get a workspace by ID (defaults to sentinel root workspace)
   */
  public async getWorkspace(workspaceId?: string): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetWorkspace: { workspace_id: workspaceId ?? null }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * List all workspaces the current user has access to
   */
  public async listWorkspaces(): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      ListWorkspaces: null
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * List available offices
   */
  public async listOffices(): Promise<any> {
    // Emit loading event
    workspaceResponseHandler.emitLoadingEvent('offices:loading');
    
    // NOTE: Using ListOffices variant to match Rust enum.
    const requestPart: WorkspaceProtocolRequestTS = {
      // Changed from true to null for unit variant
      ListOffices: null
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * List rooms within an office
   * @param officeId The ID of the office
   */
  public async listRooms(officeId: string): Promise<any> {
    // Emit loading event
    workspaceResponseHandler.emitLoadingEvent('rooms:loading', { officeId });
    
    // NOTE: Using ListRooms variant to match Rust enum.
    const requestPart: WorkspaceProtocolRequestTS = {
      ListRooms: { office_id: officeId }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Create a new workspace
   * @param name The workspace name
   * @param description The workspace description
   * @param masterPassword The master password for admin operations
   * @param metadata Optional metadata
   */
  public async createWorkspace(name: string, description: string, masterPassword: string, metadata?: Uint8Array): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      CreateWorkspace: {
        name,
        description,
        workspace_master_password: masterPassword,
        metadata: metadata ? Array.from(metadata) : undefined
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Update an existing workspace
   * @param name The workspace name (optional)
   * @param description The workspace description (optional)
   * @param masterPassword The master password for admin operations
   * @param metadata Optional metadata
   */
  public async updateWorkspace(name?: string, description?: string, masterPassword?: string, metadata?: Uint8Array): Promise<any> {
    const requestPart = {
      UpdateWorkspace: {
        name,
        description,
        workspace_master_password: masterPassword,
        metadata: metadata ? Array.from(metadata) : undefined
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Create a new office
   * @param workspaceId The workspace ID
   * @param name The office name
   * @param description The office description
   * @param mdxContent Optional MDX content
   * @param metadata Optional metadata
   */
  public async createOffice(
    workspaceId: string,
    name: string,
    description: string,
    mdxContent?: string,
    metadata?: Uint8Array
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      CreateOffice: {
        workspace_id: workspaceId,
        name,
        description,
        mdx_content: mdxContent,
        metadata: metadata ? Array.from(metadata) : undefined
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get an office by ID
   * @param officeId The office ID
   */
  public async getOffice(officeId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetOffice: { office_id: officeId }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Update an office
   * @param officeId The office ID
   * @param updates The fields to update
   */
  public async updateOffice(
    officeId: string,
    updates: {
      name?: string;
      description?: string;
      mdxContent?: string;
      metadata?: Uint8Array;
      is_default?: boolean;
    }
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      UpdateOffice: {
        office_id: officeId,
        name: updates.name,
        description: updates.description,
        mdx_content: updates.mdxContent,
        metadata: updates.metadata ? Array.from(updates.metadata) : undefined,
        is_default: updates.is_default
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Delete an office
   * @param officeId The office ID
   */
  public async deleteOffice(officeId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      DeleteOffice: { office_id: officeId }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Create a new room
   * @param officeId The office ID
   * @param name The room name
   * @param description The room description
   * @param mdxContent Optional MDX content
   * @param metadata Optional metadata
   */
  public async createRoom(
    officeId: string,
    name: string,
    description: string,
    mdxContent?: string,
    metadata?: Uint8Array
  ): Promise<any> {
    const requestPart = {
      CreateRoom: {
        office_id: officeId,
        name,
        description,
        mdx_content: mdxContent,
        metadata: metadata ? Array.from(metadata) : undefined
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get a room by ID
   * @param roomId The room ID
   */
  public async getRoom(roomId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetRoom: { room_id: roomId }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Update a room
   * @param roomId The room ID
   * @param updates The fields to update
   */
  public async updateRoom(
    roomId: string,
    updates: {
      name?: string;
      description?: string;
      mdxContent?: string;
      metadata?: Uint8Array;
    }
  ): Promise<any> {
    const requestPart = {
      UpdateRoom: {
        room_id: roomId,
        name: updates.name,
        description: updates.description,
        mdx_content: updates.mdxContent,
        metadata: updates.metadata ? Array.from(updates.metadata) : undefined
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Delete a room
   * @param roomId The room ID
   */
  public async deleteRoom(roomId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      DeleteRoom: { room_id: roomId }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Add a member to an office or room
   * @param userId The user ID
   * @param role The user role
   * @param officeId Optional office ID
   * @param roomId Optional room ID
   * @param metadata Optional metadata
   */
  public async addMember(
    userId: string,
    role: any, // UserRole type
    officeId?: string,
    roomId?: string,
    metadata?: Uint8Array
  ): Promise<any> {
    const requestPart = {
      AddMember: {
        user_id: userId,
        office_id: officeId,
        room_id: roomId,
        role,
        metadata: metadata ? Array.from(metadata) : undefined
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get a member by ID
   * @param userId The user ID
   */
  public async getMember(userId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetMember: { user_id: userId }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Update a member's role
   * @param userId The user ID
   * @param role The new role
   * @param metadata Optional metadata
   */
  public async updateMemberRole(
    userId: string,
    role: any, // UserRole type
    metadata?: Uint8Array
  ): Promise<any> {
    const requestPart = {
      UpdateMemberRole: {
        user_id: userId,
        role,
        metadata: metadata ? Array.from(metadata) : undefined
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Update a member's permissions
   * @param userId The user ID
   * @param domainId The domain ID
   * @param permissions The permissions to update
   * @param operation The update operation (Add, Set, Remove)
   */
  public async updateMemberPermissions(
    userId: string,
    domainId: string,
    permissions: PermissionTS[],
    operation: UpdateOperationTS
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      UpdateMemberPermissions: {
        user_id: userId,
        domain_id: domainId,
        permissions,
        operation
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Remove a member from an office or room
   * @param userId The user ID
   * @param officeId Optional office ID
   * @param roomId Optional room ID
   */
  public async removeMember(
    userId: string,
    officeId?: string,
    roomId?: string
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      RemoveMember: {
        user_id: userId,
        office_id: officeId,
        room_id: roomId
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * List members in a workspace, office, or room
   * @param officeId Optional office ID
   * @param roomId Optional room ID
   */
  public async listMembers(officeId?: string, roomId?: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      ListMembers: {
        office_id: officeId,
        room_id: roomId
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get a user's permissions for a specific domain
   * @param userId The user ID
   * @param domainId The domain ID (workspace, office, or room)
   */
  public async getUserPermissions(userId: string, domainId: string): Promise<any> {
    const requestPart = {
      GetUserPermissions: {
        user_id: userId,
        domain_id: domainId
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Send a message via workspace protocol
   * @param contents The message contents (can be any subprotocol)
   */
  public async sendMessage(contents: Uint8Array): Promise<any> {
    const requestPart = {
      Message: {
        contents: new Uint8Array(contents)
      }
    } as WorkspaceProtocolRequestTS;
    return this.sendProtocolRequest(requestPart);
  }

  // ========== Group Messaging Methods ==========

  /**
   * Send a group message to a chat channel
   * @param groupId The group/channel ID (office or room chat_channel_id)
   * @param content The message content
   * @param messageType Type of message (Text, Markdown, System)
   * @param replyTo Optional parent message ID for threading
   * @param mentions Optional list of mentioned usernames
   */
  public async sendGroupMessage(
    groupId: string,
    content: string,
    messageType: GroupMessageTypeTS = GroupMessageTypeTS.Text,
    replyTo?: string,
    mentions?: string[]
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      SendGroupMessage: {
        group_id: groupId,
        message_type: messageType,
        content,
        reply_to: replyTo,
        mentions
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Edit an existing group message
   * @param groupId The group/channel ID
   * @param messageId The message ID to edit
   * @param newContent The new message content
   */
  public async editGroupMessage(
    groupId: string,
    messageId: string,
    newContent: string
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      EditGroupMessage: {
        group_id: groupId,
        message_id: messageId,
        new_content: newContent
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Delete a group message
   * @param groupId The group/channel ID
   * @param messageId The message ID to delete
   */
  public async deleteGroupMessage(
    groupId: string,
    messageId: string
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      DeleteGroupMessage: {
        group_id: groupId,
        message_id: messageId
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get paginated group messages
   * @param groupId The group/channel ID
   * @param beforeTimestamp Optional timestamp to fetch messages before (for pagination)
   * @param limit Maximum number of messages to return (default 50)
   */
  public async getGroupMessages(
    groupId: string,
    beforeTimestamp?: number,
    limit: number = 50
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetGroupMessages: {
        group_id: groupId,
        before_timestamp: beforeTimestamp,
        limit
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get thread messages (replies to a parent message)
   * @param groupId The group/channel ID
   * @param parentMessageId The parent message ID
   */
  public async getThreadMessages(
    groupId: string,
    parentMessageId: string
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetThreadMessages: {
        group_id: groupId,
        parent_message_id: parentMessageId
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  // ========== User Profile Methods ==========

  /**
   * Update the current user's profile
   * @param name Optional new display name
   * @param avatarData Optional base64-encoded avatar image (WebP format)
   */
  public async updateUserProfile(
    name?: string,
    avatarData?: string
  ): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      UpdateUserProfile: {
        name,
        avatar_data: avatarData
      }
    };
    return this.sendProtocolRequest(requestPart);
  }

  // ========== Generic Tree Node Methods ==========

  /**
   * Create a node in the workspace hierarchy.
   * @param parentId Parent node ID (null for root-level nodes)
   * @param entityType The node entity type (e.g., { Child: "Office" })
   * @param name Node name
   * @param description Node description
   * @param options Optional fields: mdxContent, metadata, isDefault
   */
  public async createNode(
    parentId: string | null,
    entityType: { Child: string } | 'Workspace',
    name: string,
    description: string,
    options?: { mdxContent?: string; metadata?: Uint8Array; isDefault?: boolean },
  ): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      CreateNode: {
        parent_id: parentId,
        entity_type: entityType,
        name,
        description,
        mdx_content: options?.mdxContent,
        metadata: options?.metadata ? Array.from(options.metadata) : undefined,
        is_default: options?.isDefault,
      },
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Update an existing node.
   */
  public async updateNode(
    nodeId: string,
    updates: {
      name?: string;
      description?: string;
      mdxContent?: string;
      rules?: string;
      chatEnabled?: boolean;
      isDefault?: boolean;
    },
  ): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      UpdateNode: {
        node_id: nodeId,
        name: updates.name,
        description: updates.description,
        mdx_content: updates.mdxContent,
        rules: updates.rules,
        chat_enabled: updates.chatEnabled,
        is_default: updates.isDefault,
      },
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Delete a node and optionally cascade-delete its children.
   */
  public async deleteNode(nodeId: string, cascade: boolean = true): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      DeleteNode: { node_id: nodeId, cascade },
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * List nodes, optionally filtered by parent or entity types.
   */
  public async listNodes(
    parentId?: string | null,
    entityTypes?: Array<{ Child: string } | 'Workspace'>,
  ): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      ListNodes: {
        parent_id: parentId,
        entity_types: entityTypes,
      },
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get the full tree structure starting from a root node.
   */
  public async getTreeStructure(rootId?: string, maxDepth?: number): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetTreeStructure: {
        root_id: rootId ?? null,
        max_depth: maxDepth,
      },
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Get the current tree schema (nesting rules).
   */
  public async getTreeSchema(): Promise<void> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetTreeSchema: null,
    };
    return this.sendProtocolRequest(requestPart);
  }

  // ========== Server Capabilities Methods ==========

  /**
   * Get server file transfer and storage capabilities
   * Returns configuration for RE-VFS storage, file transfers, etc.
   */
  public async getServerCapabilities(): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetServerCapabilities: null
    };
    return this.sendProtocolRequest(requestPart);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Any cleanup needed
  }

  // ========== Raw Protocol Request (for testing) ==========

  /**
   * Send a raw WorkspaceProtocol request directly and wait for response.
   * This method is primarily for testing purposes to enable protocol-level tests.
   * @param request The raw protocol request object (e.g., { CreateNode: { ... } })
   * @param timeoutMs Timeout in milliseconds (default: 15000)
   * @returns Promise resolving to the response
   */
  public async sendRequest(request: WorkspaceProtocolRequest, timeoutMs: number = 15000): Promise<unknown> {
    if (!this.currentCid) {
      throw new Error('No active connection available. Please connect first.');
    }

    console.info('[WorkspaceService] sendRequest (raw):', JSON.stringify(request).substring(0, 200));

    // Determine expected response type based on request
    // Handle both string (unit variant) and object (struct variant) requests
    const requestType = typeof request === 'string' ? request : Object.keys(request)[0];
    const expectedResponseTypes = this.getExpectedResponseTypes(requestType);

    // Create a promise that resolves when we get a matching response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        eventEmitter.off('workspace:raw-response', handler);
        reject(new Error(`Request timed out after ${timeoutMs}ms waiting for response to ${requestType}`));
      }, timeoutMs);

      const handler = (response: unknown) => {
        // Check if this response matches what we expect
        if (response && typeof response === 'object') {
          const responseType = Object.keys(response)[0];
          if (expectedResponseTypes.includes(responseType) || responseType === 'Error') {
            clearTimeout(timeoutId);
            eventEmitter.off('workspace:raw-response', handler);
            resolve(response);
          }
          // Otherwise, keep waiting for the right response
        }
      };

      eventEmitter.on('workspace:raw-response', handler);
    });

    // Send the request (fire-and-forget)
    await websocketService.sendWorkspaceRequest(this.currentCid, request);

    // Wait for the response
    return responsePromise;
  }

  /**
   * Map request types to their expected response types
   */
  private getExpectedResponseTypes(requestType: string): string[] {
    const mapping: Record<string, string[]> = {
      // Tree node operations
      CreateNode: ['Node'],
      GetNode: ['Node'],
      UpdateNode: ['Node'],
      DeleteNode: ['NodeDeleted'],
      MoveNode: ['NodeMoved'],
      ListNodes: ['Nodes'],
      GetTreeStructure: ['TreeStructure'],
      GetTreeSchema: ['TreeSchema'],
      UpdateTreeSchema: ['TreeSchema', 'Success'],
      CreateNodeType: ['NodeTypes', 'Success'],
      ListNodeTypes: ['NodeTypes'],
      // Workspace operations
      GetWorkspace: ['Workspace', 'WorkspaceNotInitialized'],
      ListWorkspaces: ['Workspaces'],
      CreateWorkspace: ['Workspace'],
      UpdateWorkspace: ['Workspace', 'Success'],
      // Office operations (backend returns Node/Nodes after DomainNode migration)
      CreateOffice: ['Node', 'Office'],
      GetOffice: ['Node', 'Office'],
      UpdateOffice: ['Node', 'Office', 'Success'],
      DeleteOffice: ['DeleteOffice', 'Success'],
      ListOffices: ['Nodes', 'Offices'],
      // Room operations (backend returns Node/Nodes after DomainNode migration)
      CreateRoom: ['Node', 'Room'],
      GetRoom: ['Node', 'Room'],
      UpdateRoom: ['Node', 'Room', 'Success'],
      DeleteRoom: ['DeleteRoom', 'Success'],
      ListRooms: ['Nodes', 'Rooms'],
      // Member operations
      AddMember: ['Member', 'Success'],
      RemoveMember: ['Success'],
      UpdateMemberRole: ['MemberRoleUpdated', 'Success'],
      ListMembers: ['Members'],
    };

    return mapping[requestType] || ['Success'];
  }
}

// Export singleton instance for convenience
export default WorkspaceService.getInstance();

// Expose for testing - allows protocol-level integration tests
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__workspaceService = WorkspaceService.getInstance();
}
