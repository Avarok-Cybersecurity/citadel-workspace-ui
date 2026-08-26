import { connectionManager } from '../connection';

/**
 * Whether this browser's WebSocket owns the given session.
 *
 * Multi-tab P2P legitimately initiates from the other side, because one
 * WebSocket owns both sessions. Across browsers it does not, and asking the
 * service to act on a session we do not own is now refused outright.
 */
export async function ownsSession(cid: bigint): Promise<boolean> {
  try {
    const sessions = await connectionManager.getActiveSessions();
    return sessions.some((session) => session.cid === cid);
  } catch {
    // Unknown ownership: assume not ours and initiate from our own side, which
    // is always a request we are allowed to make.
    return false;
  }
}
