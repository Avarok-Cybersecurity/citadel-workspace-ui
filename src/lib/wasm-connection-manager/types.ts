/**
 * WASM Connection Manager Types
 *
 * Type definitions and constants for the WASM connection manager.
 */

import { INTERVAL } from '../timeout-constants';

export const POLL_INTERVAL_VISIBLE_MS = INTERVAL.LEADER_TIMEOUT_MS; // 5 seconds when tab is visible
export const POLL_INTERVAL_HIDDEN_MS = INTERVAL.HEALTH_CHECK_MS; // 30 seconds when tab is hidden
export const MAX_CONSECUTIVE_FAILURES = 5; // Circuit breaker threshold

export interface SessionState {
  cid: string;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
}
