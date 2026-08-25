/**
 * Call-signalling wire types.
 *
 * Owns the vocabulary of the CallSignal P2P command: what an invite, accept,
 * decline, end, media-state change, keyframe request and heartbeat carry on the
 * wire, plus the track/kind/flag constants shared with the Rust media
 * transport. Split out of p2p-commands.ts so the general P2P envelope module
 * does not accrete the whole calling protocol; p2p-commands re-exports
 * everything here, so import sites are unaffected.
 */

/** Which media a participant is contributing. */
export interface CallMediaKinds {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

/** What a peer can decode, so the SENDER can pick something it can play.
 *
 * Decode support is consistently broader than encode support, so negotiating on
 * the receiver's decode list is what lets each sender use its best available
 * encoder instead of collapsing everyone to a common denominator.
 */
export interface CallCodecCapabilities {
  audio: string[];
  video: Array<{ codec: string; hardware: boolean; maxHeight: number }>;
}

export type CallDeclineReason = 'busy' | 'rejected' | 'unsupported' | 'no-devices';
export type CallEndReason = 'hangup' | 'error' | 'timeout' | 'unanswered';

/** Track numbering, shared with the Rust transport's TrackId. */
export const CALL_TRACK_AUDIO = 0;
export const CALL_TRACK_VIDEO = 1;
/** Low-resolution video, sent to everyone who is not the active speaker. */
export const CALL_TRACK_VIDEO_THUMBNAIL = 2;

/** TrackKind on the wire: matches citadel_media's TrackKind discriminants. */
export const CALL_KIND_AUDIO = 0;
export const CALL_KIND_VIDEO = 1;

/** FrameFlags bits, matching citadel_media::FrameFlags. */
export const CALL_FLAG_KEYFRAME = 0b0001;
export const CALL_FLAG_DISCARDABLE = 0b0010;

export type CallSignalPayload =
  | {
      kind: 'CallInvite';
      call_id: string;
      media: CallMediaKinds;
      codecs: CallCodecCapabilities;
      /** Bumped when the frame wire format changes. A peer that does not
       * recognise it declines as 'unsupported' instead of decoding garbage. */
      media_wire_version: number;
      /** Present for a group call: everyone the caller is inviting, so each
       * participant can build the same mesh without a central authority. */
      group?: { room_id: string; members: string[] };
      /** The codec this sender will ENCODE with, so the receiver can configure
       * its decoder for what actually arrives instead of guessing from its own
       * encoder preference — which breaks the moment the two machines differ.
       * Optional for wire compatibility with peers that predate it. */
      video_send_codec?: string | null;
    }
  | { kind: 'CallAccept'; call_id: string; codecs: CallCodecCapabilities; media: CallMediaKinds; video_send_codec?: string | null }
  | { kind: 'CallDecline'; call_id: string; reason: CallDeclineReason }
  | { kind: 'CallEnd'; call_id: string; reason: CallEndReason }
  /** Mic/camera/screen toggled, so the far side can show the right tile state
   * instead of inferring it from a stream that simply stopped arriving.
   * Also carries a renegotiated send codec: the caller only learns the callee's
   * decode list from the accept, so its invite-time codec choice may change. */
  | { kind: 'CallMediaState'; call_id: string; media: CallMediaKinds; video_send_codec?: string | null }
  /** Sent after a gap: the decoder cannot recover until a keyframe arrives. */
  | { kind: 'CallKeyframeRequest'; call_id: string; track: number }
  /** Periodic "still here". Absence of media frames cannot stand in for this:
   *  a muted participant with their camera off sends nothing and is present. */
  | {
      kind: 'CallHeartbeat';
      call_id: string;
      /** How OUR stream is arriving at the sender of this heartbeat.
       *
       * Carried here rather than on its own signal because a heartbeat already
       * goes to every present peer on a timer, which is exactly the cadence
       * quality feedback wants. Optional for wire compatibility: a peer that
       * predates it simply sends none, and the sender holds its current rung. */
      link?: 'good' | 'fair' | 'poor' | 'lost';
    };

export function isCallSignalPayload(payload: unknown): payload is CallSignalPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    'call_id' in payload &&
    typeof (payload as { kind: unknown }).kind === 'string' &&
    (payload as { kind: string }).kind.startsWith('Call')
  );
}
