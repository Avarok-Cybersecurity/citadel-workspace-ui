import type { CallSignalPayload } from '@/types/p2p-commands';
import type { CallState } from './call-state';

/** Just enough of the transport to send one signal. */
interface SignalSink {
  sendSignal: (cid: bigint, signal: CallSignalPayload) => Promise<unknown>;
}

/**
 * Send one drawn point to everyone in the call.
 *
 * Fire and forget, deliberately: a point is worth a few bytes and lives five
 * seconds, so a lost one is a slightly shorter line and a retried one is a line
 * drawn late. Awaiting each point would put a network round trip between a
 * finger and the mark under it, which is the one thing a pointer cannot have.
 */
export function sendAnnotation(
  transport: SignalSink,
  state: CallState,
  author: string,
  strokeId: string,
  point: { x: number; y: number },
): void {
  const signal: CallSignalPayload = {
    kind: 'CallAnnotate',
    call_id: state.callId,
    stroke_id: strokeId,
    author,
    x: point.x,
    y: point.y,
  };
  for (const cid of state.participants.keys()) {
    void transport.sendSignal(cid, signal).catch(() => undefined);
  }
}
