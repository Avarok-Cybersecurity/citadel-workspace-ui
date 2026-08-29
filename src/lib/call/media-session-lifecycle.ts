/**
 * Opening and closing media sessions for a call's participants.
 *
 * Extracted from CallManager verbatim; the ordering rules in the comments are
 * the point of these functions, not incidental detail.
 */

import type { CallManagerInternals } from './call-manager-internals';
import type { CallState } from '@/lib/call/call-state';

export async function openSessionFor(m: CallManagerInternals, cid: bigint): Promise<void> {
  if (m.openSessions.has(cid)) return;
  try {
    await m.transport.openSession(cid);
    m.openSessions.add(cid);
    // The transport resolves only once the service confirmed the session, so
    // this is the moment the peer is genuinely reachable — which is what
    // moves the call to 'active' and starts the duration clock.
    m.apply({ type: 'peer-connected', cid });
  } catch (error) {
    const reason: string = error instanceof Error ? error.message : 'could not open the media session';

    // Order matters. Marking the only participant as left first makes the
    // reducer end the call as an ordinary hangup, and 'failed' is then
    // correctly refused as a late transition over a terminal state — so the
    // user is told "call ended" instead of "this peer connected without UDP",
    // losing the one sentence that explains what to do.
    const state: CallState | null = m.getState();
    if (state && state.participants.size === 1) {
      m.apply({ type: 'failed', reason });
      return;
    }

    // In a group, one peer's media failing is that peer dropping out, not the
    // call failing — everyone else carries on.
    m.apply({ type: 'peer-left', cid });
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
