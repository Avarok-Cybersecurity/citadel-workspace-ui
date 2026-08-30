/**
 * Sessions this tab has removed, held until the server stops reporting them.
 *
 * Deregistering a session removes it locally and then reloads the list, and the
 * reload can hand back the session that was just deleted: `GetSessions` answers
 * from a connection map the deregistration has not propagated to yet. Worse,
 * deregistering stops the WASM client, whose reconnection fires
 * `on-ws-connection-success` — which reloads the list again, from the same
 * not-yet-caught-up server, at a moment nobody chose.
 *
 * `sign-out-session` already does the removal LAST for this reason, and its
 * comment explains why. That is enough against the one reload it performs
 * itself and no help at all against a reload triggered by a reconnection
 * afterwards. CI reported exactly the surviving half: "Deregister Removes: FAIL"
 * beside "Deregister Permanent: PASS" — gone after a reload, still on screen
 * before one.
 *
 * A tombstone rather than a timeout: the condition is "the server still says
 * this exists", so the thing to wait for is the server no longer saying it, not
 * an interval somebody guessed. It clears itself the first time a list comes
 * back without the session, so a deregistration that failed server-side does
 * not hide a live session for ever.
 *
 * Session-scoped by design. A reload is a fresh answer from the server, and by
 * then the deletion has landed.
 */

const forgotten: Set<string> = new Set<string>();

/** Hide this session until the server stops listing it. */
export function forgetSession(cid: bigint): void {
  forgotten.add(cid.toString());
}

export function isForgotten(cid: bigint): boolean {
  return forgotten.has(cid.toString());
}

/**
 * Drop tombstones for sessions the server no longer reports.
 *
 * Called with each list as it arrives. A tombstone whose session is absent has
 * done its job; keeping it would hide a CID that could be reissued.
 */
export function reconcileForgotten(present: readonly bigint[]): void {
  const listed: Set<string> = new Set(present.map((cid) => cid.toString()));
  for (const cid of [...forgotten]) {
    if (!listed.has(cid)) forgotten.delete(cid);
  }
}

/** Test seam: the set outlives any component. */
export function rememberEverything(): void {
  forgotten.clear();
}

/**
 * The sessions a list should actually show.
 *
 * Reconciles first, so a tombstone whose session has finally gone stops hiding
 * anything, and only then filters. Doing it in one place keeps the two halves
 * from being called in the wrong order by the next caller: filtering before
 * reconciling would hide a session for one extra list every time.
 */
export function withoutForgotten<T extends { cid: bigint }>(sessions: readonly T[]): T[] {
  reconcileForgotten(sessions.map((session) => session.cid));
  return sessions.filter((session) => !isForgotten(session.cid));
}
