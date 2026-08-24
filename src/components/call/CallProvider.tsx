import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CallContext, type CallContextValue } from '@/lib/call/call-context';
import { CallManager } from '@/lib/call/call-manager';
import { CallSession } from '@/lib/call/call-session';
import { WebSocketCallTransport } from '@/lib/call/websocket-call-transport';
import { probeMediaCapabilities, localCapabilities } from '@/lib/call/codec-support';
import type { CallState } from '@/lib/call/call-state';
import type { CaptureFailure } from '@/lib/call/media-capture';
import type { CallMediaKinds, CallSignalPayload } from '@/types/p2p-commands';
import { CALL_KIND_VIDEO } from '@/types/p2p-commands';
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
  const sessionRef = useRef<CallSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeMediaCapabilities().then((report) => {
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
    setStreamsVersion((v) => v + 1);
  }, []);

  const ensureManager = useCallback(async (): Promise<CallManager | null> => {
    if (!selfCid) return null;
    if (managerRef.current) return managerRef.current;

    const manager = new CallManager({
      transport: new WebSocketCallTransport({ selfCid, senderConfig }),
      selfCid,
      capabilities: await localCapabilities(),
      now: () => Date.now(),
      onStateChanged: (next) => {
        setCall(next);
        // Releasing the camera the moment a call reaches a terminal state, not
        // when the surface happens to unmount — the light staying on after a
        // call ends is what users notice and remember.
        if (next && (next.status === 'ended' || next.status === 'failed')) teardown();
      },
    });
    managerRef.current = manager;
    return manager;
  }, [selfCid, senderConfig, teardown]);

  const ensureSession = useCallback((): CallSession => {
    if (sessionRef.current) return sessionRef.current;
    const session = new CallSession({
      onFrame: (frame) => managerRef.current?.sendFrame(frame),
      onStreamsChanged: () => setStreamsVersion((v) => v + 1),
      onCaptureFailed: setCaptureFailure,
    });
    sessionRef.current = session;
    return session;
  }, []);

  // Inbound call control.
  useEffect(() => {
    const onSignal = ({ peerCid, payload }: { peerCid: bigint; payload: CallSignalPayload }) => {
      void (async () => {
        const manager = await ensureManager();
        // The username is resolved by the surface that renders the call; the
        // CID is what the protocol carries and what everything here keys on.
        await manager?.handleSignal(peerCid, peerCid.toString(), payload);
      })();
    };
    eventEmitter.on('call:signal', onSignal);
    return () => eventEmitter.off('call:signal', onSignal);
  }, [ensureManager]);

  // Inbound media.
  useEffect(() => {
    const onMessage = (message: Record<string, unknown>) => {
      const frame = message.MediaFrameNotification as
        | { cid: bigint; peer_cid: bigint; track: number; kind: number; timestamp: number; flags: number; payload: number[] }
        | undefined;
      if (frame) {
        sessionRef.current?.acceptFrame(BigInt(frame.peer_cid), {
          track: frame.track,
          kind: frame.kind,
          timestamp: frame.timestamp,
          flags: frame.flags,
          payload: new Uint8Array(frame.payload),
        });
        return;
      }

      const gap = message.MediaGapNotification as
        | { peer_cid: bigint; track: number }
        | undefined;
      if (gap) {
        sessionRef.current?.acceptGap(BigInt(gap.peer_cid), gap.track, gap.track !== 0);
        // A decoder past a gap emits garbage until a keyframe, so ask for one
        // rather than rendering corruption.
        for (const peer of sessionRef.current?.drainKeyframeRequests() ?? []) {
          void managerRef.current?.requestKeyframe(peer, CALL_KIND_VIDEO);
        }
      }
    };
    eventEmitter.on('websocket-message', onMessage);
    return () => eventEmitter.off('websocket-message', onMessage);
  }, []);

  // The camera must not survive the provider unmounting.
  useEffect(() => () => teardown(), [teardown]);

  const startCall = useCallback(
    async (peers: Array<{ cid: bigint; username: string }>, video: boolean, roomId?: string) => {
      setCaptureFailure(null);
      const manager = await ensureManager();
      if (!manager) return;

      const session = ensureSession();
      const got = await session.start({ audio: true, video, screen: false });
      // Capture failing means there is nothing to send, so nobody is rung — a
      // ringing phone for a call that cannot carry audio wastes their time.
      if (!got) {
        teardown();
        return;
      }

      const callId = crypto.randomUUID();
      await manager.start(callId, peers, got, roomId ?? null);
    },
    [ensureManager, ensureSession, teardown],
  );

  const accept = useCallback(
    async (media: CallMediaKinds) => {
      setCaptureFailure(null);
      const manager = managerRef.current;
      if (!manager) return;

      const session = ensureSession();
      const got = await session.start(media);
      if (!got) {
        await manager.decline('no-devices');
        teardown();
        return;
      }
      await manager.accept(got);
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
