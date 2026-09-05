/**
 * Opening and closing media sessions for a call's participants.
 *
 * Extracted from CallManager verbatim; the ordering rules in the comments are
 * the point of these functions, not incidental detail.
 */

import type { CallManagerInternals } from './call-manager-internals';
import { stillInCall } from './participant-presence';
import type { CallState } from '@/lib/call/call-state';
import { nextOpenAttempt, type OpenRetryDecision } from './open-session-retry';

/** A delay expressed through the manager's injected timer, so tests own the clock. */
function pause(m: CallManagerInternals, delayMs: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    m.schedule(resolve, delayMs);
  });
}

export async function openSessionFor(m: CallManagerInternals, cid: bigint): Promise<void> {
  if (m.openSessions.has(cid)) return;

  // One open per peer at a time.
  //
  // `openSessions` records completion, so between the first `openSession` call
  // and its resolution the guard above is false for a second caller — and there
  // are two callers. `accept()` opens for every peer that has already answered,
  // and the `CallAccept` handler opens for the peer that just answered; in a
  // group call they run for the same peer at the same time. The service refuses
  // the second with "a media open or teardown is already in progress with this
  // peer; retry shortly", and CI reported that as the call failing.
  //
  // Joining the in-flight attempt rather than starting another: the second
  // caller wants the session open, and it is being opened.
  const inFlight: Promise<void> | undefined = m.openingSessions.get(cid);
  if (inFlight) return inFlight;

  const attempt: Promise<void> = openSessionOnce(m, cid);
  m.openingSessions.set(cid, attempt);
  try {
    await attempt;
  } finally {
    m.openingSessions.delete(cid);
  }
}

async function openSessionOnce(m: CallManagerInternals, cid: bigint): Promise<void> {
  const startedAt: number = m.now();
  let attemptsMade: number = 0;
  let longestAttemptMs: number = 0;

  for (;;) {
    const attemptStartedAt: number = m.now();
    try {
      await m.transport.openSession(cid);

      // The call can end anywhere inside that await -- it is a round trip to
      // the service with a connect budget in tens of seconds, not a narrow
      // window. The failure path below has always re-read the state here; the
      // success path did not, so a late confirmation added the peer to
      // `openSessions` AFTER `closeAllSessions` had run, leaving a media
      // session and its camera open on the service with nothing left that would
      // ever close it, and applied `peer-connected` to a call that was over --
      // the event that moves a call to 'active' and starts the duration clock.
      //
      // Closed here rather than just dropped: the service opened it, so
      // somebody has to tell it not to keep it.
      const current: CallState | null = m.getState();
      const stillHere: boolean = (() => {
        const p = current?.participants.get(cid);
        return p !== undefined && stillInCall(p);
      })();
      // The PARTICIPANT is re-read here, not just the call.
      //
      // The failure path below already does this (`state.participants.has(cid)`
      // before retrying). The success path checked only the call's status, so a
      // peer who left WHILE their open was in flight came back: teardown could
      // not cancel it, because `closeSessionFor` returns early on
      // `!openSessions.delete(cid)` and this peer is not in `openSessions`
      // until the line below. The open then confirmed and `peer-connected`
      // marked them active again.
      //
      // What that costs: a ghost tile with released decoders, a media session
      // held open on the service forever, `sendFrame` still encoding to
      // somebody who left -- and, because `anyoneActive` is true for the
      // ghost, the call never reaches 'ended'. Camera light on, duration
      // ticking, nobody there.
      if (!current || current.status === 'ended' || current.status === 'failed' || !stillHere) {
        await m.transport.closeSession(cid).catch(() => undefined);
        return;
      }

      m.openSessions.add(cid);
      // The transport resolves only once the service confirmed the session, so
      // this is the moment the peer is genuinely reachable — which is what
      // moves the call to 'active' and starts the duration clock.
      m.apply({ type: 'peer-connected', cid });
      return;
    } catch (error) {
      attemptsMade += 1;
      const lastAttemptMs: number = m.now() - attemptStartedAt;
      longestAttemptMs = Math.max(longestAttemptMs, lastAttemptMs);
      const reason: string = error instanceof Error ? error.message : 'could not open the media session';

      const state: CallState | null = m.getState();
      // A call that ended or failed while we were waiting has nothing left to
      // open a session for, and no news to give anybody about this peer.
      if (!state || state.status === 'ended' || state.status === 'failed') return;

      // The service parks the peer's UDP channel across a timed-out open
      // precisely so the next one can pick it up. See open-session-retry.
      const decision: OpenRetryDecision = nextOpenAttempt({
        attemptsMade,
        elapsedMs: m.now() - startedAt,
        lastAttemptMs,
        longestAttemptMs,
      });
      if (decision.retry && state.participants.has(cid)) {
        await pause(m, decision.delayMs);
        continue;
      }

      // Order matters. Marking the only participant as left first makes the
      // reducer end the call as an ordinary hangup, and 'failed' is then
      // correctly refused as a late transition over a terminal state — so the
      // user is told "call ended" instead of "this peer connected without UDP",
      // losing the one sentence that explains what to do.
      if (state.participants.size === 1) {
        m.apply({ type: 'failed', reason });
        return;
      }

      // In a group, one peer's media failing is that peer dropping out, not the
      // call failing — everyone else carries on.
      m.apply({ type: 'peer-left', cid });
      return;
    }
  }
}

export async function closeSessionFor(m: CallManagerInternals, cid: bigint): Promise<void> {
  if (!m.openSessions.delete(cid)) return;
  await m.transport.closeSession(cid).catch(() => undefined);
}

export async function closeAllSessions(m: CallManagerInternals): Promise<void> {
  const peers: bigint[] = [...m.openSessions];
  m.openSessions.clear();
  await Promise.all(peers.map((cid) => m.transport.closeSession(cid).catch(() => undefined)));
}

/** Release everything once the call has reached a terminal state. */
export async function closeIfFinished(m: CallManagerInternals): Promise<void> {
  const state: CallState | null = m.getState();
  if (!state) return;
  if (state.status === 'ended' || state.status === 'failed') {
    await closeAllSessions(m);
  }
}
