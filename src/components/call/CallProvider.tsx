import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CallContext, type CallContextValue } from '@/lib/call/call-context';
import { CallManager } from '@/lib/call/call-manager';
import { WebSocketCallTransport } from '@/lib/call/websocket-call-transport';
import { adoptPeerCodecs, syncNegotiatedCodecs } from '@/lib/call/codec-sync';
import type { CallSession } from '@/lib/call/call-session';
import type { CallState } from '@/lib/call/call-state';
import type { CaptureFailure } from '@/lib/call/media-capture';
import type { CallMediaKinds, CallSignalPayload } from '@/types/p2p-commands';
import { useInboundMedia } from './use-inbound-media';
import type { MessageSenderConfig } from '@/lib/p2p/message-sender-types';
import { eventEmitter } from '@/lib/event-emitter';
import { debugLog } from '@/lib/debug-config';

interface CallProviderProps {
  selfCid: bigint | null;
  senderConfig: MessageSenderConfig;
  children: React.ReactNode;
}

/**
 * Owns the one call this tab can have.
 *
 * The pieces below it are already independently tested — the manager against a
 * fake transport, the session against stubbed codecs — so this deliberately
 * contains no call rules of its own. It wires, and nothing more; anything that
 * looks like a decision here belongs in one of those layers instead.
 */
export function CallProvider({ selfCid, senderConfig, children }: CallProviderProps) {
  const [call, setCall] = useState<CallState | null>(null);
  const [streamsVersion, setStreamsVersion] = useState(0);
  const [captureFailure, setCaptureFailure] = useState<CaptureFailure | null>(null);
  const [capability, setCapability] = useState<{ supported: boolean; reason?: string }>({
    supported: false,
    reason: 'Checking whether this browser supports calls…',
  });

  const managerRef = useRef<CallManager | null>(null);
  /** In-flight construction, so two callers cannot each build a manager. */
  const managerPromiseRef = useRef<Promise<CallManager> | null>(null);
  const sessionRef = useRef<CallSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Imported on demand, like the session below: the probe lives in
    // codec-support, which drags the whole codec table in with it.
    void import('@/lib/call/codec-support')
      .then((m) => m.probeMediaCapabilities())
      .then((report) => {
      if (!cancelled) setCapability({ supported: report.supported, reason: report.reason });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Torn down together: a session without its manager cannot end a call. */
  const teardown = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    managerRef.current = null;
    managerPromiseRef.current = null;
    setStreamsVersion((v) => v + 1);
  }, []);

  const ensureManager = useCallback(async (): Promise<CallManager | null> => {
    if (!selfCid) return null;
    if (managerRef.current) return managerRef.current;
    // Memoized while under construction: the async gap below used to let a
    // second caller build a SECOND manager, and whichever finished last won —
    // losing the invite the first one had already handled.
    if (managerPromiseRef.current) return managerPromiseRef.current;

    const build = (async () => {
      const { localCapabilities } = await import('@/lib/call/codec-support');
      const capabilities = await localCapabilities();
      const manager = new CallManager({
        transport: new WebSocketCallTransport({ selfCid, senderConfig }),
        selfCid,
        capabilities,
        now: () => Date.now(),
        schedule: (fn, delayMs) => {
          const id = window.setTimeout(fn, delayMs);
          return () => window.clearTimeout(id);
        },
        onStateChanged: (next) => {
          setCall(next);
          if (next) {
            // A departed participant's decoders and tracks are released the
            // moment they leave: browsers cap concurrent decoders, so leaks
            // here make later joiners fail for no visible reason.
            for (const p of next.participants.values()) {
              if (p.status === 'left' || p.status === 'declined') {
                sessionRef.current?.removePeer(p.cid);
              }
            }
          }
          // Releasing the camera the moment a call reaches a terminal state,
          // not when the surface happens to unmount — the light staying on
          // after a call ends is what users notice and remember.
          if (next && (next.status === 'ended' || next.status === 'failed')) teardown();
        },
        onKeyframeRequested: () => sessionRef.current?.requestKeyframe(),
      });
      managerRef.current = manager;
      return manager;
    })();
    managerPromiseRef.current = build;
    return build;
  }, [selfCid, senderConfig, teardown]);

  /**
   * Loaded on demand, not at import time.
   *
   * CallSession pulls in the capture pump, the WebCodecs pipeline, the codec
   * table and the receive path — none of which can possibly be needed before
   * there is a call. Imported statically it landed in the landing-page entry
   * chunk, so every visitor downloaded a video encoder before the login form
   * had painted.
   */
  const ensureSession = useCallback(async (): Promise<CallSession> => {
    if (sessionRef.current) return sessionRef.current;
    const { CallSession } = await import('@/lib/call/call-session');
    // Re-checked after the await: two callers can race this import, and the
    // second must not replace a session the first already started capturing on.
    if (sessionRef.current) return sessionRef.current;
    const session = new CallSession({
      onFrame: (frame) => managerRef.current?.sendFrame(frame),
      onStreamsChanged: () => setStreamsVersion((v) => v + 1),
      onCaptureFailed: setCaptureFailure,
      // Our decoder for this peer is stuck; ask their encoder for a keyframe.
      onNeedKeyframe: (peerCid, track) => void managerRef.current?.requestKeyframe(peerCid, track),
    });
    sessionRef.current = session;
    return session;
  }, []);

  // Inbound call control.
  useEffect(() => {
    const onSignal = ({ peerCid, payload }: { peerCid: bigint; payload: CallSignalPayload }) => {
      void (async () => {
        const manager = await ensureManager();
        if (!manager) return;
        // The username is resolved by the surface that renders the call; the
        // CID is what the protocol carries and what everything here keys on.
        await manager.handleSignal(peerCid, peerCid.toString(), payload);
        // Signals carry the codec facts; each one is followed by a sync so
        // decoders and our send codec track what peers actually advertised.
        await syncNegotiatedCodecs(manager, sessionRef.current);
      })();
    };
    eventEmitter.on('call:signal', onSignal);
    return () => eventEmitter.off('call:signal', onSignal);
  }, [ensureManager]);

  useInboundMedia(sessionRef);

  // The camera must not survive the provider unmounting — and the peer must be
  // told, or they sit in a call that is over until their ring timeout fires.
  useEffect(
    () => () => {
      const manager = managerRef.current;
      const state = manager?.getState();
      if (manager && state && state.status !== 'ended' && state.status !== 'failed') {
        void manager.end('hangup');
      }
      teardown();
    },
    [teardown],
  );

  const startCall = useCallback(
    async (peers: Array<{ cid: bigint; username: string }>, video: boolean, roomId?: string) => {
      setCaptureFailure(null);
      const manager = await ensureManager();
      if (!manager) return;

      const session = await ensureSession();
      const got = await session.start({ audio: true, video, screen: false });
      // Capture failing means there is nothing to send, so nobody is rung — a
      // ringing phone for a call that cannot carry audio wastes their time.
      if (!got) {
        teardown();
        return;
      }

      const callId = crypto.randomUUID();
      // The invite announces our provisional codec; the accept's decode list
      // may change it, in which case the signal path announces the new one.
      await manager.start(callId, peers, got, roomId ?? null, session.getCodec());
    },
    [ensureManager, ensureSession, teardown],
  );

  const accept = useCallback(
    async (media: CallMediaKinds) => {
      setCaptureFailure(null);
      const manager = managerRef.current;
      if (!manager) return;

      const session = await ensureSession();
      const got = await session.start(media);
      if (!got) {
        await manager.decline('no-devices');
        teardown();
        return;
      }
      // Negotiated BEFORE the accept goes out, so the accept carries the codec
      // we will actually send — see codec-sync for why no announcement here.
      adoptPeerCodecs(manager, session);
      await manager.accept(got, session.getCodec());
    },
    [ensureSession, teardown],
  );

  const decline = useCallback(async () => {
    await managerRef.current?.decline('rejected');
    teardown();
  }, [teardown]);

  const leave = useCallback(async () => {
    await managerRef.current?.end('hangup');
    teardown();
  }, [teardown]);

  const setMedia = useCallback(async (next: CallMediaKinds) => {
    await managerRef.current?.setSelfMedia(next);
  }, []);

  const toggleMic = useCallback(async () => {
    const current = managerRef.current?.getState()?.selfMedia;
    if (!current) return;
    const stream = sessionRef.current?.getLocalStream();
    for (const track of stream?.getAudioTracks() ?? []) track.enabled = !current.audio;
    await setMedia({ ...current, audio: !current.audio });
  }, [setMedia]);

  const toggleCamera = useCallback(async () => {
    const current = managerRef.current?.getState()?.selfMedia;
    if (!current) return;
    const stream = sessionRef.current?.getLocalStream();
    for (const track of stream?.getVideoTracks() ?? []) track.enabled = !current.video;
    await setMedia({ ...current, video: !current.video });
  }, [setMedia]);

  const value = useMemo<CallContextValue>(() => {
    debugLog('Call', 'context updated', { status: call?.status, streamsVersion });
    return {
      call,
      localStream: sessionRef.current?.getLocalStream() ?? null,
      remoteStreams: sessionRef.current?.getRemoteStreams() ?? new Map(),
      remoteAudioStreams: sessionRef.current?.getRemoteAudioStreams() ?? new Map(),
      captureFailure,
      capability,
      startCall,
      accept,
      decline,
      leave,
      toggleMic,
      toggleCamera,
    };
    // streamsVersion is a dependency on purpose: streams live on a ref, so this
    // counter is the only thing that tells React they changed.
  }, [call, streamsVersion, captureFailure, capability, startCall, accept, decline, leave, toggleMic, toggleCamera]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
