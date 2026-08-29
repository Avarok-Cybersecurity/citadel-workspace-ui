/**
 * Server Auto-Connect Service - Types
 *
 * Interfaces and constants for session reconnection management.
 */

import { TIMEOUT, POLLING } from '@/lib/timeout-constants';

export interface ConnectionAttempt {
  sessionKey: string;
  attempts: number;
  timeout: NodeJS.Timeout | null;
  lastError?: string;
}

export const BASE_DELAY: 5000 = TIMEOUT.SERVER_REQUEST_MS;
export const MAX_DELAY: 300000 = POLLING.OUTGOING_REQUESTS_INTERVAL_MS;
export const POLL_INTERVAL_MS: 60000 = POLLING.SERVER_POLL_INTERVAL_MS;
export const LOCALDB_KEY = 'server_auto_connect_enabled';
export const USER_DISCONNECTED_KEY = 'user_disconnected_sessions';
export const GLOBAL_CID = 0n;
