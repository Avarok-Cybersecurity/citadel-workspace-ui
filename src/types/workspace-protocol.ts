/**
 * workspace-protocol.ts
 * 
 * TypeScript equivalent of the Rust WorkspaceProtocol types defined in 
 * citadel-workspace-types/src/lib.rs. These types are used for structured
 * communication between the TypeScript frontend and Rust backend.
 */

// Import the workspace types from internal files instead of a separate file
// We'll define the types directly here for simplicity since we only need minimal types

/**
 * The main protocol payload that wraps either a request or response
 */
export enum WorkspaceProtocolPayloadTypeTS {
  Request = 'request',
  Response = 'response'
}

export interface WorkspaceProtocolPayloadTS {
  Request?: WorkspaceProtocolRequestTS;
  Response?: WorkspaceProtocolResponseTS;
}

/**
 * Enum wrapper for WorkspaceProtocolRequest
 * Only Message type is needed for frontend-to-backend communication
 */
export interface MessageRequestTS {
  contents: Uint8Array;
}

export interface WorkspaceProtocolRequestTS {
  Message?: MessageRequestTS;

  // GetWorkspace variant - workspace_id defaults to sentinel if null/undefined
  GetWorkspace?: { workspace_id?: string | null } | null;

  // List all workspaces the user has access to
  ListWorkspaces?: null;

  // Workspace commands
  CreateWorkspace?: {
    name: string;
    description: string;
    workspace_master_password: string;
    metadata?: number[]; // Vec<u8> as number[]
  };

  // Workspace operations
  UpdateWorkspace?: {
    workspace_id?: string | null;
    name?: string;
    description?: string;
    workspace_master_password: string;
    metadata?: number[]; // Vec<u8> as number[]
  };
  DeleteWorkspace?: {
    workspace_id?: string | null;
    workspace_master_password: string;
  };

  // Office operations
  CreateOffice?: {
    workspace_id: string;
    name: string;
    description: string;
    mdx_content?: string;
    metadata?: number[];
    is_default?: boolean;
  };
  GetOffice?: {
    office_id: string;
  };
  UpdateOffice?: {
    office_id: string;
    name?: string;
    description?: string;
    mdx_content?: string;
    metadata?: number[];
    is_default?: boolean;
  };
  DeleteOffice?: {
    office_id: string;
  };
  ListOffices?: null;

  // Room operations
  CreateRoom?: {
    office_id: string;
    name: string;
    description: string;
    mdx_content?: string;
  };
  GetRoom?: {
    room_id: string;
  };
  UpdateRoom?: {
    room_id: string;
    name?: string;
    description?: string;
    mdx_content?: string;
  };
  DeleteRoom?: {
    room_id: string;
  };
  ListRooms?: {
    office_id: string;
  };

  // Member operations
  AddMember?: {
    user_id: string;
    office_id?: string;
    room_id?: string;
    role: UserRoleTS;
    metadata?: number[];
  };
  GetMember?: {
    user_id: string;
  };
  UpdateMemberRole?: {
    user_id: string;
    role: UserRoleTS;
    metadata?: number[];
  };
  UpdateMemberPermissions?: {
    user_id: string;
    domain_id: string;
    permissions: PermissionTS[];
    operation: UpdateOperationTS;
  };
  RemoveMember?: {
    user_id: string;
    office_id?: string;
    room_id?: string;
  };
  ListMembers?: {
    office_id?: string;
    room_id?: string;
  };

  // Group messaging operations
  SendGroupMessage?: {
    group_id: string;
    message_type: GroupMessageTypeTS;
    content: string;
    reply_to?: string;
    mentions?: string[];
  };

  EditGroupMessage?: {
    group_id: string;
    message_id: string;
    new_content: string;
  };

  DeleteGroupMessage?: {
    group_id: string;
    message_id: string;
  };

  GetGroupMessages?: {
    group_id: string;
    before_timestamp?: number;
    limit?: number;
  };

  GetThreadMessages?: {
    group_id: string;
    parent_message_id: string;
  };

  // User profile operations
  UpdateUserProfile?: {
    name?: string;
    avatar_data?: string; // Base64-encoded WebP image
  };

  // Server capabilities query
  GetServerCapabilities?: null;

  // Generic tree node operations
  CreateNode?: {
    parent_id: string | null;
    entity_type: { Child: string } | 'Workspace';
    name: string;
    description: string;
    mdx_content?: string;
    metadata?: number[];
    is_default?: boolean;
  };
  GetNode?: {
    node_id: string;
  };
  UpdateNode?: {
    node_id: string;
    name?: string;
    description?: string;
    mdx_content?: string;
    rules?: string;
    chat_enabled?: boolean;
    is_default?: boolean;
  };
  DeleteNode?: {
    node_id: string;
    cascade: boolean;
  };
  MoveNode?: {
    node_id: string;
    new_parent_id: string | null;
  };
  ListNodes?: {
    parent_id?: string | null;
    depth?: number;
    entity_types?: Array<{ Child: string } | 'Workspace'>;
  };
  GetTreeStructure?: {
    root_id?: string | null;
    max_depth?: number;
  };
  GetTreeSchema?: null;
  UpdateTreeSchema?: {
    schema: {
      rules: Array<{ parent_type: string; allowed_child_types: string[] }>;
      max_depth?: number | null;
    };
  };
}

// Group message type enum
export enum GroupMessageTypeTS {
  Text = 'Text',
  Markdown = 'Markdown',
  System = 'System'
}

// Group message interface
export interface GroupMessageTS {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  message_type: GroupMessageTypeTS;
  content: string;
  timestamp: number;
  reply_to?: string;
  reply_count: number;
  mentions: string[];
  edited_at?: number;
}

/**
 * Simplified type definitions for workspace entities
 */
export interface OfficeTS {
  id: string;
  name: string;
  description: string;
  mdx_content?: string;
  rules?: string;
  chat_enabled: boolean;
  chat_channel_id?: string;
  is_default?: boolean; // Whether this is the default office (navigated to on login)
}

export interface RoomTS {
  id: string;
  office_id: string;
  name: string;
  description?: string;
  mdx_content?: string;
  rules?: string;
  chat_enabled: boolean;
  chat_channel_id?: string;
}

export interface UserTS {
  id: string;
  username: string;
  display_name: string;
  name?: string;
  metadata?: Record<string, any>; // For avatar and other user metadata
}

export enum UserRoleTS {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
  Guest = 'guest'
}

export enum PermissionTS {
  ViewOffice = 'view_office',
  EditOffice = 'edit_office'
}

/**
 * Enum alternatives for WorkspaceProtocolResponse
 */
export type WorkspaceProtocolResponseTS =
  | { success: true }
  | { error: string }
  | { workspace_initialized: boolean }
  | { WorkspaceNotInitialized: true }
  | { offices: OfficeTS[] }
  | { rooms: RoomTS[] }
  | { members: UserTS[] }
  | { office: OfficeTS }
  | { room: RoomTS }
  | { member: UserTS }
  // Group messaging responses
  | { GroupMessageNotification: { group_id: string; message: GroupMessageTS } }
  | { GroupMessages: { group_id: string; messages: GroupMessageTS[]; has_more: boolean } }
  | { GroupMessageEdited: { group_id: string; message_id: string; new_content: string; edited_at: number } }
  | { GroupMessageDeleted: { group_id: string; message_id: string; deleted_by: string } }
  | { GroupMessage: GroupMessageTS }
  // User profile responses
  | { UserProfileUpdated: UserTS }
  // Server capabilities response
  | { ServerCapabilities: ServerCapabilitiesTS }
  // Multi-workspace support
  | { Workspaces: WorkspaceMetadataTS[] };

export enum UpdateOperationTS {
  Add = 'add',
  Remove = 'remove',
  Set = 'set'
}

/**
 * Lightweight workspace metadata for listing accessible workspaces
 */
export interface WorkspaceMetadataTS {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  is_default: boolean;
  member_count: number;
}

/**
 * Server file transfer and storage capabilities
 */
export interface ServerCapabilitiesTS {
  /** Whether server-mediated file transfers are enabled */
  allow_server_file_transfer: boolean;
  /** Whether RE-VFS (server-side encrypted storage) is enabled */
  allow_server_revfs_storage: boolean;
  /** Maximum file size for transfers (in megabytes) */
  max_file_transfer_size_mb: bigint;
  /** RE-VFS storage quota per user (in megabytes) */
  revfs_storage_quota_mb: bigint;
}

/**
 * Helper function to create a WorkspaceProtocolPayload with a Message request
 */
export function createMessagePayload(messageContents: Uint8Array): WorkspaceProtocolPayloadTS {
  return {
    Request: {
      Message: {
        contents: messageContents
      }
    }
  };
}

/**
 * Helper function to serialize a WorkspaceProtocolPayload to a Uint8Array
 * 
 * This handles binary data by encoding Uint8Array to base64 strings during serialization
 */
export function serializeWorkspacePayload(payload: WorkspaceProtocolPayloadTS): Uint8Array {
  // Create a deep copy of the payload to avoid modifying the original
  const payloadCopy = JSON.parse(JSON.stringify(payload, (key, value) => {
    // Special handling for Uint8Array - convert to a special format object
    if (value instanceof Uint8Array) {
      // Convert to base64 for safe JSON serialization
      const base64 = btoa(String.fromCharCode.apply(null, [...value]));
      return { __type: 'Uint8Array', data: base64 };
    }
    return value;
  }));

  // Convert to string and then to Uint8Array
  const jsonString = JSON.stringify(payloadCopy);
  return new TextEncoder().encode(jsonString);
}

/**
 * Helper function to deserialize a Uint8Array to a WorkspaceProtocolPayload
 * 
 * This handles binary data by decoding base64 strings back to Uint8Array during deserialization
 */
export function deserializeWorkspacePayload(data: Uint8Array): WorkspaceProtocolPayloadTS {
  // Convert from Uint8Array to string
  const jsonString = new TextDecoder().decode(data);

  // Parse JSON with reviver function to handle special types
  return JSON.parse(jsonString, (key, value) => {
    // Check for our special object format that represents a Uint8Array
    if (value && typeof value === 'object' && value.__type === 'Uint8Array') {
      // Special case for empty arrays (data is '')
      if (value.data === '') {
        return new Uint8Array(0);
      }

      // Convert from base64 back to Uint8Array for non-empty arrays
      const binaryString = atob(value.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    return value;
  });
}
