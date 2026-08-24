/**
 * The narrow face of CallManager that its extracted collaborators operate on.
 *
 * Signal handling and media-session lifecycle live in their own modules purely
 * for size and testability; this interface is what keeps them honest — they
 * see exactly the state and effects they need, not the whole manager.
 */

import type { CallCodecCapabilities } from '@/types/p2p-commands';
import type { CallEvent, CallState } from './call-state';
import type { CallTransport } from './call-transport';
import type { PeerCodecBook } from './peer-codec-book';

export interface CallManagerInternals {
  readonly transport: CallTransport;
  readonly capabilities: CallCodecCapabilities;
  readonly codecs: PeerCodecBook;
  /** Peers with an open media session, so close is exact. */
  readonly openSessions: Set<bigint>;
  getState(): CallState | null;
  apply(event: CallEvent): void;
  /** A peer's decoder is stuck and needs our encoder to produce a keyframe. */
  keyframeRequested(track: number): void;
}
