/**
 * A live call's moving parts: local capture, encoders, and (via ReceiverPool)
 * one receiver per peer. Framework-free on purpose — React owns when this
 * exists, not how it works, so the lifecycle can be reasoned about (and
 * closed) in one place.
 */

import { stopStream, type CaptureFailure } from './media-capture';
import { ReceiverPool } from './receiver-pool';
import type { CongestionState, LinkVerdict } from './congestion';
import { SendEncoder } from './send-encoder';
import { type VideoCodec } from './codec-support';
import { negotiateGroupVideoCodec } from './codec-negotiation';
import type { WireFrame } from './frame-codec';
import type { CallMediaKinds } from '@/types/p2p-commands';
import { CapturePump } from './capture-pump';
import { ScreenShare } from './screen-share';
import type { VideoQuality } from './video-quality';
import { startLocalCapture } from './session-start';
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
  /** This tab's outgoing share; see lib/call/screen-share. */
  private readonly screen: ScreenShare = new ScreenShare(
    (frame) => this.encodeScreen(frame, false),
    () => this.sender.closeScreen(),
  );
  private closed: boolean = false;
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

  getLocalStream(): MediaStream | null { return this.localStream; }
  getRemoteStreams(): Map<bigint, MediaStream> { return this.receivers.videoStreams(); }
  /** Every peer currently sharing a screen, by CID. */
  getRemoteScreenStreams(): Map<bigint, MediaStream> { return this.receivers.screenStreams(); }
  /** Remote audio, which the UI must attach to an element or nobody hears it. */
  getRemoteAudioStreams(): Map<bigint, MediaStream> { return this.receivers.audioStreams(); }

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
    const attempt: Promise<CallMediaKinds | null> = this.startOnce(requested);
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
    return startLocalCapture(requested, {
      isClosed: () => this.closed,
      onCaptureFailed: (failure) => this.callbacks.onCaptureFailed(failure),
      adoptStream: (stream) => {
        this.localStream = stream;
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', () => this.handleTrackEnded(track));
        }
      },
      dropStream: () => { this.localStream = null; },
      configureSender: (encoders) => this.sender.configure(encoders, negotiateGroupVideoCodec(encoders, [])),
      hasCodec: () => this.sender.getCodec() !== null,
      startPump: (stream) => {
        this.pump = new CapturePump({
          onVideoFrame: (frame, isKeyframe): void => this.encodeVideo(frame, isKeyframe),
          onAudioData: (data): void => this.encodeAudio(data),
        });
        this.pump.start(stream);
      },
    });
  }

  /** The codec chosen for this call, once video is running. */
  getCodec(): VideoCodec | null { return this.sender.getCodec(); }
  /** The quality ceiling this person chose; see lib/call/video-quality. */
  setVideoQuality(quality: VideoQuality): void { this.sender.setQuality(quality); }
  getVideoQuality(): VideoQuality { return this.sender.getQuality(); }

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

  /** Sharing this tab's screen; the lifecycle lives in ScreenShare. */
  startScreen(stream: MediaStream, onEnded: () => void): boolean {
    return this.closed ? false : this.screen.start(stream, onEnded);
  }

  getScreenStream(): MediaStream | null { return this.screen.getStream(); }
  stopScreen(): void { this.screen.stop(); }

  /** A closed session still has to close the frame, or the buffer leaks. */
  encodeScreen(frame: VideoFrame, isKeyframe: boolean): void {
    if (this.closed) {
      frame.close();
      return;
    }
    this.sender.encodeScreen(frame, isKeyframe);
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
    // The screen too, and before `sender.close()` for the same reason. This
    // also stops the track, which is what takes the browser's "sharing" bar
    // down when a call ends while somebody is still sharing.
    this.stopScreen();
    this.sender.close();
    this.receivers.closeAll();
    // Last, so a failure above still turns the camera off — the one part of
    // teardown a user can physically see.
    stopStream(this.localStream);
    this.localStream = null;
  }
}
