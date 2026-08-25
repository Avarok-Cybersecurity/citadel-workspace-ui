/**
 * Lazy construction and teardown of the call runtime — the CallManager /
 * CallSession pair.
 *
 * Owns the race-safety rules (memoised in-flight construction, re-check after
 * awaited imports) and the on-demand imports that keep the codec table and
 * WebCodecs pipeline out of the entry chunk. Split from CallProvider.tsx so
 * the provider exposes call actions while the how-the-machinery-comes-to-exist
 * story lives here.
 */

import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { callPeerName } from '@/lib/call/peer-name';
import { CallManager } from '@/lib/call/call-manager';
import { WebSocketCallTransport } from '@/lib/call/websocket-call-transport';
import type { CallSession } from '@/lib/call/call-session';
import type { CallState } from '@/lib/call/call-state';
import type { CaptureFailure } from '@/lib/call/media-capture';
import type { MessageSenderConfig } from '@/lib/p2p/message-sender-types';

interface UseCallRuntimeParams {
  selfCid: bigint | null;
  senderConfig: MessageSenderConfig;
  setCall: Dispatch<SetStateAction<CallState | null>>;
  setStreamsVersion: Dispatch<SetStateAction<number>>;
  setCaptureFailure: Dispatch<SetStateAction<CaptureFailure | null>>;
}

export function useCallRuntime({
  selfCid,
  senderConfig,
  setCall,
  setStreamsVersion,
  setCaptureFailure,
}: UseCallRuntimeParams) {
  const managerRef = useRef<CallManager | null>(null);
  /** In-flight construction, so two callers cannot each build a manager. */
  const managerPromiseRef = useRef<Promise<CallManager> | null>(null);
  const sessionRef = useRef<CallSession | null>(null);

  /** Torn down together: a session without its manager cannot end a call. */
  const teardown = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    managerRef.current = null;
    managerPromiseRef.current = null;
    setStreamsVersion((v) => v + 1);
  }, [setStreamsVersion]);

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
        resolvePeerName: callPeerName,
      onKeyframeRequested: () => sessionRef.current?.requestKeyframe(),
      });
      managerRef.current = manager;
      return manager;
    })();
    managerPromiseRef.current = build;
    return build;
  }, [selfCid, senderConfig, teardown, setCall]);

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
  }, [setStreamsVersion, setCaptureFailure]);

  return { managerRef, sessionRef, teardown, ensureManager, ensureSession };
}
