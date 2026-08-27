/**
 * Everything needed to play one remote participant: decoders, sinks, and the
 * keyframe bookkeeping that decides when to ask for a fresh picture.
 *
 * One of these per peer. Kept separate from the provider so that closing a
 * participant is a single call — a call that leaks a decoder per peer per
 * reconnect will exhaust the browser's codec slots and start failing calls that
 * have nothing wrong with them.
 */

import { createAudioDecoder, createVideoDecoder, type AudioDecoderHandle, type VideoDecoderHandle } from './media-decoders';
import { createRemoteAudioSink, createRemoteVideoSink, type RemoteAudioSink, type RemoteVideoSink } from './remote-stream';
import { isVideoFrame, type WireFrame } from './frame-codec';
import { debugLog } from '@/lib/debug-config';

export interface PeerReceiverOptions {
  videoCodec: string;
  /** Called when only a keyframe can recover the stream. */
  onNeedKeyframe: (track: number) => void;
}

export class PeerReceiver {
  private video: VideoDecoderHandle | null = null;
  private audio: AudioDecoderHandle | null = null;
  private videoSink: RemoteVideoSink | null = null;
  private audioSink: RemoteAudioSink | null = null;
  private closed = false;

  constructor(private readonly options: PeerReceiverOptions) {}

  /**
   * The stream to hand a <video> element, or null until video arrives.
   *
   * Built lazily on the first video frame rather than up front: a peer who
   * never turns their camera on should not cost a decoder and a track.
   */
  getVideoStream(): MediaStream | null {
    return this.videoSink?.stream ?? null;
  }

  getAudioStream(): MediaStream | null {
    return this.audioSink?.stream ?? null;
  }

  accept(frame: WireFrame): void {
    if (this.closed) return;
    if (isVideoFrame(frame)) {
      this.acceptVideo(frame);
    } else {
      this.acceptAudio(frame);
    }
  }

  /**
   * A gap was reported by the transport.
   *
   * Video needs a keyframe to recover; audio does not, because Opus frames
   * decode independently and the missing ones are simply gone.
   */
  handleGap(track: number, isVideo: boolean): void {
    if (isVideo) this.options.onNeedKeyframe(track);
  }

  private acceptVideo(frame: WireFrame): void {
    if (!this.videoSink) this.videoSink = createRemoteVideoSink();
    if (!this.video) {
      this.video = createVideoDecoder(
        this.options.videoCodec,
        (decoded) => this.videoSink?.write(decoded),
        (error) => {
          debugLog('Call', 'video decode error', error);
          // A fatal WebCodecs error leaves the decoder closed; every later
          // decode() would throw. Dropping the handle makes the next frame
          // build a fresh decoder, which then waits for a keyframe. The sink
          // is kept: the <video> element holds its stream, so recovery is a
          // brief freeze rather than a tile that goes away and comes back.
          this.video = null;
        },
        () => this.options.onNeedKeyframe(frame.track),
      );
    }
    this.video.decode(frame);
  }

  private acceptAudio(frame: WireFrame): void {
    if (!this.audioSink) this.audioSink = createRemoteAudioSink();
    if (!this.audio) {
      this.audio = createAudioDecoder(
        (data) => this.audioSink?.write(data),
        (error) => {
          debugLog('Call', 'audio decode error', error);
          // Same recovery as video; Opus frames decode independently, so the
          // rebuilt decoder resumes on the very next frame.
          this.audio = null;
        },
      );
    }
    this.audio.decode(frame);
  }

  /** Release every codec and track. Safe to call more than once. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.video?.close();
    this.audio?.close();
    this.videoSink?.close();
    this.audioSink?.close();
    this.video = null;
    this.audio = null;
    this.videoSink = null;
    this.audioSink = null;
  }
}
