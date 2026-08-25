/**
 * YJS P2P Provider - Constants
 *
 * Yjs-specific timing constants local to this module.
 */

export const YJS_ACK_TIMEOUT_MS = 5000;
export const YJS_SYNC_COOLDOWN_MS = 10000;
export const YJS_SYNC_RESET_DELAY_MS = 2000;
export const YJS_HEALTH_CHECK_INTERVAL_MS = 5000;
export const YJS_MAX_RETRIES = 3;

/**
 * How long edits are gathered before one merged update goes on the wire.
 *
 * Yjs emits an update per transaction, so ordinary typing produces one P2P
 * message per keystroke. Each of those waits on its own application-level ACK
 * within YJS_ACK_TIMEOUT_MS, and the transport underneath is stop-and-wait per
 * peer -- one message per poll cycle, gated on the previous being
 * acknowledged. Twenty-eight keystrokes therefore become twenty-eight
 * serialised round trips, and the later ones time out before their turn comes
 * up. That is measured, not theoretical: a live-doc run emits exactly 28
 * first-attempt ACK timeouts locally, where the retry happens to land, and the
 * same 28 in CI, where all three retries expire and the edits are abandoned.
 *
 * Yjs updates merge losslessly, so coalescing costs nothing but latency.
 * 120ms is below the ~200ms at which collaborative typing starts to feel
 * detached, and collapses a burst of typing into a single message.
 */
export const YJS_UPDATE_COALESCE_MS = 120;
