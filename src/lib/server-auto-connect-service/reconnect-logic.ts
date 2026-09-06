/**
 * Server Auto-Connect Service - Reconnect Logic
 *
 * Scheduling, attempting, and canceling session reconnections
 * with exponential backoff.
 */

import { v4 as uuidv4 } from 'uuid';
import { websocketService } from '@/lib/websocket-service';
import { instanceManager } from '@/lib/multi-instance';
import type { StoredSession, ActiveSession, StoredSessions } from '@/types/session-types';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { BASE_DELAY, MAX_DELAY , type ConnectionAttempt } from './types';

/**
 * Generate a unique key for a session.
 */
export function getSessionKey(session: StoredSession): string {
  return `${session.username}@${session.serverAddress}`;
}

/**
 * Find disconnected sessions and schedule reconnects for them.
 */
export async function reconnectToDisconnectedSessions(
  isEnabled: boolean,
  reconnectAttempts: Map<string, ConnectionAttempt>,
  userDisconnectedSessions: Set<string>,
  scheduleReconnect: (sessionKey: string, session: StoredSession) => void
): Promise<void> {
  if (!isEnabled || !instanceManager.isLeader) return;

  const { connectionManager } = await import('@/lib/connection');

  const storedSessions: StoredSessions = connectionManager.getStoredSessions();
  if (!storedSessions.sessions || storedSessions.sessions.length === 0) return;

  // The STRICT query. `getActiveSessions()` returns `[]` when the request
  // fails, and its own contract says so: "failure does NOT mean there are no
  // sessions". Here that empty list means every stored session looks inactive,
  // so ONE GetSessions timeout schedules a reconnect for all of them -- each
  // answered `SessionAlreadyActive` by the agent, which nothing clears, after
  // which `reconnectAttempts.has(...)` skips them for ever.
  //
  // Four other call sites already adopted the strict variant; this one, where
  // the empty list is acted on destructively, did not.
  connectionManager.invalidateSessionCache();
  const result = await connectionManager.getActiveSessionsResult();
  if (!result.ok) {
    debugLog(
      'ServerAutoConnectService',
      'Could not read the active sessions; scheduling nothing this pass rather ' +
        'than treating the failure as "nothing is connected"',
    );
    return;
  }
  const activeSessions: ActiveSession[] = result.sessions;

  const activeKeys: Set<string> = new Set<string>();
  debugLog('ServerAutoConnectService', `Active sessions count: ${activeSessions.length}`);
  for (const session of activeSessions) {
    if (session.username) {
      const key: string = `${session.username}@${session.server_address}`;
      activeKeys.add(key);
      debugLog('ServerAutoConnectService', `Active session key: ${key}`);
    }
  }

  debugLog('ServerAutoConnectService', `Stored sessions count: ${storedSessions.sessions.length}`);
  for (const session of storedSessions.sessions) {
    const sessionKey: string = getSessionKey(session);
    debugLog('ServerAutoConnectService', `Checking stored session: ${sessionKey}, active: ${activeKeys.has(sessionKey)}`);

    if (activeKeys.has(sessionKey)) {
      debugLog('ServerAutoConnectService', `Skipping ${session.username} (already active)`);
      continue;
    }
    if (reconnectAttempts.has(sessionKey)) continue;
    if (!session.username || !session.password) continue;
    if (userDisconnectedSessions.has(sessionKey)) {
      debugLog('ServerAutoConnectService', `Skipping ${session.username} (user-initiated disconnect)`);
      continue;
    }

    debugLog('ServerAutoConnectService', `Scheduling reconnect for ${session.username}`);
    scheduleReconnect(sessionKey, session);
  }
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
export function scheduleReconnect(
  reconnectAttempts: Map<string, ConnectionAttempt>,
  sessionKey: string,
  session: StoredSession
): void {
  const attempt: ConnectionAttempt = {
    sessionKey,
    attempts: 0,
    timeout: null
  };
  reconnectAttempts.set(sessionKey, attempt);

  runAsyncSetup(async () => {
    await attemptReconnect(reconnectAttempts, sessionKey, session);
  });
}

/**
 * Attempt to reconnect a session.
 */
export async function attemptReconnect(
  reconnectAttempts: Map<string, ConnectionAttempt>,
  sessionKey: string,
  session: StoredSession
): Promise<void> {
  const attempt: ConnectionAttempt | undefined = reconnectAttempts.get(sessionKey);
  if (!attempt) return;

  try {
    debugLog('ServerAutoConnectService', `Attempting reconnect for ${session.username} (attempt ${attempt.attempts + 1})`);

    if (!session.password) {
      // Already filtered above, but the guard is what makes that filter a fact
      // rather than a comment: a password-less session must never reach connect.
      debugLog('ServerAutoConnectService', `No stored credentials for ${session.username}; skipping`);
      return;
    }

    await websocketService.connect(
      uuidv4(),
      session.username,
      session.password,
      session.sessionSecuritySettings
    );
    // Success handled by event listener
  } catch (error) {
    const delay: number = Math.min(BASE_DELAY * Math.pow(2, attempt.attempts), MAX_DELAY);
    attempt.attempts++;
    attempt.lastError = error instanceof Error ? error.message : String(error);

    debugLog('ServerAutoConnectService',
      `Reconnect failed for ${session.username}, ` +
      `retry in ${delay / 1000}s (attempt ${attempt.attempts})`
    );

    attempt.timeout = setTimeout(() => {
      runAsyncSetup(async () => {
        await attemptReconnect(reconnectAttempts, sessionKey, session);
      });
    }, delay);

    reconnectAttempts.set(sessionKey, attempt);
  }
}

/**
 * Cancel a pending retry for a session.
 */
export function cancelRetry(
  reconnectAttempts: Map<string, ConnectionAttempt>,
  sessionKey: string
): void {
  const attempt: ConnectionAttempt | undefined = reconnectAttempts.get(sessionKey);
  if (!attempt) return;

  // Clear the timer if there is one, but delete the entry EITHER WAY.
  //
  // The delete used to sit inside `if (attempt?.timeout)`, and `timeout` is
  // null until a retry is actually scheduled — so a session that connected
  // successfully on its first attempt kept its entry forever. The scheduler
  // skips any session already in this map (`if (reconnectAttempts.has(...))
  // continue`), so auto-reconnect never fired again for that account for the
  // life of the tab: the happy path disabled the recovery path.
  //
  // It also kept getPendingReconnectCount() above zero permanently, which is
  // the readiness signal main.tsx exposes for tests to wait on.
  if (attempt.timeout) {
    clearTimeout(attempt.timeout);
  }
  reconnectAttempts.delete(sessionKey);
}

/**
 * Cancel all pending retries and clear active session keys.
 */
export function cancelAllRetries(
  reconnectAttempts: Map<string, ConnectionAttempt>,
  activeSessionKeys: Set<string>
): void {
  for (const [, attempt] of reconnectAttempts) {
    if (attempt.timeout) {
      clearTimeout(attempt.timeout);
    }
  }
  reconnectAttempts.clear();
  activeSessionKeys.clear();
}
