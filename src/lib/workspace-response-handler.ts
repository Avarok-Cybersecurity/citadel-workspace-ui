import { eventEmitter } from './event-emitter';
import { WorkspaceProtocolPayloadTS, WorkspaceProtocolResponseTS } from '@/types/workspace-protocol';
import { websocketService } from './websocket-service';
import { debugLog, errorLog } from './debug-config';
import { groupMessagingManager } from './group-messaging-manager';
import { bytesToString } from './utils/encoding-utils';


/**
 * Handles workspace protocol responses and emits appropriate events
 */
export class WorkspaceResponseHandler {
  private static instance: WorkspaceResponseHandler;

  private constructor() {
    this.setupMessageHandler();
  }

  public static getInstance(): WorkspaceResponseHandler {
    if (!WorkspaceResponseHandler.instance) {
      WorkspaceResponseHandler.instance = new WorkspaceResponseHandler();
    }
    return WorkspaceResponseHandler.instance;
  }

  private setupMessageHandler(): void {
    // Listen for WebSocket messages
    eventEmitter.on('websocket-message', (message: any) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: any): void {
    // Handle MessageNotification responses (server sends this, not MessageDelivered)
    if (message.MessageNotification) {
      debugLog('workspace', 'Received MessageNotification', message.MessageNotification);

      // Check if this is a P2P message (has non-zero peer_cid different from our cid)
      // P2P messages should be handled by p2p-messenger-manager, not workspace handler
      // peer_cid=0 means it's from the workspace server, not a peer
      const notification = message.MessageNotification;
      if (notification.peer_cid && notification.cid) {
        const peerCidStr = notification.peer_cid.toString();
        const cidStr = notification.cid.toString();

        // If peer_cid is non-zero and different from cid, this is a P2P message from another user
        // Let p2p-messenger-manager handle it (it also listens to websocket-message event)
        if (peerCidStr !== '0' && peerCidStr !== cidStr) {
          debugLog('workspace', 'P2P message from peer, skipping workspace parsing', { peer_cid: peerCidStr, cid: cidStr });
          return;
        }
      }

      // Extract the message array from notification (field is 'message' not 'contents')
      if (notification.message && Array.isArray(notification.message)) {
        try {
          // Convert array of numbers to Uint8Array
          const contentBytes = new Uint8Array(notification.message);
          // Decode bytes to string
          const contentStr = bytesToString(contentBytes);

          // Parse the JSON workspace protocol response
          const workspacePayload = JSON.parse(contentStr);

          // Process the workspace protocol response
          if (workspacePayload.Response) {
            this.processWorkspaceResponse(workspacePayload.Response);
          } else {
            debugLog('workspace', 'No Response field in payload', workspacePayload);
          }
        } catch (decodeError) {
          errorLog('Failed to decode MessageNotification', decodeError);
        }
      } else {
        debugLog('workspace', 'MessageNotification missing message field', notification);
      }
      return;
    }
    
    // Handle MessageDelivered responses from WASM client
    if (message.MessageDelivered) {
      debugLog('workspace', 'Received MessageDelivered', message.MessageDelivered);
      
      // Extract the contents array
      if (message.MessageDelivered.contents && Array.isArray(message.MessageDelivered.contents)) {
        try {
          // Convert array of numbers to Uint8Array
          const contentBytes = new Uint8Array(message.MessageDelivered.contents);
          // Decode bytes to string
          const contentStr = bytesToString(contentBytes);
          // Parse the JSON workspace protocol response
          const workspacePayload = JSON.parse(contentStr);
          
          // Process the workspace protocol response
          if (workspacePayload.Response) {
            this.processWorkspaceResponse(workspacePayload.Response);
          }
        } catch (decodeError) {
          errorLog('Failed to decode MessageDelivered contents', decodeError);
        }
      }
      return;
    }
    
    // Check if it's a direct Response message
    if (!message.Response) {
      return;
    }

    const response = message.Response;
    debugLog('workspace', 'Processing direct response', response);
    this.processWorkspaceResponse(response);
  }
  
  private processWorkspaceResponse(response: any): void {
    debugLog('workspace', 'Processing workspace response', response);

    // Get connection info if available
    // CID should come from the response or the context, not from websocketService
    const connectionInfo = {
      cid: 0, // Will be overridden by actual CID from response if available
      request_id: crypto.randomUUID() // Generate if not provided
    };

    // IMPORTANT: Check for string literal responses FIRST, before ANY 'in' operator checks
    // The 'in' operator throws TypeError when used on primitives (strings)
    if (typeof response === 'string') {
      if (response === 'WorkspaceNotInitialized') {
        debugLog('workspace', 'Workspace not initialized (string literal), triggering initialization flow');
        eventEmitter.emit('workspace:not-initialized', connectionInfo);
      } else {
        debugLog('workspace', 'Unhandled string response:', response);
      }
      return;
    }

    // Handle different response types based on the Rust enum structure
    if ('CreateWorkspace' in response) {
      // Handle workspace creation response
      debugLog('workspace', 'CreateWorkspace response', response.CreateWorkspace);
      eventEmitter.emit('workspace:created', {
        workspace: {
          id: response.CreateWorkspace.id,
          name: response.CreateWorkspace.name,
          description: response.CreateWorkspace.description,
          metadata: response.CreateWorkspace.metadata || []
        },
        connection: connectionInfo
      });
      // Also emit loaded event since the workspace is now available
      eventEmitter.emit('workspace:loaded', {
        workspace: {
          id: response.CreateWorkspace.id,
          name: response.CreateWorkspace.name,
          description: response.CreateWorkspace.description,
          metadata: response.CreateWorkspace.metadata || []
        },
        connection: connectionInfo
      });
    } else if ('Workspaces' in response) {
      // Handle workspace list response (multi-workspace)
      debugLog('workspace', 'Workspaces list received', response.Workspaces);
      eventEmitter.emit('workspaces:listed', {
        workspaces: response.Workspaces,
        connection: connectionInfo
      });
    } else if ('Workspace' in response) {
      // Handle workspace loaded response
      eventEmitter.emit('workspace:loaded', {
        workspace: {
          id: response.Workspace.id,
          name: response.Workspace.name,
          description: response.Workspace.description,
          metadata: response.Workspace.metadata || []
        },
        connection: connectionInfo
      });
    } else if ('Members' in response) {
      // Handle members list response
      eventEmitter.emit('members:loaded', {
        members: response.Members,
        connection: connectionInfo
      });
    } else if ('Member' in response) {
      // Handle single member response
      eventEmitter.emit('member:loaded', {
        member: response.Member,
        connection: connectionInfo
      });
    } else if ('AddMember' in response) {
      // Handle add member response
      debugLog('workspace', 'AddMember response', response.AddMember);
      eventEmitter.emit('member:added', {
        member: response.AddMember,
        connection: connectionInfo
      });
      // Trigger members reload
      eventEmitter.emit('members:reload', connectionInfo);
    } else if ('UpdateMemberRole' in response) {
      // Handle update member role response
      debugLog('workspace', 'UpdateMemberRole response', response.UpdateMemberRole);
      eventEmitter.emit('member:role-updated', {
        userId: response.UpdateMemberRole.user_id,
        role: response.UpdateMemberRole.role,
        connection: connectionInfo
      });
      // Trigger members reload
      eventEmitter.emit('members:reload', connectionInfo);
    } else if ('RemoveMember' in response) {
      // Handle remove member response
      debugLog('workspace', 'RemoveMember response', response.RemoveMember);
      eventEmitter.emit('member:removed', {
        userId: response.RemoveMember.user_id,
        connection: connectionInfo
      });
      // Trigger members reload
      eventEmitter.emit('members:reload', connectionInfo);
    } else if ('Success' in response) {
      // Handle success response
      eventEmitter.emit('operation:success', connectionInfo);

      // Note: office:created and room:created are emitted by their specific handlers
      // (CreateOffice, CreateRoom) - don't duplicate here
      if (response.Success.includes('deleted')) {
        eventEmitter.emit('operation:deleted', connectionInfo);
      }
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('Error' in response) {
      // Handle error response
      eventEmitter.emit('operation:error', {
        message: response.Error,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('WorkspaceNotInitialized' in response) {
      // Handle workspace not initialized response (object form)
      debugLog('workspace', 'Workspace not initialized, triggering initialization flow');
      eventEmitter.emit('workspace:not-initialized', connectionInfo);
    } else if ('WorkspaceError' in response) {
      // Handle workspace-specific errors
      if (response.WorkspaceError === 'WorkspaceNotInitialized') {
        eventEmitter.emit('workspace:not-initialized', connectionInfo);
      } else {
        eventEmitter.emit('workspace:error', {
          error: response.WorkspaceError,
          connection: connectionInfo
        });
      }
    // ========== Group Messaging Responses ==========
    } else if ('GroupMessageNotification' in response) {
      // Handle new group message notification
      const { group_id, message } = response.GroupMessageNotification;
      debugLog('workspace', 'GroupMessageNotification received', { group_id, message });
      groupMessagingManager.handleNewMessage(group_id, message);
      eventEmitter.emit('group:message:new', {
        groupId: group_id,
        message,
        connection: connectionInfo
      });
    } else if ('GroupMessages' in response) {
      // Handle paginated messages response
      const { group_id, messages, has_more } = response.GroupMessages;
      debugLog('workspace', 'GroupMessages received', { group_id, count: messages.length, has_more });
      groupMessagingManager.handleMessagesLoaded(group_id, messages, has_more);
      eventEmitter.emit('group:messages:loaded', {
        groupId: group_id,
        messages,
        hasMore: has_more,
        connection: connectionInfo
      });
    } else if ('GroupMessageEdited' in response) {
      // Handle message edited notification
      const { group_id, message_id, new_content, edited_at } = response.GroupMessageEdited;
      debugLog('workspace', 'GroupMessageEdited received', { group_id, message_id });
      groupMessagingManager.handleMessageEdited(group_id, message_id, new_content, edited_at);
      eventEmitter.emit('group:message:edited', {
        groupId: group_id,
        messageId: message_id,
        newContent: new_content,
        editedAt: edited_at,
        connection: connectionInfo
      });
    } else if ('GroupMessageDeleted' in response) {
      // Handle message deleted notification
      const { group_id, message_id, deleted_by } = response.GroupMessageDeleted;
      debugLog('workspace', 'GroupMessageDeleted received', { group_id, message_id, deleted_by });
      groupMessagingManager.handleMessageDeleted(group_id, message_id);
      eventEmitter.emit('group:message:deleted', {
        groupId: group_id,
        messageId: message_id,
        deletedBy: deleted_by,
        connection: connectionInfo
      });
    } else if ('GroupMessage' in response) {
      // Handle single group message response
      debugLog('workspace', 'GroupMessage received', response.GroupMessage);
      eventEmitter.emit('group:message:single', {
        message: response.GroupMessage,
        connection: connectionInfo
      });
    } else if ('UserPermissions' in response) {
      // Handle user permissions response
      const { user_id, role, permissions, domain_id } = response.UserPermissions;
      debugLog('workspace', 'UserPermissions received', { user_id, role, domain_id });
      eventEmitter.emit('user:permissions:loaded', {
        userId: user_id,
        role,
        permissions,
        domainId: domain_id,
        connection: connectionInfo
      });
    } else if ('MemberRoleUpdated' in response) {
      // Handle member role update response
      const { user_id, new_role } = response.MemberRoleUpdated;
      debugLog('workspace', 'MemberRoleUpdated received', { user_id, new_role });
      eventEmitter.emit('member:role-updated', {
        userId: user_id,
        role: new_role,
        connection: connectionInfo
      });
    } else if ('UserProfileUpdated' in response) {
      // Handle user profile update response
      const user = response.UserProfileUpdated;
      debugLog('workspace', 'UserProfileUpdated received', { userId: user.id, name: user.name });
      eventEmitter.emit('user:profile-updated', {
        user,
        connection: connectionInfo
      });
    // ========== Server Capabilities Response ==========
    } else if ('ServerCapabilities' in response) {
      // Handle server capabilities response
      const capabilities = response.ServerCapabilities;
      debugLog('workspace', 'ServerCapabilities received', capabilities);
      eventEmitter.emit('server:capabilities:loaded', {
        allowServerFileTransfer: capabilities.allow_server_file_transfer,
        allowServerRevfsStorage: capabilities.allow_server_revfs_storage,
        maxFileTransferSizeMb: Number(capabilities.max_file_transfer_size_mb),
        revfsStorageQuotaMb: Number(capabilities.revfs_storage_quota_mb),
        connection: connectionInfo
      });
    // ========== Tree Node Responses (Generalized Hierarchy) ==========
    } else if ('Node' in response) {
      // Handle single node response (create/get/update node)
      const node = response.Node;
      debugLog('workspace', 'Node response received', { id: node.id, name: node.name, entityType: node.entity_type });
      eventEmitter.emit('node:loaded', {
        node,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('Nodes' in response) {
      // Handle nodes list response
      const nodes = response.Nodes;
      debugLog('workspace', 'Nodes response received', { count: nodes.length });
      eventEmitter.emit('nodes:loaded', {
        nodes,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('TreeStructure' in response) {
      // Handle tree structure response
      debugLog('workspace', 'TreeStructure response received');
      eventEmitter.emit('tree:structure:loaded', {
        root: response.TreeStructure.root,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('TreeSchema' in response) {
      // Handle tree schema response
      debugLog('workspace', 'TreeSchema response received');
      eventEmitter.emit('tree:schema:loaded', {
        schema: response.TreeSchema,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('NodeTypes' in response) {
      // Handle node types list response
      debugLog('workspace', 'NodeTypes response received', { count: response.NodeTypes.length });
      eventEmitter.emit('node:types:loaded', {
        nodeTypes: response.NodeTypes,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('NodeDeleted' in response) {
      // Handle node deletion response
      const { node_id, children_deleted } = response.NodeDeleted;
      debugLog('workspace', 'NodeDeleted response received', { node_id, childrenDeleted: children_deleted.length });
      eventEmitter.emit('node:deleted', {
        nodeId: node_id,
        childrenDeleted: children_deleted,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else if ('NodeMoved' in response) {
      // Handle node move response
      const { node_id, old_parent_id, new_parent_id } = response.NodeMoved;
      debugLog('workspace', 'NodeMoved response received', { node_id, old_parent_id, new_parent_id });
      eventEmitter.emit('node:moved', {
        nodeId: node_id,
        oldParentId: old_parent_id,
        newParentId: new_parent_id,
        connection: connectionInfo
      });
      eventEmitter.emit('workspace:raw-response', response);
    } else {
      // Log unhandled response types for debugging
      debugLog('workspace', 'Unhandled response type:', response);
      // Still emit raw response for protocol-level testing
      eventEmitter.emit('workspace:raw-response', response);
    }
  }

  /**
   * Emit loading events before making requests
   */
  public emitLoadingEvent(eventType: string, data?: any): void {
    const connectionInfo = {
      cid: 0, // CID should be passed from the calling context if needed
      request_id: crypto.randomUUID()
    };

    switch (eventType) {
      case 'workspace:loading':
        eventEmitter.emit('workspace:loading', connectionInfo);
        break;
      case 'nodes:loading':
        eventEmitter.emit('nodes:loading', connectionInfo);
        break;
      case 'members:loading':
        eventEmitter.emit('members:loading', {
          officeId: data?.officeId,
          roomId: data?.roomId,
          connection: connectionInfo
        });
        break;
    }
  }
}

// Export singleton instance
export const workspaceResponseHandler = WorkspaceResponseHandler.getInstance();