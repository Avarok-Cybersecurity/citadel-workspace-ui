/**
 * Routes MediaFrameNotification / MediaGapNotification from the WebSocket
 * event stream into the live call session.
 *
 * A hook rather than provider code so the provider stays pure wiring — and so
 * the frame path, which runs 30-60 times a second, is one screen of code.
 */

import { useEffect, type RefObject } from 'react';
import type { CallSession } from '@/lib/call/call-session';
import { CALL_TRACK_AUDIO } from '@/types/p2p-commands';
import { eventEmitter } from '@/lib/event-emitter';

export function useInboundMedia(sessionRef: RefObject<CallSession | null>): void {
  useEffect(() => {
    const onMessage = (message: Record<string, unknown>): void => {
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
        // The keyframe request, when video needs one, flows back through the
        // session's onNeedKeyframe callback with the affected track.
        sessionRef.current?.acceptGap(BigInt(gap.peer_cid), gap.track, gap.track !== CALL_TRACK_AUDIO);
      }
    };
    eventEmitter.on('websocket-message', onMessage);
    return (): void => eventEmitter.off('websocket-message', onMessage);
  }, [sessionRef]);
}
