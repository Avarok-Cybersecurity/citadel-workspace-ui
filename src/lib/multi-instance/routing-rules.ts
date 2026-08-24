/**
 * Routing Rules
 *
 * CID_ROUTED_NOTIFICATIONS, broadcast message types, CID field lists,
 * and routing configuration for the inbound router.
 */

import { INTERVAL } from '../timeout-constants';
import type { ResponseType } from 'citadel-workspace-client-ts';

// Message types that should be broadcast to all instances
export const BROADCAST_MESSAGE_TYPES = [
  'ServerResponse', // Generic server responses
  'DisconnectNotification', // Session disconnected
  'DeregisterSuccess', // Account deleted
];

// Fields that commonly contain the target CID
export const CID_FIELDS = ['cid', 'peer_cid', 'session_cid'];

// Timeout for request tracking (5 minutes)
export const REQUEST_TRACKING_TIMEOUT_MS = INTERVAL.REQUEST_TRACKING_MS;

/**
 * Notification message types that should be routed by CID, NOT by request_id.
 * These messages have a request_id that belongs to the SENDER, but the message
 * should be delivered to the RECIPIENT (identified by the 'cid' field).
 */
export const CID_ROUTED_NOTIFICATIONS = new Set<ResponseType>([
  'PeerRegisterNotification',         // cid = recipient, request_id = sender's
  'PeerConnectNotification',          // cid = recipient, request_id = sender's
  'MessageNotification',              // cid = recipient, request_id = sender's (from SendMessage)
  'FileTransferRequestNotification',  // cid = recipient (file transfer initiation prompt)
  'FileTransferStatusNotification',   // cid = recipient (transfer progress/state)
  'FileTransferTickNotification',     // cid = recipient (transfer progress tick)
  // Media frames carry the SENDER's request_id, exactly like MessageNotification.
  // Routed by request_id they would be delivered to whichever tab happens to own
  // that request, so a second session in the same browser would receive another
  // session's call — audio and video both.
  'MediaFrameNotification',           // cid = recipient
  'MediaGapNotification',             // cid = recipient
]);

/**
 * Message types that the leader must ALSO process locally when forwarding to followers.
 * These messages affect P2P connection state which ILM needs to query.
 * ILM runs on the leader and calls getPeersForSession() for ANY CID, so the leader's
 * connectedPeers Map must have entries for ALL sessions (not just the leader's own).
 * TYPE-GAP: 'PeerDisconnect' exists at runtime but not in generated ResponseType
 */
export const LEADER_MUST_PROCESS_LOCALLY = new Set<ResponseType | string>([
  'PeerConnectNotification',  // Affects connectedPeers[targetCid]
  'PeerConnectSuccess',       // Affects connectedPeers[initiatorCid]
  'PeerDisconnect',           // Removes from connectedPeers
  'DisconnectNotification',   // Removes from connectedPeers (when peer C2S drops)
]);

/**
 * Get the type of the message (first key)
 */
export function getMessageType(message: unknown): ResponseType {
  if (!message || typeof message !== 'object') {
    return 'unknown' as ResponseType;
  }
  const keys = Object.keys(message);
  return (keys[0] || 'unknown') as ResponseType;
}

/**
 * Check if a message type should be broadcast to all instances
 */
export function shouldBroadcast(messageType: ResponseType): boolean {
  return BROADCAST_MESSAGE_TYPES.includes(messageType);
}
