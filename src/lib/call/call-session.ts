/**
 * A live call's moving parts: local capture, encoders, and (via ReceiverPool)
 * one receiver per peer. Framework-free on purpose — React owns when this
 * exists, not how it works, so the lifecycle can be reasoned about (and
 * closed) in one place.
 */

import { captureLocalMedia, stopStream, type CaptureFailure } from './media-capture';
import { createAudioEncoder, createVideoEncoder, type AudioEncoderHandle, type VideoEncoderHandle } from './media-pipeline';
import { ReceiverPool } from './receiver-pool';
import { INITIAL_CONGESTION, applyReport, shouldDropFrame, type CongestionState, type LinkVerdict } from './congestion';
import { supportedVideoEncoders, negotiateGroupVideoCodec, type VideoCodec } from './codec-support';
import type { WireFrame } from './frame-codec';
import type { CallMediaKinds } from '@/types/p2p-commands';
import { CapturePump } from './capture-pump';
import { debugLog } from '@/lib/debug-config';
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
}

/** Decode fallback when a peer never announced its send codec (older client). */
const LEGACY_DECODE_CODEC = 'vp09.00.31.08';

export class CallSession {
  private localStream: MediaStream | null = null;
  private videoEncoder: VideoEncoderHandle | null = null;
  private audioEncoder: AudioEncoderHandle | null = null;
  private readonly receivers: ReceiverPool;
  private congestion: CongestionState = INITIAL_CONGESTION;
  private codec: VideoCodec | null = null;
  /** Our encode capabilities, probed once at start and reused to renegotiate. */
  private encoders: Array<{ codec: VideoCodec; hardware: boolean }> = [];
  private pump: CapturePump | null = null;
  private closed = false;

  constructor(private readonly callbacks: CallSessionCallbacks) {
    this.receivers = new ReceiverPool({
      onStreamsChanged: callbacks.onStreamsChanged,
      onNeedKeyframe: callbacks.onNeedKeyframe,
      fallbackCodec: () => this.codec ?? LEGACY_DECODE_CODEC,
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

    this.localStream = result.stream;
    const hasVideo = result.stream.getVideoTracks().length > 0;
    const hasAudio = result.stream.getAudioTracks().length > 0;

    if (hasVideo) {
      this.encoders = await supportedVideoEncoders();
      if (this.closed) {
        stopStream(result.stream);
        this.localStream = null;
        return null;
      }
      // No peer capabilities yet at this point, so this is our own best codec;
      // renegotiateSendCodec revisits once peers have answered with theirs.
      this.codec = negotiateGroupVideoCodec(this.encoders, []);
    }

    // Started only after the codec is known, since encodeVideo drops frames
    // until there is one — pumping before then would discard the opening
    // second of the call.
    this.pump = new CapturePump({
      onVideoFrame: (frame, isKeyframe) => this.encodeVideo(frame, isKeyframe),
      onAudioData: (data) => this.encodeAudio(data),
    });
    this.pump.start(result.stream);

    return { audio: hasAudio, video: hasVideo && this.codec !== null, screen: false };
  }

  /** The codec chosen for this call, once video is running. */
  getCodec(): VideoCodec | null {
    return this.codec;
  }

  /**
   * Re-pick the send codec now that peers have advertised what they decode.
   *
   * Returns true when the codec changed, in which case the caller must announce
   * the new codec to peers — their decoders are configured from what we say we
   * send, and a silent switch is a permanently black tile on their side.
   */
  renegotiateSendCodec(
    peerDecoderLists: Array<Array<{ codec: string; hardware: boolean; maxHeight: number }>>,
  ): boolean {
    if (this.closed || this.encoders.length === 0 || peerDecoderLists.length === 0) return false;
    const next = negotiateGroupVideoCodec(this.encoders, peerDecoderLists);
    if (next === this.codec) return false;
    // The encoder is rebuilt lazily by the next frame; closing it here is what
    // makes that frame create one with the new codec — and it starts with a
    // keyframe, so the far side can decode from the first frame.
    this.videoEncoder?.close();
    this.videoEncoder = null;
    this.codec = next;
    return true;
  }

  /** Record what a peer will send us, rebuilding its decoder on a change. */
  setPeerReceiveCodec(peerCid: bigint, codec: string): void {
    this.receivers.setReceiveCodec(peerCid, codec);
  }

  /** Feed one captured video frame into the encoder. */
  encodeVideo(frame: VideoFrame, isKeyframe: boolean): void {
    if (this.closed || !this.codec) {
      frame.close();
      return;
    }
    if (!this.videoEncoder) {
      const chosen = this.codec;
      // The probe's verdict for THIS codec decides the acceleration mode; see
      // createVideoEncoder for why assuming hardware kills the whole call.
      const hardware = this.encoders.find((e) => e.codec === chosen)?.hardware ?? false;
      this.videoEncoder = createVideoEncoder(
        chosen,
        false,
        hardware,
        this.callbacks.onFrame,
        (error) => debugLog('Call', 'video encode error', error),
      );
    }

    // Dropped BEFORE encoding, because the cheapest frame is the one never
    // encoded — and a frame dropped here costs nothing downstream.
    if (shouldDropFrame(this.congestion, isKeyframe, this.videoEncoder.queueSize())) {
      frame.close();
      return;
    }

    this.videoEncoder.encode(frame, this.congestion);
    frame.close();
  }

  encodeAudio(data: AudioData): void {
    if (this.closed) {
      data.close();
      return;
    }
    if (!this.audioEncoder) {
      this.audioEncoder = createAudioEncoder(this.callbacks.onFrame, (error) =>
        debugLog('Call', 'audio encode error', error),
      );
    }
    this.audioEncoder.encode(data);
    data.close();
  }

  /** Force the next video frame to be a keyframe, at a peer's request. */
  requestKeyframe(): void {
    this.videoEncoder?.requestKeyframe();
  }

  /**
   * How the far side says our stream is arriving.
   *
   * Until this was called, `congestion` never left rung 0 — so the encoder was
   * configured once at full quality and never reconfigured, and four of the
   * five ladder rungs were unreachable. The adaptation existed and never ran.
   */
  applyQualityReport(verdict: LinkVerdict): void {
    this.congestion = applyReport(this.congestion, verdict);
  }

  getCongestion(): CongestionState {
    return this.congestion;
  }

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

  /** Stop the camera light, release every codec, drop every track. */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    // Stopped FIRST: a frame arriving from the pump after the encoders close
    // would be handed to a closed codec.
    this.pump?.stop();
    this.pump = null;
    this.videoEncoder?.close();
    this.audioEncoder?.close();
    this.receivers.closeAll();
    // Last, so a failure above still turns the camera off — the one part of
    // teardown a user can physically see.
    stopStream(this.localStream);
    this.localStream = null;
  }
}
