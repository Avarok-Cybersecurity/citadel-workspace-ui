/**
 * The receiving half of a call: one PeerReceiver per participant, plus the
 * bookkeeping of which codec each peer said it would send.
 *
 * Split from CallSession so the session owns capture and encoding while this
 * owns decode — the two halves share nothing but the stream-change callback.
 */

import { PeerReceiver } from './peer-receiver';
import type { WireFrame } from './frame-codec';

export interface ReceiverPoolCallbacks {
  /** Called when a peer's streams change, so the UI can re-render tiles. */
  onStreamsChanged: () => void;
  /** Called when a peer's stream can only recover via a keyframe from them. */
  onNeedKeyframe: (peerCid: bigint, track: number) => void;
  /** Our own send codec, the decode guess for peers that announced nothing. */
  fallbackCodec: () => string;
}

export class ReceiverPool {
  private readonly receivers = new Map<bigint, PeerReceiver>();
  /** What each peer told us it will SEND, so decoders match what arrives. */
  private readonly peerReceiveCodecs = new Map<bigint, string>();

  constructor(private readonly callbacks: ReceiverPoolCallbacks) {}

  videoStreams(): Map<bigint, MediaStream> {
    const streams = new Map<bigint, MediaStream>();
    for (const [cid, receiver] of this.receivers) {
      const stream = receiver.getVideoStream();
      if (stream) streams.set(cid, stream);
    }
    return streams;
  }

  audioStreams(): Map<bigint, MediaStream> {
    const streams = new Map<bigint, MediaStream>();
    for (const [cid, receiver] of this.receivers) {
      const stream = receiver.getAudioStream();
      if (stream) streams.set(cid, stream);
    }
    return streams;
  }

  /** Record what a peer will send us, rebuilding its decoder on a change. */
  setReceiveCodec(peerCid: bigint, codec: string): void {
    if (this.peerReceiveCodecs.get(peerCid) === codec) return;
    this.peerReceiveCodecs.set(peerCid, codec);
    const receiver = this.receivers.get(peerCid);
    if (receiver) {
      receiver.close();
      this.receivers.delete(peerCid);
      this.callbacks.onStreamsChanged();
    }
  }

  /** Route one received frame to the peer it came from. */
  accept(peerCid: bigint, frame: WireFrame): void {
    const receiver = this.receiverFor(peerCid);
    const hadVideo = receiver.getVideoStream() !== null;
    const hadAudio = receiver.getAudioStream() !== null;
    receiver.accept(frame);
    // Only re-render when a stream actually appears; a notify per frame would
    // re-render the whole call surface sixty times a second. Audio counts too:
    // an audio-only call's first frame is what tells the UI to attach a sink.
    const videoAppeared = !hadVideo && receiver.getVideoStream() !== null;
    const audioAppeared = !hadAudio && receiver.getAudioStream() !== null;
    if (videoAppeared || audioAppeared) {
      this.callbacks.onStreamsChanged();
    }
  }

  gap(peerCid: bigint, track: number, isVideo: boolean): void {
    this.receivers.get(peerCid)?.handleGap(track, isVideo);
  }

  /** Release one peer's decoders when they leave a group call. */
  remove(peerCid: bigint): void {
    this.peerReceiveCodecs.delete(peerCid);
    const receiver = this.receivers.get(peerCid);
    if (!receiver) return;
    receiver.close();
    this.receivers.delete(peerCid);
    this.callbacks.onStreamsChanged();
  }

  closeAll(): void {
    for (const receiver of this.receivers.values()) receiver.close();
    this.receivers.clear();
  }

  private receiverFor(peerCid: bigint): PeerReceiver {
    const existing = this.receivers.get(peerCid);
    if (existing) return existing;

    const receiver = new PeerReceiver({
      // What the PEER sends, not what we send: the two only coincide when both
      // machines happen to share a best encoder — true on one dev box, false
      // across real hardware.
      videoCodec: this.peerReceiveCodecs.get(peerCid) ?? this.callbacks.fallbackCodec(),
      onNeedKeyframe: (track) => this.callbacks.onNeedKeyframe(peerCid, track),
    });
    this.receivers.set(peerCid, receiver);
    return receiver;
  }
}
