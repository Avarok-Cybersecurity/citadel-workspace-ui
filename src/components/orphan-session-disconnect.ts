/**
 * Whether a session can be signed out of, and what to say when it cannot.
 *
 * `ActiveSession.cid` is declared `bigint` and is not always present. The
 * loader in `useOrphanSessions` already guards `sel?.cid !== undefined` for
 * that reason; the disconnect path did not, so
 * `websocketService.disconnect(undefined)` was called, the loading modal ran
 * through to "ready", and the session was still in the strip afterwards. CI
 * reported it as
 *
 *   [OrphanSessionsNavbar] Disconnecting session: undefined
 *   prev_sess_b still in navbar: true
 *
 * -- three checks failing on an action that reported success.
 *
 * Its own module because the decision is worth testing on its own, and because
 * the hook it came from is at its length ceiling.
 */

/** Why a session cannot be disconnected, or `null` when it can. */
export function disconnectRefusal(cid: bigint | undefined): string | null {
  if (cid !== undefined) return null;
  return 'This session has no identifier, so it cannot be signed out of here. Reload and try again.';
}
