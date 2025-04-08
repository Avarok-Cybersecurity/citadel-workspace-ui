/**
 * workspace-protocol.ts
 * 
 * Utility functions for creating, serializing, and sending protocol messages
 * in the Citadel Workspace application.
 */

import { invoke } from '@tauri-apps/api/core';
import { 
  WorkspaceProtocolPayloadTS, 
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
  
  // Create workspace protocol payload with message request
  const payload = createMessagePayload(messageBytes);
  
  // Serialize payload to Uint8Array
  const serializedPayload = serializeWorkspacePayload(payload);
  
  // Invoke Tauri command to send message
  await invoke('send_message', {
    cid,
    peerCid,
    message: serializedPayload
  });
}

/**
 * Sends a binary message to a peer through the workspace protocol
 * 
 * @param cid The connection ID of the sender
 * @param peerCid The connection ID of the recipient
 * @param data The binary data to send
 * @returns A promise that resolves when the message is sent
 */
export async function sendBinaryMessage(cid: string, peerCid: string, data: Uint8Array): Promise<void> {
  // Create workspace protocol payload with message request
  const payload = createMessagePayload(data);
  
  // Serialize payload to Uint8Array
  const serializedPayload = serializeWorkspacePayload(payload);
  
  // Invoke Tauri command to send message
  await invoke('send_message', {
    cid,
    peerCid,
    message: serializedPayload
  });
}

/**
 * Generates a unique request ID for tracking messages
 * @returns A unique request ID string
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
