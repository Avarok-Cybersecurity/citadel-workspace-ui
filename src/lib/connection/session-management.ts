/** Session storage, auth success, logout, and session CRUD for ConnectionManager. */

import type { ConnectionState } from './state';
import { markLastAccessed } from '@/lib/sessions/last-accessed';
import type { ConnectionIO } from './io';
import type { AuthSuccessParams } from './types';
import type { StoredSession } from '@/types/session-types';
import { selectUserWithoutBlocking } from './select-user';
import { debugLog } from '@/lib/debug-config';
import { saveRecentServer } from '@/lib/server-utils';
import { isGenuinelyAbsent } from '@/lib/storage/absence';

/** Store a session to state and persist to LocalDB. */
/**
 * Record a session in memory and, best-effort, on disk.
 *
 * Returns whether the DISK half succeeded. It used to rethrow, and the caller
 * did not catch — see `handleAuthSuccess`, where three sibling operations are
 * each wrapped with a comment explaining that a local storage failure must not
 * abort the auth flow, and this one, the only one that actually times out, was
 * not.
 *
 * The in-memory update happens first and cannot fail, so a persistence failure
 * costs the ability to reconnect automatically NEXT time. It does not cost the
 * session that was just authenticated, and it must not.
 */
export async function storeSession(
  session: StoredSession, state: ConnectionState, io: ConnectionIO,
): Promise<boolean> {
  state.addOrUpdateSession(session);
  try {
    await io.storeSessionsToLocalDB(state.storedSessions);
    return true;
  } catch (error) {
    debugLog('ConnectionService', 'Failed to store session', error);
    return false;
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
    if (isGenuinelyAbsent(error)) {
      debugLog('ConnectionService', 'No stored sessions yet');
      return;
    }
    // Not the same thing at all. An empty session list is what the reconnect
    // machinery reads as "there is nothing to reconnect to", so a read that
    // FAILED and a store that is genuinely empty send the user to the landing
    // page by identical routes. This line fires on every first boot, which is
    // exactly why a real failure printing beside it would never be noticed.
    debugLog('ConnectionService', 'COULD NOT READ stored sessions; ' +
      'proceeding as though there are none, which may drop a reconnectable session:', error);
  }
}

/** Handle successful authentication by storing session and updating state. */
export async function handleAuthSuccess(
  params: AuthSuccessParams, state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  debugLog('ConnectionService', 'handleAuthSuccess:', params.username, 'CID:', params.cid);

  const session: StoredSession = {
    username: params.username,
    // Honor the "Remember Credentials" switch. It reached component state and
    // stopped there, so this line stored the password unconditionally.
    password: params.storeCredentials ? params.password : undefined,
    serverAddress: params.serverAddress,
    // The server PSK is a credential too, and it was stored unconditionally
    // while the account password beside it was gated. A user who declined to
    // have their credentials remembered still had the workspace's pre-shared
    // key written to disk in cleartext -- and the PSK is the one that admits
    // ANY account to that server, so it is the worse of the two to leave
    // behind.
    serverPassword: params.storeCredentials ? params.serverPassword : undefined,
    fullName: params.fullName,
    lastConnected: Date.now(),
    cid: params.cid,
    sessionSecuritySettings: params.securitySettings,
  };

  try {
    // Not awaited for its success: a LocalDB write that times out costs the
    // ability to reconnect automatically next time, and nothing else. The
    // account exists on the server, the credentials were accepted, and the
    // in-memory session is already correct.
    //
    // It used to throw out of here, and the Join flow reported it as
    // "Registration Error" -- so a five-second local storage timeout discarded
    // a completed authentication, and the user's retry met "username already
    // taken". Every other local write in this function was already protected
    // for exactly this reason; this was the one that was not, and the only one
    // that actually times out.
    const persisted: boolean = await storeSession(session, state, io);
    if (!persisted) {
      debugLog(
        'ConnectionService',
        'Session could not be persisted; continuing with the live session',
      );
    }

    // Persist to localStorage so Connect page can show recent servers
    // even without WASM client. Isolated from the outer try because
    // localStorage.setItem can throw (quota exceeded, storage
    // disabled, private-browsing restrictions) and recent-server
    // metadata is best-effort UX — losing it must NOT abort the
    // auth-success flow that owns tab-context setup, P2P registration,
    // etc. below.
    try {
      saveRecentServer({ serverAddress: params.serverAddress });
    } catch (e) {
      debugLog('ConnectionService', 'saveRecentServer failed (non-critical):', e);
    }

    // Set lastAccessed timestamp for OrphanSessionsNavbar MRU ordering.
    // Same isolation reasoning as saveRecentServer above — sort order
    // is best-effort, and a localStorage failure here would abort the
    // auth flow if it weren't caught.
    if (params.cid !== undefined) {
      markLastAccessed(params.cid);
    }

    debugLog('ConnectionService', 'handleAuthSuccess: setting tab context for CID:', params.cid?.toString());
    await selectUserWithoutBlocking(io, {
      selectedUsername: params.username,
      selectedServerAddress: params.serverAddress,
      selectedCid: params.cid,
    });

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

/**
 * Handle user logout by removing the session and disconnecting.
 *
 * The disconnect is NOT gated on the local write. It used to be — the write sat
 * between them, so a `LocalDBSetKV` timeout meant the user pressed Sign Out,
 * the session vanished from memory and the UI, and the connection to the server
 * stayed open. That is the same defect as round 189 pointing the other way: a
 * local storage failure suppressing an action the user asked for, and here the
 * suppressed action is the one that ends a session.
 *
 * Persisting after, best-effort, because the disconnect is what the user
 * pressed and the record is a convenience.
 */
export async function handleLogout(
  username: string, serverAddress: string, cid: bigint,
  state: ConnectionState, io: ConnectionIO,
): Promise<void> {
  state.removeSession(username, serverAddress);
  if (cid) await io.disconnect(cid);
  try {
    await io.storeSessionsToLocalDB(state.storedSessions);
  } catch (error) {
    debugLog('ConnectionService', 'Could not persist sessions after logout', error);
  }
}

/** Update the role for a stored session. */
export async function updateSessionRole(
  username: string, serverAddress: string, role: string,
  state: ConnectionState, io: ConnectionIO,
  storeSessionFn: (session: StoredSession) => Promise<void>,
): Promise<void> {
  const session: StoredSession | undefined = state.findSession(username, serverAddress);
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
