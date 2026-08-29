/**
 * Channel Types
 *
 * Message types, channel interfaces, and constants for inter-instance communication.
 */

import type { ProxyResponseData } from './outbound-queue';

export const CHANNEL_NAME: "citadel-instance-channel" = 'citadel-instance-channel';

export type ChannelMessageType =
  | 'outbound-request'
  | 'outbound-ack'
  | 'inbound-forward'
  | 'inbound-ack'
  | 'leader-election'
  | 'leader-heartbeat'
  | 'instance-announce'
  | 'instance-goodbye'
  | 'session-release'
  | 'cid-update'
  | 'cid-report-request';

export interface ChannelMessage {
  type: ChannelMessageType;
  targetInstanceId: string; // '*' for broadcast, 'leader' for current leader, or specific instanceId
  senderInstanceId: string;
  /**
   * Unique to the SENDING DOCUMENT, never persisted. `senderInstanceId` comes
   * from sessionStorage, which Duplicate Tab copies — so two documents can
   * share one instance id and this is the only field that separates them.
   * Optional so a message from an older build still parses.
   */
  senderDocumentNonce?: string;
  timestamp: number;
  requestId?: string;
  payload?: unknown;
  status?: 'processed' | 'error';
  error?: string;
  data?: ProxyResponseData; // Typed data for acknowledgments
}
