/**
 * A live call's moving parts: local capture, encoders, and one receiver per
 * peer. Framework-free on purpose — React owns when this exists, not how it
 * works, so the lifecycle can be reasoned about (and closed) in one place.
 */

import { captureLocalMedia, stopStream, type CaptureFailure } from './media-capture';
import { createAudioEncoder, createVideoEncoder, type AudioEncoderHandle, type VideoEncoderHandle } from './media-pipeline';
import { PeerReceiver } from './peer-receiver';
import { INITIAL_CONGESTION, applyReport, shouldDropFrame, type CongestionState, type QualityReport } from './congestion';
import { supportedVideoEncoders, negotiateGroupVideoCodec, type VideoCodec } from './codec-support';
import type { WireFrame } from './frame-codec';
import type { CallMediaKinds } from '@/types/p2p-commands';
import { debugLog } from '@/lib/debug-config';

export interface CallSessionCallbacks {
  /** Called for every encoded frame, to be fanned out to participants. */
  onFrame: (frame: WireFrame) => void;
  /** Called when a peer's streams change, so the UI can re-render tiles. */
  onStreamsChanged: () => void;
  /** Called when capture fails, with a reason the user can act on. */
  onCaptureFailed: (failure: CaptureFailure) => void;
}

export class CallSession {
  private localStream: MediaStream | null = null;
  private videoEncoder: VideoEncoderHandle | null = null;
  private audioEncoder: AudioEncoderHandle | null = null;
  private readonly receivers = new Map<bigint, PeerReceiver>();
  private congestion: CongestionState = INITIAL_CONGESTION;
  private codec: VideoCodec | null = null;
  private closed = false;

  constructor(private readonly callbacks: CallSessionCallbacks) {}

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStreams(): Map<bigint, MediaStream> {
    const streams = new Map<bigint, MediaStream>();
    for (const [cid, receiver] of this.receivers) {
      const stream = receiver.getVideoStream();
      if (stream) streams.set(cid, stream);
    }
    return streams;
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
    if (!result.ok) {
      this.callbacks.onCaptureFailed(result.failure);
      return null;
    }

    this.localStream = result.stream;
    const hasVideo = result.stream.getVideoTracks().length > 0;
    const hasAudio = result.stream.getAudioTracks().length > 0;

    if (hasVideo) {
      const encoders = await supportedVideoEncoders();
      // No peer capabilities yet at this point, so this is our own best codec;
      // a group re-negotiates once everyone has answered.
      this.codec = negotiateGroupVideoCodec(encoders, []);
    }

    return { audio: hasAudio, video: hasVideo && this.codec !== null, screen: false };
  }

  /** The codec chosen for this call, once video is running. */
  getCodec(): VideoCodec | null {
    return this.codec;
  }

  /** Feed one captured video frame into the encoder. */
  encodeVideo(frame: VideoFrame, isKeyframe: boolean): void {
    if (this.closed || !this.codec) {
      frame.close();
      return;
    }
    if (!this.videoEncoder) {
      this.videoEncoder = createVideoEncoder(
        this.codec,
        false,
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

  applyQualityReport(report: QualityReport): void {
    this.congestion = applyReport(this.congestion, report);
  }

  getCongestion(): CongestionState {
    return this.congestion;
  }

  /** Route one received frame to the peer it came from. */
  acceptFrame(peerCid: bigint, frame: WireFrame): void {
    if (this.closed) return;
    const receiver = this.receiverFor(peerCid);
    const hadStream = receiver.getVideoStream() !== null;
    receiver.accept(frame);
    // Only re-render when a stream actually appears; a notify per frame would
    // re-render the whole call surface sixty times a second.
    if (!hadStream && receiver.getVideoStream() !== null) {
      this.callbacks.onStreamsChanged();
    }
  }

  acceptGap(peerCid: bigint, track: number, isVideo: boolean): void {
    if (this.closed) return;
    this.receivers.get(peerCid)?.handleGap(track, isVideo);
  }

  /** Release one peer's decoders when they leave a group call. */
  removePeer(peerCid: bigint): void {
    const receiver = this.receivers.get(peerCid);
    if (!receiver) return;
    receiver.close();
    this.receivers.delete(peerCid);
    this.callbacks.onStreamsChanged();
  }

  private receiverFor(peerCid: bigint): PeerReceiver {
    const existing = this.receivers.get(peerCid);
    if (existing) return existing;

    const receiver = new PeerReceiver({
      videoCodec: this.codec ?? 'vp09.00.31.08',
      onNeedKeyframe: () => this.keyframeRequests.add(peerCid),
    });
    this.receivers.set(peerCid, receiver);
    return receiver;
  }

  /** Peers whose decoders are stalled waiting for a keyframe. */
  private readonly keyframeRequests = new Set<bigint>();

  drainKeyframeRequests(): bigint[] {
    const peers = [...this.keyframeRequests];
    this.keyframeRequests.clear();
    return peers;
  }

  /** Stop the camera light, release every codec, drop every track. */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.videoEncoder?.close();
    this.audioEncoder?.close();
    for (const receiver of this.receivers.values()) receiver.close();
    this.receivers.clear();
    // Last, so a failure above still turns the camera off — the one part of
    // teardown a user can physically see.
    stopStream(this.localStream);
    this.localStream = null;
  }
}
