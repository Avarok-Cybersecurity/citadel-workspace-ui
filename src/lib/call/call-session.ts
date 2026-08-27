/**
 * A live call's moving parts: local capture, encoders, and (via ReceiverPool)
 * one receiver per peer. Framework-free on purpose — React owns when this
 * exists, not how it works, so the lifecycle can be reasoned about (and
 * closed) in one place.
 */

import { captureLocalMedia, stopStream, type CaptureFailure } from './media-capture';
import { ReceiverPool } from './receiver-pool';
import type { CongestionState, LinkVerdict } from './congestion';
import { SendEncoder } from './send-encoder';
import { supportedVideoEncoders, type VideoCodec } from './codec-support';
import { negotiateGroupVideoCodec } from './codec-negotiation';
import type { WireFrame } from './frame-codec';
import type { CallMediaKinds } from '@/types/p2p-commands';
import { CapturePump } from './capture-pump';
import type { ConnectionQuality } from '@/components/call/ParticipantTile';

export interface CallSessionCallbacks {
  /** Called for every encoded frame, to be fanned out to participants. */
  onFrame: (frame: WireFrame) => void;
  /** Called when a peer's streams change, so the UI can re-render tiles. */
  onStreamsChanged: () => void;
  /** Called when capture fails, with a reason the user can act on. */
  onCaptureFailed: (failure: CaptureFailure) => void;
  /** Called when a peer's stream can only recover via a keyframe from them. */
  onNeedKeyframe: (peerCid: bigint, track: number) => void;
  /**
   * A live capture device stopped mid-call — unplugged, or revoked by the OS.
   *
   * Nothing used to listen for this. The track ended, the pump's reader loop
   * returned silently, and every part of the UI went on insisting the call was
   * healthy: the mic button still read unmuted, peers still saw an unmuted
   * tile, and heartbeats kept flowing so the liveness watchdog never noticed. A
   * silently dead call that looked fine, with no recovery but Leave and re-dial
   * and nothing saying so.
   */
  onTrackEnded: (kind: 'audio' | 'video') => void;
}

/** Decode fallback when a peer never announced its send codec (older client). */
const LEGACY_DECODE_CODEC = 'vp09.00.31.08';

export class CallSession {
  private localStream: MediaStream | null = null;
  private readonly receivers: ReceiverPool;
  private readonly sender: SendEncoder;
  private pump: CapturePump | null = null;
  private closed = false;
  /** In-flight `start()`, so a second press cannot capture a second stream. */
  private starting: Promise<CallMediaKinds | null> | null = null;

  constructor(private readonly callbacks: CallSessionCallbacks) {
    this.sender = new SendEncoder(callbacks.onFrame);
    this.receivers = new ReceiverPool({
      onStreamsChanged: callbacks.onStreamsChanged,
      onNeedKeyframe: callbacks.onNeedKeyframe,
      fallbackCodec: () => this.sender.getCodec() ?? LEGACY_DECODE_CODEC,
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStreams(): Map<bigint, MediaStream> {
    return this.receivers.videoStreams();
  }

  /** Remote audio, which the UI must attach to an element or nobody hears it. */
  getRemoteAudioStreams(): Map<bigint, MediaStream> {
    return this.receivers.audioStreams();
  }

  /**
   * Acquire the microphone and camera and start encoding.
   *
   * Returns the media actually obtained, which may be less than requested — a
   * blocked camera falls back to audio, and the caller needs to know so it can
   * tell peers the truth about what it will send.
   */
  async start(requested: CallMediaKinds): Promise<CallMediaKinds | null> {
    // Only one capture may be in flight.
    //
    // `closed` was the sole guard, and it does not cover a SECOND call arriving
    // while the first is still awaiting the permission prompt. Both entries then
    // assigned `this.localStream` and `this.pump`, so the first stream and pump
    // were overwritten with nothing left holding a reference — never stopped,
    // camera light on until the page reloads. Reachable by double-clicking Call
    // (the buttons are not disabled until `invite-sent`, which happens after
    // capture) or Accept on an incoming call.
    if (this.starting) return this.starting;
    const attempt = this.startOnce(requested);
    this.starting = attempt;
    try {
      return await attempt;
    } finally {
      // Cleared so a later start — after a failed capture the user retried, or
      // a second call on a reused session — is a real attempt, not a replay of
      // this one's answer.
      if (this.starting === attempt) this.starting = null;
    }
  }

  private async startOnce(requested: CallMediaKinds): Promise<CallMediaKinds | null> {
    const result = await captureLocalMedia({ audio: requested.audio, video: requested.video });
    // The permission prompt can outlive the call: if close() ran while the user
    // stared at it, adopting the stream now would leave the camera light on
    // with nothing attached to it until the page reloads.
    if (this.closed) {
      if (result.ok) stopStream(result.stream);
      return null;
    }
    if (!result.ok) {
      this.callbacks.onCaptureFailed(result.failure);
      return null;
    }

    // Video was requested and we fell back to audio. `ok` is true and the call
    // proceeds, but the user asked for their camera and did not get it — tell
    // them, through the same channel a hard failure uses.
    if (result.degraded) this.callbacks.onCaptureFailed(result.degraded);

    this.localStream = result.stream;
    for (const track of result.stream.getTracks()) {
      track.addEventListener('ended', () => this.handleTrackEnded(track));
    }
    const hasVideo = result.stream.getVideoTracks().length > 0;
    const hasAudio = result.stream.getAudioTracks().length > 0;

    if (hasVideo) {
      const encoders = await supportedVideoEncoders();
      if (this.closed) {
        stopStream(result.stream);
        this.localStream = null;
        return null;
      }
      // No peer capabilities yet at this point, so this is our own best codec;
      // renegotiateSendCodec revisits once peers have answered with theirs.
      this.sender.configure(encoders, negotiateGroupVideoCodec(encoders, []));
    }

    // Started only after the codec is known, since encodeVideo drops frames
    // until there is one — pumping before then would discard the opening
    // second of the call.
    this.pump = new CapturePump({
      onVideoFrame: (frame, isKeyframe) => this.encodeVideo(frame, isKeyframe),
      onAudioData: (data) => this.encodeAudio(data),
    });
    this.pump.start(result.stream);

    return { audio: hasAudio, video: hasVideo && this.sender.getCodec() !== null, screen: false };
  }

  /** The codec chosen for this call, once video is running. */
  getCodec(): VideoCodec | null { return this.sender.getCodec(); }

  /** See SendEncoder.renegotiate — true means the caller must announce the change. */
  renegotiateSendCodec(
    peerDecoderLists: Array<Array<{ codec: string; hardware: boolean; maxHeight: number }>>,
  ): boolean {
    if (this.closed) return false;
    return this.sender.renegotiate(peerDecoderLists);
  }

  /** Record what a peer will send us, rebuilding its decoder on a change. */
  setPeerReceiveCodec(peerCid: bigint, codec: string): void { this.receivers.setReceiveCodec(peerCid, codec); }

  /** Feed one captured video frame into the encoder. */
  encodeVideo(frame: VideoFrame, isKeyframe: boolean): void {
    if (this.closed) {
      frame.close();
      return;
    }
    this.sender.encodeVideo(frame, isKeyframe);
  }

  encodeAudio(data: AudioData): void {
    if (this.closed) {
      data.close();
      return;
    }
    this.sender.encodeAudio(data);
  }

  /** Force the next video frame to be a keyframe, at a peer's request. */
  requestKeyframe(): void { this.sender.requestKeyframe(); }

  applyQualityReport(verdict: LinkVerdict): void { this.sender.applyQualityReport(verdict); }

  getCongestion(): CongestionState { return this.sender.getCongestion(); }

  /** Route one received frame to the peer it came from. */
  acceptFrame(peerCid: bigint, frame: WireFrame): void {
    if (this.closed) return;
    this.receivers.accept(peerCid, frame);
  }

  acceptGap(peerCid: bigint, track: number, isVideo: boolean): void {
    if (this.closed) return;
    this.receivers.gap(peerCid, track, isVideo);
  }

  /** How each peer's link is doing, for the tiles to show. */
  connectionQuality(now: number): Map<bigint, ConnectionQuality> {
    return this.receivers.connectionQuality(now);
  }

  /** Release one peer's decoders when they leave a group call. */
  removePeer(peerCid: bigint): void {
    this.receivers.remove(peerCid);
  }

  /**
   * A capture track stopped on its own.
   *
   * The `closed` guard is first and is load-bearing. Per spec `track.stop()`
   * does not fire `ended`, so ordinary teardown should be silent — but test
   * fakes do fire it, and every termination path runs through `close()`, which
   * sets `closed` BEFORE stopping the stream. Without this check, every normal
   * hangup would tell the user their microphone had been disconnected.
   */
  private handleTrackEnded(track: MediaStreamTrack): void {
    if (this.closed) return;
    this.callbacks.onTrackEnded(track.kind === 'video' ? 'video' : 'audio');
  }

  /** Stop the camera light, release every codec, drop every track. */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    // Stopped FIRST: a frame arriving from the pump after the encoders close
    // would be handed to a closed codec.
    this.pump?.stop();
    this.pump = null;
    this.sender.close();
    this.receivers.closeAll();
    // Last, so a failure above still turns the camera off — the one part of
    // teardown a user can physically see.
    stopStream(this.localStream);
    this.localStream = null;
  }
}
