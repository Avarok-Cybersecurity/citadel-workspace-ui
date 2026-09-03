/**
 * Gathers rapid Yjs edits into one merged update.
 *
 * Yjs emits an update per transaction, so ordinary typing produces one P2P
 * message per keystroke. Each waits on its own application-level ACK, and the
 * transport beneath is stop-and-wait per peer — one message per poll cycle,
 * gated on the previous being acknowledged — so a burst of typing becomes a
 * queue of serialised round trips and the later edits time out before their
 * turn. Coalescing is what keeps a document editable on a slow link.
 *
 * Split out of provider.ts so the buffering rule is testable and stated once,
 * rather than threaded through the provider's lifecycle.
 */

import * as Y from 'yjs';
import { YJS_UPDATE_COALESCE_MS } from './constants';

export class UpdateCoalescer {
  private pending: Uint8Array[] = [];
  private timer: number | null = null;

  /** `send` receives the merged update once the window closes. */
  constructor(private readonly send: (update: Uint8Array) => void) {}

  /** Buffer an edit, arming the window if it is not already open. */
  add(update: Uint8Array): void {
    this.pending.push(update);
    if (this.timer === null) {
      this.timer = window.setTimeout(() => this.flush(), YJS_UPDATE_COALESCE_MS);
    }
  }

  /**
   * Merge and send whatever is buffered.
   *
   * `Y.mergeUpdates` is lossless — the merged payload applies to exactly the
   * same state the sequence would have — so this changes how many messages
   * carry the edits, never which edits arrive.
   */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;

    const batch: Uint8Array<ArrayBufferLike>[] = this.pending;
    this.pending = [];
    // Merging a single update is wasted work and an extra chance to be wrong.
    this.send(batch.length === 1 ? batch[0] : Y.mergeUpdates(batch));
  }
}
