import { useCallback, useEffect, useMemo, useState } from 'react';
import { reportCallSystemUnavailable } from './report-call-system-unavailable';
import { useCallMediaToggles } from './use-call-media-toggles';
import { CallContext, type CallContextValue } from '@/lib/call/call-context';
import type { ConnectionQuality } from './ParticipantTile';
import { adoptPeerCodecs, syncNegotiatedCodecs } from '@/lib/call/codec-sync';
import type { CallState } from '@/lib/call/call-state';
import type { CaptureFailure } from '@/lib/call/media-capture';
import { useCallRuntime } from './use-call-runtime';
import { useIsLeaderTab } from './use-leader-tab';
import type { CallMediaKinds, CallSignalPayload } from '@/types/p2p-commands';
import { useInboundMedia } from './use-inbound-media';
import type { MessageSenderConfig } from '@/lib/p2p/message-sender-types';
import { eventEmitter } from '@/lib/event-emitter';
import { callPeerName } from '@/lib/call/peer-name';
import { toast } from 'sonner';
import { useCallCapability } from './use-call-capability';
import { callBusyReason } from '@/lib/call/call-busy';
import { CAMERA_UNAVAILABLE, MIC_UNAVAILABLE, SCREEN_SHARE_STOPPED } from './media-unavailable';
import { useLiveVideoQuality } from './use-live-video-quality';
import { buildCallContext } from './build-call-context';

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
/** Same peers, same verdicts — used to avoid a re-render every poll. */
function sameQualities(
  a: Map<bigint, ConnectionQuality>,
  b: Map<bigint, ConnectionQuality>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [cid, quality] of a) {
    if (b.get(cid) !== quality) return false;
  }
  return true;
}

export function CallProvider({ selfCid, senderConfig, children }: CallProviderProps) {
  const [call, setCall] = useState<CallState | null>(null);
  const [streamsVersion, setStreamsVersion] = useState(0);
  const [qualities, setQualities] = useState<Map<bigint, ConnectionQuality>>(new Map());
  const [captureFailure, setCaptureFailure] = useState<CaptureFailure | null>(null);

  // Documented as "Shown to the user"; nothing read it. A toast rather than
  // CallStage, which is not mounted when startCall fails before a call exists.
  useEffect(() => {
    if (!captureFailure) return;
    toast.error(captureFailure.message);
  }, [captureFailure]);
  const { capability } = useCallCapability({ call, isLeaderTab: useIsLeaderTab() });

  const { managerRef, sessionRef, teardown, ensureManager, ensureSession } = useCallRuntime({
    selfCid,
    senderConfig,
    setCall,
    setStreamsVersion,
    setCaptureFailure,
  });

  // Inbound call control.
  useEffect(() => {
    const onSignal = ({ peerCid, payload }: { peerCid: bigint; payload: CallSignalPayload }): void => {
      void (async (): Promise<void> => {
        const manager = await ensureManager();
        if (!manager) return reportCallSystemUnavailable('inbound');
        // The protocol carries only a CID, and the CID is what everything here
        // keys on — but it is not a name. Resolve against the registration
        // roster so the incoming-call card and the participant tile show who is
        // calling rather than a twenty-digit number.
        await manager.handleSignal(peerCid, callPeerName(peerCid), payload);
        // Signals carry the codec facts; each one is followed by a sync so
        // decoders and our send codec track what peers actually advertised.
        await syncNegotiatedCodecs(manager, sessionRef.current);
      })();
    };
    eventEmitter.on('call:signal', onSignal);
    return (): void => eventEmitter.off('call:signal', onSignal);
  }, [ensureManager, sessionRef]);

  useInboundMedia(sessionRef);

  // The camera must not survive the provider unmounting — and the peer must be
  // told, or they sit in a call that is over until their ring timeout fires.
  useEffect(
    () => (): void => {
      const manager = managerRef.current;
      const state: CallState | null | undefined = manager?.getState();
      if (manager && state && state.status !== 'ended' && state.status !== 'failed') {
        void manager.end('hangup');
      }
      teardown();
    },
    [teardown, managerRef],
  );

  const startCall: (peers: Array<{ cid: bigint; username: string; }>, video: boolean, roomId?: string) => Promise<void> = useCallback(
    async (peers: Array<{ cid: bigint; username: string }>, video: boolean, roomId?: string) => {
      // Before capturing anything. The group entry path has refused a second
      // call since it was written; this one never did, so from any other
      // conversation during an active call both call buttons were live -- and
      // pressing one overwrote the live stream and pump without stopping
      // either, leaving the camera light on until a reload while the original
      // peer waited out their 20s silence timeout.
      // The manager's own state, not the React copy: a call that started
      // milliseconds ago has not necessarily reached this closure yet, and the
      // whole failure is a second start racing the first.
      const busy: string | null = callBusyReason(managerRef.current?.getState() ?? null);
      if (busy) {
        toast.error(busy);
        return;
      }

      setCaptureFailure(null);
      const manager = await ensureManager();
      if (!manager) return reportCallSystemUnavailable('start');

      const session = await ensureSession();
      const got: CallMediaKinds | null = await session.start({ audio: true, video, screen: false });
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
    [ensureManager, ensureSession, teardown, managerRef],
  );

  const accept: (media: CallMediaKinds) => Promise<void> = useCallback(
    async (media: CallMediaKinds) => {
      setCaptureFailure(null);
      const manager = managerRef.current;
      if (!manager) return reportCallSystemUnavailable('accept');

      const session = await ensureSession();
      const got: CallMediaKinds | null = await session.start(media);
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
    [ensureSession, teardown, managerRef],
  );

  const decline: () => Promise<void> = useCallback(async (): Promise<void> => {
    await managerRef.current?.decline('rejected');
    teardown();
  }, [teardown, managerRef]);

  const leave: () => Promise<void> = useCallback(async (): Promise<void> => {
    const manager = managerRef.current;
    if (manager) {
      await manager.end('hangup');
      teardown();
      return;
    }

    // No manager means the call already reached a terminal state and
    // use-call-runtime tore it down — which for 'failed' happens while the
    // surface is deliberately still up, so the user can read the reason. The
    // React `call` state was then never cleared by anything, so Leave awaited
    // `undefined?.end()`, did nothing, and the error panel stayed for the rest
    // of the page's life with both call buttons replaced by that dead Leave.
    // No further call to that peer was possible from that conversation.
    teardown();
    setCall(null);
  }, [teardown, managerRef, setCall]);

  const { videoQuality, setVideoQuality } = useLiveVideoQuality(sessionRef, call?.callId);

  // Each message below is a state the UI would otherwise report as a success;
  // see media-unavailable.
  const { toggleMic, toggleCamera, toggleScreenShare } = useCallMediaToggles(
    managerRef,
    sessionRef,
    () => toast.error(CAMERA_UNAVAILABLE),
    () => toast.error(MIC_UNAVAILABLE),
    (failure) => toast.error(failure.message),
    () => toast(SCREEN_SHARE_STOPPED),
  );

  useEffect(() => {
    // Polled, not event-driven: 'lost' is defined by SILENCE, so the moment a
    // link dies is a moment when nothing arrives to notify anyone. Only while a
    // call is up, and only every two seconds — this drives an icon, and the
    // thresholds are measured in whole seconds.
    if (!call) {
      setQualities((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const tick = (): void => {
      const next = sessionRef.current?.connectionQuality(Date.now()) ?? new Map();
      // Replace only on a real change, or every tick re-renders the call surface.
      setQualities((prev) => (sameQualities(prev, next) ? prev : next));
    };
    tick();
    const id: number = window.setInterval(tick, 2_000);
    return (): void => window.clearInterval(id);
  }, [call, sessionRef]);

  const value: CallContextValue = useMemo<CallContextValue>(
    () =>
      buildCallContext({
        call,
        session: sessionRef.current,
        qualities,
        captureFailure,
        capability,
        actions: { startCall, accept, decline, leave, toggleMic, toggleCamera, toggleScreenShare },
        videoQuality,
        setVideoQuality,
        annotate: ({ strokeId, point }) =>
          managerRef.current?.annotate(selfCid?.toString() ?? 'me', strokeId, point),
      }),
    // streamsVersion is a dependency ON PURPOSE, and the rule is wrong about it.
    //
    // The streams live on a ref, which the exhaustive-deps rule cannot see
    // through, so this counter is the only thing that tells React they changed.
    // Removing it -- which is what the rule asks for -- leaves every tile
    // holding the stream it had when the call started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call, streamsVersion, qualities, captureFailure, capability, startCall, accept, decline, leave,
      toggleMic, toggleCamera, toggleScreenShare, sessionRef, managerRef, selfCid, videoQuality, setVideoQuality],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
