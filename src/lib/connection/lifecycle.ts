/**
 * Connection Lifecycle
 *
 * Handles successful connection processing, disconnect,
 * and account switching for the ConnectionManager.
 */

import type { ConnectionState } from './state';
import type { ConnectionIO } from './io';
import type { StoredSession } from '@/types/session-types';
import { storeSession } from './session-management';
import { debugLog } from '@/lib/debug-config';

/**
 * Handle a successful connection by updating state and notifying services.
 */
export async function handleSuccessfulConnection(
  cid: bigint,
  shouldUpdateStoredSession: boolean,
  state: ConnectionState,
  io: ConnectionIO,
): Promise<void> {
  state.setCurrentConnectionInfo({ cid });
  debugLog('ConnectionService', 'ConnectionManager: Handling successful connection', cid.toString(), 'shouldUpdateStoredSession:', shouldUpdateStoredSession);

  io.setInstanceCid(cid);
  io.announcePresence();
  state.resetReconnectAttempts();

  if (!shouldUpdateStoredSession) {
    debugLog('ConnectionService', 'ConnectionManager: Skipping connection notifications - handleAuthSuccess will handle them');
    return;
  }

  // Update stored session with CID
  let sessionUsername: string | undefined;
  if (state.storedSessions.sessions.length > 0) {
    const activeIndex = state.getActiveSessionIndex();
    const session = state.storedSessions.sessions[activeIndex];
    if (session) {
      session.cid = cid;
      session.lastConnected = Date.now();
      sessionUsername = session.username;
      await storeSession(session, state, io);
      debugLog('ConnectionService', 'ConnectionManager: Updated stored session with CID:', cid.toString());
    }
  }

  io.setWorkspaceConnectionId(cid);
  io.updateConnectionService({ cid, isConnected: true });
  io.broadcastConnectionStatus({ isConnected: true, cid });

  if (sessionUsername) {
    io.emitEvent('auth:success', { cid, username: sessionUsername });
  }
}

/**
 * Disconnect a session from the server.
 */
export async function disconnectSession(
  session: { cid: bigint; username?: string; serverAddress?: string } | undefined,
  state: ConnectionState,
  io: ConnectionIO,
): Promise<void> {
  const cid = session?.cid ?? state.currentConnectionInfo?.cid;
  const username = session?.username ?? state.currentConnectionInfo?.username;
  const serverAddress = session?.serverAddress ?? state.currentConnectionInfo?.serverAddress;

  if (!cid) {
    debugLog('ConnectionService', 'disconnect() called but no CID available - skipping backend disconnect');
    state.setCurrentConnectionInfo(null);
    state.invalidateCache();
    io.updateConnectionService({ cid: null, isConnected: false });
    io.broadcastConnectionStatus({ isConnected: false });
    return;
  }

  debugLog('ConnectionService', 'ConnectionManager: Disconnecting session with CID:', cid.toString());

  // The MEMORY mark first, the disconnect second, the write last.
  //
  // These three used to be two: `markUserDisconnected` recorded the intent and
  // persisted it in one awaited call, ahead of the disconnect. So a LocalDB
  // write that took five seconds to time out held up a sign-out — the same
  // shape as rounds 189 and 190, found here by the guard those two produced.
  //
  // Swapping them outright would have been wrong. `handleDisconnect` schedules
  // a reconnect a second after the disconnect notification and consults the
  // in-memory set to decide whether to skip it, so the mark has to be in place
  // BEFORE the disconnect or auto-reconnect can revive the session the user
  // just left. Only the persistence — which exists so the decision survives a
  // reload, and has no deadline — moves after.
  if (username && serverAddress) {
    io.markUserDisconnectedNow(username, serverAddress);
  }
  await io.disconnect(cid);
  if (username && serverAddress) {
    await io.persistUserDisconnected();
  }

  state.setCurrentConnectionInfo(null);
  state.invalidateCache();
  io.updateConnectionService({ cid: null, isConnected: false });
  io.broadcastConnectionStatus({ isConnected: false });
}

/**
 * Switch the current tab to a different account.
 */
export async function switchAccount(
  username: string,
  serverAddress: string,
  state: ConnectionState,
  io: ConnectionIO,
  disconnectFn: () => Promise<void>,
  storeSessionFn: (session: StoredSession) => Promise<void>,
): Promise<void> {
  const session = state.findSession(username, serverAddress);
  if (!session) {
    throw new Error('Session not found');
  }

  debugLog('ConnectionService', `ConnectionManager: Switching account to ${username}@${serverAddress} for this tab`);

  await io.setSelectedUser({
    selectedUsername: username,
    selectedServerAddress: serverAddress,
    selectedCid: session.cid,
  });

  if (state.isLeader) {
    await disconnectFn();

    if (!session.password) {
      // The user declined credential storage, so there is nothing to sign in
      // with. Say so instead of sending an empty password and surfacing an
      // authentication failure they cannot act on.
      throw new Error(
        `Cannot reconnect ${session.username} automatically: credentials were not saved. Please sign in again.`,
      );
    }

    const requestId = crypto.randomUUID();
    await io.connect({
      requestId,
      username: session.username,
      password: session.password,
      sessionSecuritySettings: session.sessionSecuritySettings,
    });

    session.lastConnected = Date.now();
    await storeSessionFn(session);
  } else {
    debugLog('ConnectionService', 'ConnectionManager: Follower tab - updating selected user without reconnecting');
  }
}
