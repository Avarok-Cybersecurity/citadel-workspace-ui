/**
 * Connection Queries
 *
 * Handles active session fetching, tab selection lookups,
 * and connect failure processing for the ConnectionManager.
 */

import type { ConnectionState } from './state';
import type { ConnectionIO } from './io';
import type { ActiveSession } from '@/types/session-types';
import {
  WEBSOCKET_INIT_TIMEOUT_MS,
  GET_SESSIONS_TIMEOUT_MS,
} from './constants';
import { debugLog } from '@/lib/debug-config';

/**
 * Get active sessions with caching and deduplication.
 */
export async function getActiveSessions(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<ActiveSession[]> {
  const cached = state.cachedSessions;
  if (cached && state.isCacheValid()) {
    return cached;
  }

  const pending = state.pendingGetSessions;
  if (pending) {
    return pending;
  }

  const fetchPromise = fetchActiveSessions(state, io);
  state.setPendingGetSessions(fetchPromise);

  try {
    const result = await fetchPromise;
    state.setCachedSessions(result);
    return result;
  } finally {
    state.setPendingGetSessions(null);
  }
}

async function fetchActiveSessions(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<ActiveSession[]> {
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
        return [];
      }

      if (!io.canSendRequests()) {
        return [];
      }
    }

    const requestId = crypto.randomUUID();

    const responsePromise = new Promise<{ sessions?: ActiveSession[] }>((resolve, reject) => {
      state.setPendingRequest(requestId, { resolve: resolve as (value: unknown) => void, reject });

      setTimeout(() => {
        if (state.hasPendingRequest(requestId)) {
          state.deletePendingRequest(requestId);
          reject(new Error('GetSessions request timed out'));
        }
      }, GET_SESSIONS_TIMEOUT_MS);
    });

    await io.sendWebSocketMessage({ GetSessions: { request_id: requestId } });

    const response = await responsePromise;
    return response.sessions || [];
  } catch (error) {
    debugLog('ConnectionService', 'Failed to get active sessions', error);
    return [];
  }
}

/**
 * Get the tab-specific active session index.
 */
export async function getTabActiveSessionIndex(
  state: ConnectionState,
  io: ConnectionIO,
): Promise<number> {
  const tabSelection = await io.getSelectedUser();
  if (tabSelection?.selectedUsername && tabSelection?.selectedServerAddress) {
    const index = state.findSessionIndex(
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
  const errorMessage = failure.message || '';

  if (!errorMessage.toLowerCase().includes('session already connected')) {
    return;
  }

  debugLog('ConnectionService', 'ConnectionManager: Session already connected error detected');
  const extractedCid = state.extractCidFromErrorMessage(errorMessage);

  if (extractedCid) {
    debugLog('ConnectionService', 'ConnectionManager: Existing session CID from message:', extractedCid);
    io.emitEvent('session-already-connected', { cid: extractedCid, message: errorMessage });
    return;
  }

  debugLog('ConnectionService', 'ConnectionManager: No CID in error message, fetching active sessions...');
  try {
    const activeSessions = await getActiveSessionsFn();
    debugLog('ConnectionService', 'ConnectionManager: Active sessions after error:', activeSessions);

    const activeIndex = state.getActiveSessionIndex();
    const currentSession = state.storedSessions.sessions[activeIndex];

    const matchingSession = activeSessions.find(
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
