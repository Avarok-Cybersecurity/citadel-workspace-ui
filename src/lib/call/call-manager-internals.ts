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

/** Everything a caller must supply to construct a CallManager. */
export interface CallManagerOptions {
  transport: CallTransport;
  selfCid: bigint;
  capabilities: CallCodecCapabilities;
  /** Injected so tests are not at the mercy of a real clock. */
  now: () => number;
  /** Injected timer (returns a cancel), same reasoning as `now`. */
  schedule: (fn: () => void, delayMs: number) => () => void;
  onStateChanged: (state: CallState | null) => void;
  /** A peer's decoder is stuck and needs our encoder to produce a keyframe. */
  onKeyframeRequested: (track: number) => void;
  /** Names a peer the wire identified only by CID. Injected like `now`: the
   *  roster lives outside this layer, and tests need one they control. */
  resolvePeerName: (cid: bigint) => string;
}

export interface CallManagerInternals {
  readonly transport: CallTransport;
  /** Group invites carry the full roster, which includes us; this is how the
   *  signal handler knows which entry not to treat as a peer. */
  readonly selfCid: bigint;
  readonly capabilities: CallCodecCapabilities;
  readonly codecs: PeerCodecBook;
  /** Peers with an open media session, so close is exact. */
  readonly openSessions: Set<bigint>;
  getState(): CallState | null;
  apply(event: CallEvent): void;
  /** A peer's decoder is stuck and needs our encoder to produce a keyframe. */
  keyframeRequested(track: number): void;
  /** An inbound signal for the current call arrived from this peer. */
  peerSeen(cid: bigint): void;
  /** Names a peer the wire identified only by CID. See CallManagerOptions. */
  resolvePeerName(cid: bigint): string;
}
