import type { ActiveSession } from '@/types/session-types';
import type { OrphanSessionWithWorkspace } from '@/components/useOrphanSessions';

/** Just the fields this pairing needs from a stored session. */
interface StoredLike {
  username: string;
  serverAddress: string;
}

/**
 * Pair each live session with the stored record that names its workspace, and
 * order them by when the user last used them.
 *
 * Pure, and separate from the hook, so the ordering rule can be read and tested
 * without standing up a connection manager. `lastAccessed` comes from
 * localStorage rather than the session itself: the backend has no notion of
 * which of your sessions you looked at most recently, and that is the order the
 * navbar wants.
 */
export function withWorkspaceNames(
  activeSessions: ActiveSession[],
  storedSessions: StoredLike[],
  readLastAccessed: (cid: ActiveSession['cid']) => number,
): OrphanSessionWithWorkspace[] {
  const paired = activeSessions.map((activeSession) => {
    const storedIndex = storedSessions.findIndex(
      (stored) =>
        stored.username === activeSession.username &&
        stored.serverAddress === activeSession.server_address,
    );
    const storedSession = storedSessions[storedIndex];

    return {
      ...activeSession,
      workspaceName: storedSession?.username || activeSession.username,
      storedSessionIndex: storedIndex,
      lastAccessed: readLastAccessed(activeSession.cid),
    };
  });

  return paired.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
}
