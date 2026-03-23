/** Session storage, auth success, logout, and session CRUD for ConnectionManager. */

import type { ConnectionState } from './state';
import type { ConnectionIO } from './io';
import type { AuthSuccessParams } from './types';
import type { StoredSession } from '@/types/session-types';
import { SET_USER_TIMEOUT_MS } from './constants';
import { debugLog } from '@/lib/debug-config';
import { saveRecentServer } from '@/lib/server-utils';

/** Store a session to state and persist to LocalDB. */
export async function storeSession(
  session: StoredSession, state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  try {
    state.addOrUpdateSession(session);
    await io.storeSessionsToLocalDB(state.storedSessions);
  } catch (error) {
    debugLog('ConnectionService', 'Failed to store session', error);
    throw error;
  }
}

/** Load stored sessions from LocalDB into state. */
export async function loadStoredSessions(
  state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  try {
    const loaded = await io.loadSessionsFromLocalDB();
    if (loaded) {
      state.setStoredSessions(loaded);
      debugLog('ConnectionService', 'Loaded', state.storedSessions.sessions.length, 'stored sessions');
    }
  } catch (error) {
    debugLog('ConnectionService', 'Failed to load stored sessions', error);
  }
}

/** Handle successful authentication by storing session and updating state. */
export async function handleAuthSuccess(
  params: AuthSuccessParams, state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  debugLog('ConnectionService', 'handleAuthSuccess:', params.username, 'CID:', params.cid);

  const session: StoredSession = {
    username: params.username,
    password: params.password,
    serverAddress: params.serverAddress,
    serverPassword: params.serverPassword,
    fullName: params.fullName,
    lastConnected: Date.now(),
    cid: params.cid,
    sessionSecuritySettings: params.securitySettings,
  };

  try {
    await storeSession(session, state, io);

    // Persist to localStorage so Connect page can show recent servers even without WASM client
    saveRecentServer({ serverAddress: params.serverAddress });

    // Set lastAccessed timestamp for OrphanSessionsNavbar MRU ordering
    if (params.cid !== undefined) {
      const lastAccessedKey = `session_last_accessed_${params.cid.toString()}`;
      localStorage.setItem(lastAccessedKey, Date.now().toString());
    }

    debugLog('ConnectionService', 'handleAuthSuccess: setting tab context for CID:', params.cid?.toString());
    try {
      await Promise.race([
        io.setSelectedUser({
          selectedUsername: params.username,
          selectedServerAddress: params.serverAddress,
          selectedCid: params.cid,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('setSelectedUser timeout')), SET_USER_TIMEOUT_MS)
        ),
      ]);
      debugLog('ConnectionService', 'handleAuthSuccess: tab context set successfully');
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'setSelectedUser timeout') {
        debugLog('ConnectionService', 'handleAuthSuccess: setSelectedUser timed out - continuing anyway');
      } else {
        throw err;
      }
    }

    if (params.cid !== undefined) {
      state.setCurrentConnectionInfo({
        cid: params.cid,
        username: params.username,
        serverAddress: params.serverAddress,
        fullName: params.fullName,
      });

      io.setWorkspaceConnectionId(params.cid);

      debugLog('ConnectionService', 'handleAuthSuccess: triggering connection status update for CID:', params.cid.toString());
      io.updateConnectionService({
        cid: params.cid,
        isConnected: true,
        userContext: {
          selectedUsername: params.username,
          selectedServerAddress: params.serverAddress,
          selectedCid: params.cid,
        },
      });
    }

    debugLog('ConnectionService', 'handleAuthSuccess: completed successfully');
  } catch (error) {
    debugLog('ConnectionService', 'handleAuthSuccess failed:', error);
    throw error;
  }
}

/** Handle user logout by removing session and disconnecting. */
export async function handleLogout(
  username: string, serverAddress: string, cid: bigint,
  state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  state.removeSession(username, serverAddress);
  await io.storeSessionsToLocalDB(state.storedSessions);
  if (cid) await io.disconnect(cid);
}

/** Remove a single session from state and persist. */
export async function removeSession(
  username: string, serverAddress: string,
  state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  state.removeSession(username, serverAddress);
  await io.storeSessionsToLocalDB(state.storedSessions);
}

/** Remove all sessions, persist, and disconnect if active. */
export async function removeAllSessions(
  state: ConnectionState, io: ConnectionIO, disconnectFn: () => Promise<void>,
): Promise<void> {
  state.clearSessions();
  await io.storeSessionsToLocalDB(state.storedSessions);
  if (state.currentConnectionInfo) await disconnectFn();
}

/** Clear all stored sessions and persist. */
export async function clearStoredSessions(
  state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  state.clearSessions();
  await io.storeSessionsToLocalDB(state.storedSessions);
}

/** Update the role for a stored session. */
export async function updateSessionRole(
  username: string, serverAddress: string, role: string,
  state: ConnectionState, io: ConnectionIO,
  storeSessionFn: (session: StoredSession) => Promise<void>,
): Promise<void> {
  const session = state.findSession(username, serverAddress);
  if (session) {
    session.role = role;
    await storeSessionFn(session);
  }
}

/** Set the active session index and persist. */
export async function setActiveSessionIndex(
  index: number, state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  if (index >= 0 && index < state.storedSessions.sessions.length) {
    state.setActiveSessionIndex(index);
    await io.storeSessionsToLocalDB(state.storedSessions);
    io.emitEvent('session-selected', { session: state.storedSessions.sessions[index], index });
  }
}
