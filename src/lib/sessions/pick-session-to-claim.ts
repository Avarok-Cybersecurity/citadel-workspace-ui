import type { ActiveSession } from '@/types/session-types';

export interface SessionChoice {
  /** The session to claim, or undefined when there is nothing to claim. */
  session: ActiveSession | undefined;
  /**
   * Whether the tab's stored selection names a session that is no longer live,
   * and should therefore be cleared.
   *
   * Returned rather than performed, because clearing is a destructive write and
   * the caller must only do it when the session list is a real answer. It used
   * to be performed inline off a list that was `[]` on ANY failure -- so a
   * GetSessions timeout destroyed the tab's session selection, the user was
   * bounced to /connect, and re-authenticating a session that was still alive
   * produced the SessionAlreadyActive churn.
   */
  staleSelection: boolean;
}

/**
 * Which live session this tab should claim, given what it last had selected.
 *
 * Pure, so the rule -- prefer the remembered session, fall back to the first
 * live one -- can be read in one place and tested without a connection manager.
 */
export function pickSessionToClaim(
  activeSessions: ActiveSession[],
  selectedCid: bigint | null | undefined,
): SessionChoice {
  if (activeSessions.length === 0) return { session: undefined, staleSelection: false };

  if (selectedCid) {
    const remembered: ActiveSession | undefined = activeSessions.find((s) => s.cid === selectedCid);
    if (remembered) return { session: remembered, staleSelection: false };
    return { session: activeSessions[0], staleSelection: true };
  }

  return { session: activeSessions[0], staleSelection: false };
}
