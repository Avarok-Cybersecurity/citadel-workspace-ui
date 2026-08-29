/**
 * Decoder halves of the media pipeline. Split from media-pipeline so each side
 * stays under the file cap; the encoder half lives there.
 */
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
import { AUDIO_CODEC, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from './codec-support';
import { canStartDecoding, frameToDecoderChunk, type WireFrame } from './frame-codec';
import type { DecoderChunkInit } from '@/lib/call/frame-codec';

export function createVideoDecoder(
  codec: string,
  onFrame: (frame: VideoFrame) => void,
  onError: (error: Error) => void,
  onNeedKeyframe: () => void,
): VideoDecoderHandle {
  let primed: boolean = false;

  const decoder: VideoDecoder = new VideoDecoder({
    output: onFrame,
    error: (error): void => {
      // A decode error means the reference chain is broken; only a keyframe
      // recovers it, so ask rather than continuing to emit corruption.
      primed = false;
      onNeedKeyframe();
      onError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  decoder.configure({ codec, optimizeForLatency: true });

  return {
    decode(frame: WireFrame): void {
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
      const init: DecoderChunkInit = frameToDecoderChunk(frame);
      decoder.decode(new EncodedVideoChunk(init));
    },
    close(): void {
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
  const decoder: AudioDecoder = new AudioDecoder({
    output: onData,
    error: (error): void => onError(error instanceof Error ? error : new Error(String(error))),
  });

  decoder.configure({
    codec: AUDIO_CODEC,
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
  });

  return {
    decode(frame: WireFrame): void {
      // Same closed-codec race as the video decoder; see above.
      if (decoder.state === 'closed') return;
      decoder.decode(new EncodedAudioChunk(frameToDecoderChunk(frame)));
    },
    close(): void {
      if (decoder.state !== 'closed') decoder.close();
    },
  };
}
