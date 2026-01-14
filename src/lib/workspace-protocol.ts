/**
 * workspace-protocol.ts
 * 
 * Utility functions for creating, serializing, and sending protocol messages
 * in the Citadel Workspace application.
 */

import { 
  WorkspaceProtocolPayloadTS, 
  WorkspaceProtocolRequestTS,
  serializeWorkspacePayload,
  createMessagePayload 
} from '../types/workspace-protocol';
import { stringToUint8Array } from '../types/citadel-types';

/**
 * Sends a message to a peer through the workspace protocol
 * 
 * @param cid The connection ID of the sender
 * @param peerCid The connection ID of the recipient
 * @param message The message content as string
 * @returns A promise that resolves when the message is sent
 */
export async function sendMessage(cid: string, peerCid: string, message: string): Promise<void> {
  // Convert string message to Uint8Array
  const messageBytes = stringToUint8Array(message);
  
  // Create workspace protocol request payload
  const requestPayload: WorkspaceProtocolRequestTS = {
    // Note: Using 'Message' as the variant identifier (PascalCase)
    Message: {
      contents: messageBytes
    }
  };

  // Wrap the request payload in the top-level payload structure
  const payload: WorkspaceProtocolPayloadTS = {
    // Note: Using 'Request' as the variant identifier (PascalCase)
    Request: requestPayload
  };
  
  // TODO: Determine correct security_level_str source
  const securityLevel = "0"; // Placeholder
  
  await invoke('send_workspace_request', {
    cidStr: cid, 
    securityLevelStr: securityLevel,
    payload: payload // Pass the structured payload object directly
    // Removed peerCid and message as they are inside the payload now
  });
}

/**
 * Generates a unique request ID for tracking messages
 * @returns A unique request ID string
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
