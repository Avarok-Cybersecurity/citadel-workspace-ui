/**
 * Broadcast Channel Service - Types
 *
 * Interfaces, type guards, and constants for cross-tab communication.
 */

import { INTERVAL } from '@/lib/timeout-constants';

export interface BroadcastMessage {
  type: 'workspace-response' | 'leader-election' | 'state-sync' | 'connection-status' | 'register-request' | 'p2p-raw-message' | 'p2p-notification';
  data: unknown;
  timestamp: number;
  tabId: string;
  isLeader?: boolean;
  /** Target CID for P2P notifications - used to filter broadcasts by session */
  targetCid?: bigint;
}

export interface PendingRequest {
  cid: bigint;
  insertTime: number;
}

export interface LeaderElectionMessage {
  tabId: string;
  timestamp: number;
  priority: number;
}

export function isLeaderElectionMessage(data: unknown): data is LeaderElectionMessage {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    typeof record.tabId === 'string' &&
    typeof record.timestamp === 'number' &&
    typeof record.priority === 'number'
  );
}

export const CHANNEL_NAME = 'citadel-workspace-sync';
export const REQUEST_EXPIRY_MS = 30 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = INTERVAL.CLEANUP_MS;
