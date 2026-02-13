import type { InternalServiceResponse } from 'citadel-workspace-client-ts';
import type { WorkspaceEnrichedResponse } from 'citadel-workspace-client-ts';

// TYPE-GAP: MessageDelivered exists at runtime but NOT in auto-generated InternalServiceResponse.
// Other "gap" variants (CreateWorkspace, AddMember etc.) arrive embedded in MessageNotification.message
// bytes and are parsed as WorkspaceProtocolResponse — they are NOT top-level WebSocket variants.
interface MessageDeliveredVariant {
  MessageDelivered: { contents: number[]; cid?: bigint; peer_cid?: bigint; request_id?: string };
}

// Union of all possible messages on the 'websocket-message' event channel.
export type WebSocketMessage =
  | InternalServiceResponse
  | WorkspaceEnrichedResponse
  | MessageDeliveredVariant;

// Broadcast state sync payloads (from BroadcastChannel, NOT WebSocket).
export interface BroadcastStateSyncData {
  type: string;
  [key: string]: unknown;
}

// P2P notification data for cross-tab broadcasting.
export interface P2PNotificationData {
  cid: bigint | string | number;
  peer_cid: bigint | string | number;
  message: Uint8Array | number[];
}

export type { InternalServiceResponse, WorkspaceEnrichedResponse };
