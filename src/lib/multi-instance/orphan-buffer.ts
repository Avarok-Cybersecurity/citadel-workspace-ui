/**
 * CID-keyed Orphan Message Buffer
 *
 * Holds CID-routed messages whose target instance isn't yet registered
 * with the leader's instance map. Drained when the instance:registered
 * event fires for the matching CID; otherwise flushed locally after
 * `ORPHAN_BUFFER_TIMEOUT_MS`.
 *
 * Lives in its own module so InstanceInboundRouter can stay under the
 * 250-line cap and so the buffer semantics (timer lifecycle, FIFO drain,
 * replay vs. fallback) are testable in isolation from the router.
 */

import { debugLog } from '@/lib/debug-config';

/**
 * How long to hold an orphaned (unknown-CID) message before falling
 * back to local processing. Must cover the full BroadcastChannel
 * cid-report round-trip (leader requests → owner answers → leader
 * registers → drain), which is normally <50ms but can stretch to
 * hundreds of ms when the owning *follower* tab is busy — mid
 * ClaimSession, re-auth after reload, or a heavy re-render — exactly
 * when a peer-registration / file-transfer notification tends to
 * arrive. 500ms lost that race and the message fell back to (and was
 * dropped by) the leader; 2s comfortably covers a busy follower while
 * staying acceptable for an interactive notification's worst case.
 */
export const ORPHAN_BUFFER_TIMEOUT_MS = 2000;

/** A message held in the buffer pending a cid-report response. */
export interface OrphanedMessage {
  message: Record<string, unknown>;
  messageType: string;
  fallbackTimer: ReturnType<typeof setTimeout>;
}

/**
 * Drain callback signature: invoked for each buffered entry when the
 * cid-report arrives. The router supplies its own `routeByCid` so the
 * just-registered owner is found on replay.
 */
export type DrainHandler = (entry: OrphanedMessage) => void;

/**
 * Fallback callback signature: invoked when an entry times out without
 * a matching cid-report. The router supplies `processLocalMessage`.
 */
export type FallbackHandler = (message: Record<string, unknown>, messageType: string) => void;

/**
 * Minimal buffer state — just a CID-keyed map of arrays. Multiple
 * messages can pile up for the same CID during the buffer window
 * (e.g. a burst of FileTransferTickNotifications), hence the array.
 */
export class OrphanBuffer {
  private entries: Map<string, OrphanedMessage[]> = new Map();

  constructor(
    private readonly onFallback: FallbackHandler,
    private readonly timeoutMs: number = ORPHAN_BUFFER_TIMEOUT_MS,
  ) {}

  /**
   * Push an orphaned message and arm a fallback timer. The timer is
   * cleared by `drainForCid` if a cid-report arrives in time.
   */
  push(cid: string, message: Record<string, unknown>, messageType: string): void {
    const fallbackTimer = setTimeout(() => {
      this.removeByTimer(cid, fallbackTimer);
      debugLog('OrphanBuffer',
        `Orphan buffer timeout for CID ${cid} (${messageType}); falling back to local processing`,
      );
      this.onFallback(message, messageType);
    }, this.timeoutMs);

    const entry: OrphanedMessage = { message, messageType, fallbackTimer };
    const existing = this.entries.get(cid);
    if (existing) {
      existing.push(entry);
    } else {
      this.entries.set(cid, [entry]);
    }
    debugLog('OrphanBuffer',
      `Buffered ${messageType} for CID ${cid} (size=${(existing?.length ?? 0) + 1}, timeout ${this.timeoutMs}ms)`,
    );
  }

  /**
   * Drain every entry for the CID, clearing their fallback timers and
   * invoking the supplied handler (router replays via routeByCid). No-op
   * if the CID has no buffered entries.
   */
  drainForCid(cid: string, onEach: DrainHandler): void {
    const buffered = this.entries.get(cid);
    if (!buffered || buffered.length === 0) return;
    debugLog('OrphanBuffer', `Draining ${buffered.length} buffered message(s) for CID ${cid}`);
    this.entries.delete(cid);
    for (const entry of buffered) {
      clearTimeout(entry.fallbackTimer);
      onEach(entry);
    }
  }

  /**
   * Internal: drop the entry whose fallback timer fired. Identified by
   * reference (not index) so concurrent drains never skip past it.
   */
  private removeByTimer(cid: string, timer: ReturnType<typeof setTimeout>): void {
    const buffered = this.entries.get(cid);
    if (!buffered) return;
    const remaining = buffered.filter(e => e.fallbackTimer !== timer);
    if (remaining.length === 0) {
      this.entries.delete(cid);
    } else {
      this.entries.set(cid, remaining);
    }
  }
}
