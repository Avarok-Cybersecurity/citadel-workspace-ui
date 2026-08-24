/** Constants shared by the call manager and its extracted collaborators. */

/** Bumped when the frame wire format changes. */
export const MEDIA_WIRE_VERSION = 1;

/** How long an unanswered call rings before giving up. */
export const RING_TIMEOUT_MS = 45_000;

/**
 * How often each participant announces it is still there, on the reliable path.
 *
 * A call currently ends on the far side only when a CallEnd arrives. If that
 * signal is delayed or lost — a tab closed hard, a laptop lid shut, a network
 * that drops — the other person is left sitting in a call that is over, with
 * their camera on. Absence of media frames is NOT a substitute: a participant
 * who muted and turned their camera off sends nothing and is still present.
 */
export const CALL_HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * How long a participant may go unheard before being treated as gone.
 *
 * Four missed heartbeats. Long enough that an ordinary network stall or a
 * backgrounded tab does not eject someone mid-sentence, short enough that a
 * dead call does not linger.
 */
export const CALL_HEARTBEAT_TIMEOUT_MS = 20_000;
