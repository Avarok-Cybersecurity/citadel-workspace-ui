/**
 * YJS P2P Provider - Constants
 *
 * Yjs-specific timing constants local to this module.
 */

export const YJS_ACK_TIMEOUT_MS: number = 5000;
export const YJS_SYNC_COOLDOWN_MS: number = 10000;
export const YJS_SYNC_RESET_DELAY_MS: number = 2000;
export const YJS_HEALTH_CHECK_INTERVAL_MS: number = 5000;
export const YJS_MAX_RETRIES: number = 3;

/**
 * How long edits are gathered before one merged update is sent.
 *
 * This MUST exceed ILM's `OUTBOUND_POLL` (200ms, citadel-internal-service/
 * intersession-layer-messaging/src/lib.rs). That layer is stop-and-wait per
 * peer — one message per poll cycle, gated on the previous being acknowledged —
 * so it drains at most ~5 messages/sec. At the previous 120ms this coalescer
 * produced ~8/sec during sustained typing, measured at 7.4/sec in CI: the
 * producer outran the drain, the queue grew for as long as typing continued,
 * and the tail of it timed out. A window SHORTER than the poll interval it
 * feeds guarantees a backlog under any sustained edit.
 *
 * At 300ms the producer is ~3.3/sec against a ~5/sec drain, leaving headroom
 * for the slower drain seen under CI contention. The cost is up to 300ms of
 * added latency before a collaborator sees a keystroke, which is well inside
 * what collaborative editors normally batch.
 */
export const YJS_UPDATE_COALESCE_MS: number = 300;
