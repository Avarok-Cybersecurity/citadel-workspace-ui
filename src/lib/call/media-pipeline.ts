/**
 * WebCodecs encode and decode, wired to the transport.
 *
 * The conversion rules live in frame-codec.ts; this file owns the codec objects
 * and their lifecycle, which is the part that cannot be unit tested because
 * WebCodecs has no jsdom implementation. Keeping the two apart is what makes
 * the fiddly half testable.
 */

import {
  AUDIO_BITRATE,
  AUDIO_CHANNELS,
  AUDIO_CODEC,
  AUDIO_SAMPLE_RATE,
  VIDEO_PROFILE_MAIN,
  VIDEO_PROFILE_THUMBNAIL,
  type VideoCodec,
  type VideoProfile,
} from './codec-support';
import { levelFor, type CongestionState } from './congestion';
import {
  audioChunkToFrame,
  canStartDecoding,
  frameToDecoderChunk,
  videoChunkToFrame,
  type WireFrame,
} from './frame-codec';
import { debugLog } from '@/lib/debug-config';

export type FrameSink = (frame: WireFrame) => void;

/**
 * How often to force a keyframe.
 *
 * Every four seconds bounds how long a joining or recovering participant stares
 * at nothing. Shorter wastes bandwidth on a stable link; longer makes joining a
 * call feel broken.
 */
const KEYFRAME_INTERVAL_MICROS = 4_000_000;

export interface VideoEncoderHandle {
  encode: (frame: VideoFrame, congestion: CongestionState) => void;
  requestKeyframe: () => void;
  close: () => void;
  queueSize: () => number;
}

/**
 * Encode video and hand each chunk to `sink`.
 *
 * `latencyMode: 'realtime'` is the load-bearing option: without it the encoder
 * buffers frames to improve compression, which is the right trade for a file
 * and precisely the wrong one for a conversation.
 *
 * `hardware` must be the answer the capability probe gave for THIS codec.
 * Hardcoding 'prefer-hardware' here killed every call on machines without a
 * hardware encoder (headless included): configure() errored, the codec closed,
 * and the capture pump died on the next encode — zero frames ever sent.
 */
export function createVideoEncoder(
  codec: VideoCodec,
  thumbnail: boolean,
  hardware: boolean,
  sink: FrameSink,
  onError: (error: Error) => void,
): VideoEncoderHandle {
  const profile: VideoProfile = thumbnail ? VIDEO_PROFILE_THUMBNAIL : VIDEO_PROFILE_MAIN;
  const hardwareAcceleration: HardwareAcceleration = hardware ? 'prefer-hardware' : 'no-preference';
  let lastKeyframeAt = -Infinity;
  let forceKeyframe = true;

  const encoder = new VideoEncoder({
    output: (chunk) => {
      if (chunk.type === 'key') lastKeyframeAt = chunk.timestamp;
      sink(videoChunkToFrame(chunk, thumbnail));
    },
    error: (error) => onError(error instanceof Error ? error : new Error(String(error))),
  });

  encoder.configure({
    codec,
    width: profile.width,
    height: profile.height,
    bitrate: profile.bitrate,
    framerate: profile.framerate,
    latencyMode: 'realtime',
    hardwareAcceleration,
  });

  let appliedRung = -1;

  return {
    encode(frame, congestion) {
      // Mirrors the decoder guard below: a fatal error closes the codec
      // asynchronously, and a frame can race that callback. encode() on a
      // closed codec throws, and here the throw escapes the capture pump's
      // read loop, which then exits for good — killing outbound media for the
      // rest of the call. The owner rebuilds the encoder; this just stays quiet.
      if (encoder.state === 'closed') return;
      // Reconfigure only when the rung actually changes. Reconfiguring per frame
      // resets the encoder's rate control and produces visible pulsing.
      if (congestion.rung !== appliedRung) {
        const level = levelFor(congestion);
        try {
          encoder.configure({
            codec,
            width: profile.width,
            height: level.height,
            bitrate: Math.round(profile.bitrate * level.bitrateScale),
            framerate: level.framerate,
            latencyMode: 'realtime',
            hardwareAcceleration,
          });
          appliedRung = congestion.rung;
          // A reconfigure invalidates the reference chain, so the next frame has
          // to be a keyframe or the receiver decodes garbage.
          forceKeyframe = true;
        } catch (error) {
          debugLog('Call', 'encoder reconfigure failed', error);
        }
      }

      const dueForKeyframe = frame.timestamp - lastKeyframeAt >= KEYFRAME_INTERVAL_MICROS;
      encoder.encode(frame, { keyFrame: forceKeyframe || dueForKeyframe });
      forceKeyframe = false;
    },
    requestKeyframe() {
      // Set a flag rather than encoding now: the peer asks for this after a gap,
      // and the next captured frame is the earliest one we could send anyway.
      forceKeyframe = true;
    },
    close() {
      if (encoder.state !== 'closed') encoder.close();
    },
    queueSize: () => encoder.encodeQueueSize,
  };
}

export interface AudioEncoderHandle {
  encode: (data: AudioData) => void;
  close: () => void;
}

export function createAudioEncoder(sink: FrameSink, onError: (error: Error) => void): AudioEncoderHandle {
  const encoder = new AudioEncoder({
    output: (chunk) => sink(audioChunkToFrame(chunk)),
    error: (error) => onError(error instanceof Error ? error : new Error(String(error))),
  });

  encoder.configure({
    codec: AUDIO_CODEC,
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: AUDIO_BITRATE,
  });

  return {
    encode(data) {
      // Mirrors the decoder guard below: a fatal error closes the codec
      // asynchronously, and a frame can race that callback. encode() on a
      // closed codec throws, and here the throw escapes the capture pump's
      // read loop, which then exits for good — killing outbound media for the
      // rest of the call. The owner rebuilds the encoder; this just stays quiet.
      if (encoder.state === 'closed') return;
      encoder.encode(data);
    },
    close() {
      if (encoder.state !== 'closed') encoder.close();
    },
  };
}

export interface VideoDecoderHandle {
  decode: (frame: WireFrame) => void;
  close: () => void;
  /** True once a keyframe has been seen and output is meaningful. */
  isPrimed: () => boolean;
}

/**
 * Decode video, holding back until a keyframe arrives.
 *
 * Feeding a decoder delta frames first produces a smeared, blocky picture that
 * slowly corrects itself. Showing nothing until the stream can actually be
 * decoded reads as "connecting"; showing corruption reads as "broken".
 */
export function createVideoDecoder(
  codec: string,
  onFrame: (frame: VideoFrame) => void,
  onError: (error: Error) => void,
  onNeedKeyframe: () => void,
): VideoDecoderHandle {
  let primed = false;

  const decoder = new VideoDecoder({
    output: onFrame,
    error: (error) => {
      // A decode error means the reference chain is broken; only a keyframe
      // recovers it, so ask rather than continuing to emit corruption.
      primed = false;
      onNeedKeyframe();
      onError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  decoder.configure({ codec, optimizeForLatency: true });

  return {
    decode(frame) {
      // A fatal error closes the codec asynchronously; a frame can race that
      // callback, and decode() on a closed codec throws out of the caller's
      // event handler. The owner rebuilds the decoder — this just stays quiet.
      if (decoder.state === 'closed') return;
      if (!primed) {
        if (!canStartDecoding(frame)) {
          onNeedKeyframe();
          return;
        }
        primed = true;
      }
      const init = frameToDecoderChunk(frame);
      decoder.decode(new EncodedVideoChunk(init));
    },
    close() {
      if (decoder.state !== 'closed') decoder.close();
    },
    isPrimed: () => primed,
  };
}

export interface AudioDecoderHandle {
  decode: (frame: WireFrame) => void;
  close: () => void;
}

export function createAudioDecoder(
  onData: (data: AudioData) => void,
  onError: (error: Error) => void,
): AudioDecoderHandle {
  const decoder = new AudioDecoder({
    output: onData,
    error: (error) => onError(error instanceof Error ? error : new Error(String(error))),
  });

  decoder.configure({
    codec: AUDIO_CODEC,
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
  });

  return {
    decode(frame) {
      // Same closed-codec race as the video decoder; see above.
      if (decoder.state === 'closed') return;
      decoder.decode(new EncodedAudioChunk(frameToDecoderChunk(frame)));
    },
    close() {
      if (decoder.state !== 'closed') decoder.close();
    },
  };
}
