import { SecurityLevel } from '@/types';
import { WorkspaceProtocolPayloadTS, WorkspaceProtocolRequestTS, GroupMessageTypeTS } from '@/types/workspace-protocol';
import { Office, GroupMessageType } from '@/types/workspace-entities';
import { websocketService } from './websocket-service';
import type { WorkspaceProtocolRequest } from 'citadel-workspace-client-ts';
import { workspaceResponseHandler } from './workspace-response-handler';

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
    this.currentCid = cid;
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
          request = 'GetWorkspace';
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
    // Construct the full payload expected by the Rust command (PascalCase 'Request')
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    console.log('[WorkspaceService] Sending GetWorkspace request');
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Get the current workspace
   * This will trigger a workspace:loaded event when complete
   */
  public async getWorkspace(): Promise<any> {
    // NOTE: WorkspaceProtocolRequestTS doesn't define 'GetWorkspace'. 
    // Assuming 'GetWorkspace: true' is the intended structure based on Rust enum.
    // This requires adding 'GetWorkspace' to WorkspaceProtocolRequestTS type definition.
    const requestPart: WorkspaceProtocolRequestTS = {
      // Changed from true to null for unit variant
      GetWorkspace: null
    };
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    // Construct the full payload expected by the Rust command (PascalCase 'Request')
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    // Construct the full payload expected by the Rust command (PascalCase 'Request')
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Get an office by ID
   * @param officeId The office ID
   */
  public async getOffice(officeId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetOffice: { office_id: officeId }
    };
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Delete an office
   * @param officeId The office ID
   */
  public async deleteOffice(officeId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      DeleteOffice: { office_id: officeId }
    };
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Get a room by ID
   * @param roomId The room ID
   */
  public async getRoom(roomId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetRoom: { room_id: roomId }
    };
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Delete a room
   * @param roomId The room ID
   */
  public async deleteRoom(roomId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      DeleteRoom: { room_id: roomId }
    };
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Get a member by ID
   * @param userId The user ID
   */
  public async getMember(userId: string): Promise<any> {
    const requestPart: WorkspaceProtocolRequestTS = {
      GetMember: { user_id: userId }
    };
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    permissions: any[], // Permission[] type
    operation: 'Add' | 'Set' | 'Remove'
  ): Promise<any> {
    const requestPart = {
      UpdateMemberPermissions: {
        user_id: userId,
        domain_id: domainId,
        permissions,
        operation
      }
    } as unknown as WorkspaceProtocolRequestTS;
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const requestPart = {
      RemoveMember: {
        user_id: userId,
        office_id: officeId,
        room_id: roomId
      }
    } as unknown as WorkspaceProtocolRequestTS;
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
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
    const payload: WorkspaceProtocolPayloadTS = { Request: requestPart };
    return this.sendWorkspaceRequest(payload);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Any cleanup needed
  }
}

// Export singleton instance for convenience
export default WorkspaceService.getInstance();
