/**
 * The peers present in a document: each one's latest awareness record, its rectangles on this
 * replica's pages, and when it was last heard. Keyed by the replica (`PeerView.client`), not by
 * session: two tabs of one account are two carets.
 *
 * The rectangles are this replica's, so they go stale whenever this replica repaints; `remap`
 * re-derives every one from its record (PeerOverlay's rule: after every `pages` event).
 */
import type { PeerView } from '../editor/controller';
import type { PeerPresence } from '../editor/peer-overlay';
import type { PeerIdentity } from './ports';

interface HeardPeer {
  readonly fromCid: bigint;
  readonly record: Uint8Array;
  view: PeerView;
  readonly heardAt: number;
}

export class PeerBook {
  private readonly peers: Map<bigint, HeardPeer> = new Map<bigint, HeardPeer>();

  constructor(private readonly identify: PeerIdentity, private readonly expiryMs: number) {}

  hear(fromCid: bigint, record: Uint8Array, view: PeerView, now: number): void {
    this.peers.set(view.client, { fromCid, record, view, heardAt: now });
  }

  async remap(viewOf: (record: Uint8Array) => Promise<PeerView>): Promise<void> {
    for (const peer of [...this.peers.values()]) peer.view = await viewOf(peer.record);
  }

  /** Forgets peers not heard from within `expiryMs`; true when any was forgotten. */
  expire(now: number): boolean {
    let forgot: boolean = false;
    for (const [client, peer] of this.peers) {
      if (now - peer.heardAt >= this.expiryMs) {
        this.peers.delete(client);
        forgot = true;
      }
    }
    return forgot;
  }

  presences(): PeerPresence[] {
    return [...this.peers.values()].map((peer: HeardPeer): PeerPresence => {
      const who: ReturnType<PeerIdentity> = this.identify(peer.fromCid);
      return { name: who.name, color: who.color, view: peer.view };
    });
  }

  get size(): number {
    return this.peers.size;
  }
}
