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
  request?: WorkspaceProtocolRequestTS;
  response?: WorkspaceProtocolResponseTS;
}

/**
 * Enum wrapper for WorkspaceProtocolRequest
 * Only Message type is needed for frontend-to-backend communication
 */
export interface MessageRequestTS {
  contents: Uint8Array;
}

export interface WorkspaceProtocolRequestTS {
  message?: MessageRequestTS;
  
  // Office operations
  createOffice?: {
    name: string;
    description: string;
    mdx_content?: string;
  };
  getOffice?: {
    office_id: string;
  };
  updateOffice?: {
    office_id: string;
    name?: string;
    description?: string;
    mdx_content?: string;
  };
  deleteOffice?: {
    office_id: string;
  };
  listOffices?: boolean;
  
  // Room operations
  createRoom?: {
    office_id: string;
    name: string;
    description: string;
    mdx_content?: string;
  };
  getRoom?: {
    room_id: string;
  };
  updateRoom?: {
    room_id: string;
    name?: string;
    description?: string;
    mdx_content?: string;
  };
  deleteRoom?: {
    room_id: string;
  };
  listRooms?: {
    office_id: string;
  };
  
  // Member operations
  addMember?: {
    user_id: string;
    office_id?: string;
    room_id?: string;
    role: UserRoleTS;
  };
  getMember?: {
    user_id: string;
  };
  updateMemberRole?: {
    user_id: string;
    role: UserRoleTS;
  };
  updateMemberPermissions?: {
    user_id: string;
    domain_id: string;
    permissions: PermissionTS[];
    operation: UpdateOperationTS;
  };
  removeMember?: {
    user_id: string;
    domain_id: string;
  };
  listMembers?: {
    office_id?: string;
    room_id?: string;
  };
}

/**
 * Simplified type definitions for workspace entities
 */
export interface OfficeTS {
  id: string;
  name: string;
  description: string;
  mdx_content?: string;
}

export interface RoomTS {
  id: string;
  office_id: string;
  name: string;
  description?: string;
  mdx_content?: string;
}

export interface UserTS {
  id: string;
  username: string;
  display_name: string;
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
  | { offices: OfficeTS[] }
  | { rooms: RoomTS[] }
  | { members: UserTS[] }
  | { office: OfficeTS }
  | { room: RoomTS }
  | { member: UserTS };

export enum UpdateOperationTS {
  Add = 'add',
  Remove = 'remove',
  Set = 'set'
}

/**
 * Helper function to create a WorkspaceProtocolPayload with a Message request
 */
export function createMessagePayload(messageContents: Uint8Array): WorkspaceProtocolPayloadTS {
  return {
    request: {
      message: {
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
