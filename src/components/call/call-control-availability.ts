import type { CallStatus } from '@/lib/call/call-state';

/**
 * Whether the in-call media controls act on anything.
 *
 * A call that failed keeps its stage so the user can read WHY and leave — and
 * the microphone and screen-share buttons were rendered live over it. Pressing
 * screen share on a call that never started opened the browser's screen picker
 * and captured a monitor for nobody; pressing the mic announced a mute to a
 * peer that was never reached.
 *
 * One predicate for all three toggles, because "the call is live" is one fact.
 * The camera already asked it and the other two did not, which is how they
 * came apart.
 */
export interface ControlAvailability {
  usable: boolean;
  /** Present exactly when unusable: a dimmed control that says nothing is a dead end. */
  reason?: string;
}

export function mediaControlsUsable(status: CallStatus): ControlAvailability {
  if (status === 'active' || status === 'connecting') return { usable: true };
  if (status === 'failed') return { usable: false, reason: 'The call never connected' };
  if (status === 'ended') return { usable: false, reason: 'The call has ended' };
  return { usable: false, reason: 'Available once the call connects' };
}
