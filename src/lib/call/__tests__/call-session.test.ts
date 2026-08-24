/**
 * The session owns every physical resource a call holds: the camera, the
 * encoders, one decoder set per peer. Getting teardown wrong leaves the camera
 * light on after a call ends, which is the single most alarming bug a calling
 * feature can ship.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallSession } from '../call-session';

const stopped: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
const codecInstances: Array<{ close: ReturnType<typeof vi.fn> }> = [];

function stubCodecClass() {
  return class {
    state = 'configured';
    encodeQueueSize = 0;
    encode = vi.fn();
    decode = vi.fn();
    configure = vi.fn();
    close = vi.fn(() => { this.state = 'closed'; });
    constructor() { codecInstances.push(this as unknown as { close: ReturnType<typeof vi.fn> }); }
    static isConfigSupported = async () => ({ supported: true });
  };
}

function fakeStream(withVideo: boolean) {
  const tracks = withVideo
    ? [{ kind: 'video', stop: vi.fn() }, { kind: 'audio', stop: vi.fn() }]
    : [{ kind: 'audio', stop: vi.fn() }];
  stopped.push(...tracks);
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  } as unknown as MediaStream;
}

function callbacks() {
  return { onFrame: vi.fn(), onStreamsChanged: vi.fn(), onCaptureFailed: vi.fn() };
}

beforeEach(() => {
  stopped.length = 0;
  codecInstances.length = 0;
  vi.stubGlobal('VideoEncoder', stubCodecClass());
  vi.stubGlobal('AudioEncoder', stubCodecClass());
  vi.stubGlobal('VideoDecoder', stubCodecClass());
  vi.stubGlobal('AudioDecoder', stubCodecClass());
  vi.stubGlobal('EncodedVideoChunk', class { constructor(public init: unknown) {} });
  vi.stubGlobal('EncodedAudioChunk', class { constructor(public init: unknown) {} });
  vi.stubGlobal(
    'MediaStreamTrackGenerator',
    class {
      writable = { getWriter: () => ({ write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }) };
      stop = vi.fn();
      constructor(public init: { kind: string }) {}
    },
  );
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[] = []) {} getTracks() { return this.tracks; } });
  // The efficient capture path. Without it the session falls back to the canvas
  // pump, which needs a real <video> element and an animation frame loop.
  vi.stubGlobal(
    'MediaStreamTrackProcessor',
    class {
      readable = { getReader: () => ({ read: () => new Promise(() => {}), cancel: vi.fn().mockResolvedValue(undefined) }) };
      constructor(public init: { track: unknown }) {}
    },
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream(true)) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('starting a call', () => {
  it('reports the media it actually got, not what was asked for', async () => {
    // A blocked camera falls back to audio, and the caller must tell peers the
    // truth about what it will send — otherwise their tiles wait forever for
    // video that is never coming.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream(false)) },
      configurable: true,
    });
    const session = new CallSession(callbacks());

    const got = await session.start({ audio: true, video: true, screen: false });

    expect(got).toEqual({ audio: true, video: false, screen: false });
  });

  it('surfaces a capture failure with its reason instead of returning silently', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('no', 'NotFoundError')) },
      configurable: true,
    });
    const cbs = callbacks();
    const session = new CallSession(cbs);

    const got = await session.start({ audio: true, video: false, screen: false });

    expect(got).toBeNull();
    expect(cbs.onCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'no-device' }));
  });
});

describe('teardown', () => {
  it('stops every local track, so the camera light goes out', async () => {
    const session = new CallSession(callbacks());
    await session.start({ audio: true, video: true, screen: false });

    session.close();

    expect(stopped.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(session.getLocalStream()).toBeNull();
  });

  it('closes every codec it opened', async () => {
    const session = new CallSession(callbacks());
    await session.start({ audio: true, video: true, screen: false });
    session.acceptFrame(2n, { track: 1, kind: 1, timestamp: 0, flags: 1, payload: new Uint8Array([1]) });

    session.close();

    expect(codecInstances.length).toBeGreaterThan(0);
    expect(codecInstances.every((c) => c.close.mock.calls.length === 1)).toBe(true);
  });

  it('is safe to close twice', async () => {
    const session = new CallSession(callbacks());
    await session.start({ audio: true, video: true, screen: false });

    session.close();
    session.close();

    expect(stopped.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
  });

  it('ignores frames arriving after close', async () => {
    const cbs = callbacks();
    const session = new CallSession(cbs);
    await session.start({ audio: true, video: true, screen: false });
    session.close();
    cbs.onStreamsChanged.mockClear();

    session.acceptFrame(2n, { track: 1, kind: 1, timestamp: 0, flags: 1, payload: new Uint8Array([1]) });

    expect(cbs.onStreamsChanged).not.toHaveBeenCalled();
  });
});

describe('peers', () => {
  it('notifies once when a peer’s stream appears, not per frame', async () => {
    // A notify per frame would re-render the whole call surface sixty times a
    // second.
    const cbs = callbacks();
    const session = new CallSession(cbs);
    await session.start({ audio: true, video: true, screen: false });

    const frame = { track: 1, kind: 1, timestamp: 0, flags: 1, payload: new Uint8Array([1]) };
    session.acceptFrame(2n, frame);
    session.acceptFrame(2n, frame);
    session.acceptFrame(2n, frame);

    expect(cbs.onStreamsChanged).toHaveBeenCalledTimes(1);
  });

  it('releases a peer’s decoders when they leave', async () => {
    const session = new CallSession(callbacks());
    await session.start({ audio: true, video: true, screen: false });
    session.acceptFrame(2n, { track: 1, kind: 1, timestamp: 0, flags: 1, payload: new Uint8Array([1]) });
    const opened = codecInstances.length;

    session.removePeer(2n);

    expect(codecInstances.some((c) => c.close.mock.calls.length === 1)).toBe(true);
    expect(opened).toBeGreaterThan(0);
  });

  it('drains keyframe requests exactly once', async () => {
    // A stuck request would force keyframes forever and destroy the bitrate.
    const session = new CallSession(callbacks());
    await session.start({ audio: true, video: true, screen: false });

    expect(session.drainKeyframeRequests()).toEqual([]);
  });
});
