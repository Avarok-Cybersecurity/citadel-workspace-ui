/**
 * Connection Queries
 *
 * Handles active session fetching, tab selection lookups,
 * and connect failure processing for the ConnectionManager.
 */

import type { ConnectionState } from './state';
import { failOnSocketLoss } from '../websocket/request-response';
import type { ConnectionIO } from './io';
import type { ActiveSession, StoredSession } from '@/types/session-types';
import {
  WEBSOCKET_INIT_TIMEOUT_MS,
  GET_SESSIONS_TIMEOUT_MS,
} from './constants';
import { debugLog } from '@/lib/debug-config';
import type { TabSelectionContext } from '@/lib/connection/types';

/**
 * The outcome of asking the internal service which sessions exist.
 *
 * `ok: false` means the question could not be asked or was not answered — the
 * socket was not up, the tab could not send, or the response timed out. It does
 * NOT mean there are no sessions, and the two must never be conflated: this
 * query is how the app decides whether the user is logged in.
 */
export interface ActiveSessionsResult {
  ok: boolean;
  sessions: ActiveSession[];
}

/**
 * Get active sessions with caching and deduplication.
 *
 * Keeps the lenient contract its eight callers were written against — an empty
 * array on failure — because most of them genuinely want best effort. Callers
 * that must not read a failure as "you have no sessions" use
 * `getActiveSessionsResult` instead.
 */
export async function getActiveSessions(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<ActiveSession[]> {
  return (await getActiveSessionsResult(state, io)).sessions;
}

export async function getActiveSessionsResult(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<ActiveSessionsResult> {
  const cached: ActiveSession[] | null = state.cachedSessions;
  if (cached && state.isCacheValid()) {
    return { ok: true, sessions: cached };
  }

  const pending: Promise<ActiveSessionsResult> | null = state.pendingGetSessions;
  if (pending) {
    return pending;
  }

  const fetchPromise: Promise<ActiveSessionsResult> = fetchActiveSessions(state, io);
  state.setPendingGetSessions(fetchPromise);

  try {
    const result: ActiveSessionsResult = await fetchPromise;
    // A failure is not an answer, so it is not cached. It used to be: one
    // timeout produced an empty list that every later call returned instantly
    // for the whole cache window, without re-asking. That is what turned a
    // transient hiccup into a logged-out-looking app that would not recover.
    if (result.ok) state.setCachedSessions(result.sessions);
    return result;
  } finally {
    state.setPendingGetSessions(null);
  }
}

async function fetchActiveSessions(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<ActiveSessionsResult> {
  try {
    // canSendRequests, not isConnected. A FOLLOWER tab never owns a WASM client
    // — that is by design — so `isConnected` is false forever there, and this
    // returned [] WITHOUT ever sending GetSessions, then cached the empty
    // answer. A second tab in the same browser therefore showed the logged-out
    // landing page with no Active Sessions strip, permanently.
    if (!io.canSendRequests()) {
      try {
        await Promise.race([
          io.waitForWebSocketInit(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('WebSocket init timeout')), WEBSOCKET_INIT_TIMEOUT_MS)
          ),
        ]);
      } catch {
        return { ok: false, sessions: [] };
      }

      if (!io.canSendRequests()) {
        return { ok: false, sessions: [] };
      }
    }

    const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();

    const responsePromise: Promise<{ sessions?: ActiveSession[]; }> = new Promise<{ sessions?: ActiveSession[] }>((resolve, reject): void => {
      state.setPendingRequest(requestId, { resolve: resolve as (value: unknown) => void, reject });

      setTimeout(() => {
        if (state.hasPendingRequest(requestId)) {
          state.deletePendingRequest(requestId);
          reject(new Error('GetSessions request timed out'));
        }
      }, GET_SESSIONS_TIMEOUT_MS);
    });

    await io.sendWebSocketMessage({ GetSessions: { request_id: requestId } });

    const response: { sessions?: ActiveSession[]; } = await failOnSocketLoss('GetSessions', responsePromise);
    return { ok: true, sessions: response.sessions || [] };
  } catch (error) {
    debugLog('ConnectionService', 'Failed to get active sessions', error);
    return { ok: false, sessions: [] };
  }
}

/**
 * Get the tab-specific active session index.
 */
export async function getTabActiveSessionIndex(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<number> {
  const tabSelection: TabSelectionContext | null = await io.getSelectedUser();
  if (tabSelection?.selectedUsername && tabSelection?.selectedServerAddress) {
    const index: number = state.findSessionIndex(
      tabSelection.selectedUsername,
      tabSelection.selectedServerAddress
    );
    if (index >= 0) {
      return index;
    }
  }
  return state.getActiveSessionIndex();
}

/**
 * Handle a ConnectFailure response by emitting appropriate events.
 */
export async function handleConnectFailure(
  failure: { message?: string },
  state: ConnectionState,
  io: ConnectionIO,
  getActiveSessionsFn: () => Promise<ActiveSession[]>,
): Promise<void> {
  debugLog('ConnectionService', 'ConnectionManager: Received ConnectFailure:', failure);
  const errorMessage: string = failure.message || '';

  if (!errorMessage.toLowerCase().includes('session already connected')) {
    return;
  }

  debugLog('ConnectionService', 'ConnectionManager: Session already connected error detected');
  const extractedCid: string | null = state.extractCidFromErrorMessage(errorMessage);

  if (extractedCid) {
    debugLog('ConnectionService', 'ConnectionManager: Existing session CID from message:', extractedCid);
    io.emitEvent('session-already-connected', { cid: extractedCid, message: errorMessage });
    return;
  }

  debugLog('ConnectionService', 'ConnectionManager: No CID in error message, fetching active sessions...');
  try {
    const activeSessions: ActiveSession[] = await getActiveSessionsFn();
    debugLog('ConnectionService', 'ConnectionManager: Active sessions after error:', activeSessions);

    const activeIndex: number = state.getActiveSessionIndex();
    const currentSession: StoredSession = state.storedSessions.sessions[activeIndex];

    const matchingSession: ActiveSession | undefined = activeSessions.find(
      (s) =>
        currentSession &&
        s.username === currentSession.username &&
        s.server_address === currentSession.serverAddress
    );

    if (matchingSession) {
      debugLog('ConnectionService', 'ConnectionManager: Found matching active session:', matchingSession);
      io.emitEvent('session-already-connected', {
        cid: matchingSession.cid.toString(),
        message: errorMessage,
      });
    } else {
      debugLog('ConnectionService', 'ConnectionManager: No matching active session found');
    }
  } catch (error) {
    debugLog('ConnectionService', 'Failed to get active sessions:', error);
  }
}
