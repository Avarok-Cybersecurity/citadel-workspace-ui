/**
 * Fold session identity into `state.currentUser` without discarding what is
 * already there.
 *
 * The workspace-loaded handler used to build a whole new object:
 *
 *   currentUser: { id, username, name, role }
 *
 * `UserRegistrationInfo` carries only username, fullName, serverAddress and
 * serverPassword — there is no avatar in it — so every workspace load replaced
 * a `currentUser` that had an `avatarUrl` with one that did not. The profile
 * update event is the ONLY writer of that field, so the picture a user had just
 * set survived until the next workspace event and then vanished, and a reload
 * never showed it at all.
 *
 * That is the same shape as the recorded workspace-metadata defect: a partial
 * record assigned over a fuller one. Merging is the fix, and doing it in one
 * named function rather than inline is what makes it testable.
 */

/** What the app tracks about the person using it. */
export interface CurrentUser {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly role?: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
}

/** The identity fields a session can supply. */
export interface SessionIdentity {
  readonly username: string;
  readonly fullName?: string;
  readonly role?: string;
}

export function mergeCurrentUser(
  previous: CurrentUser | undefined,
  identity: SessionIdentity,
): CurrentUser {
  return {
    // Spread FIRST so the session's fields win where it has them, and anything
    // it knows nothing about -- avatarUrl above all -- is carried through.
    ...previous,
    id: identity.username,
    username: identity.username,
    name: identity.fullName || identity.username,
    // `role` comes from the stored session and is legitimately undefined for a
    // member whose role has not loaded yet. Falling back to the previous value
    // keeps a known role rather than blanking it on a reconnect.
    role: identity.role ?? previous?.role,
  };
}
