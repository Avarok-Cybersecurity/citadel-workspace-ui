/**
 * Auto-connect's two doors, closed for a paused contact.
 *
 * Every dial goes through `connectToPeer`, and every incoming PeerConnect
 * through `handleIncomingPeerConnect` (plus the leader's early "connected" mark
 * for sessions of other tabs). Each consults this before acting.
 */
import { pauseStatusOf } from '@/lib/p2p-pause/agent-storage';
import { mayDial, answerFor, type IncomingAnswer, type PauseStatus } from '@/lib/p2p-pause/pause-rules';
import { ownsSession } from './session-ownership';

/**
 * Both ends are checked when both sessions are this browser's: `connectToPeer`
 * then dials on the PEER session's behalf, so that session's pause counts too.
 */
export async function dialIsBlocked(currentCid: bigint, peerCid: bigint): Promise<boolean> {
  if (!mayDial(await pauseStatusOf(currentCid, peerCid))) return true;
  if (!ownsSession(peerCid)) return false;
  const theirs: PauseStatus = await pauseStatusOf(peerCid, currentCid);
  return !mayDial(theirs);
}

export async function incomingAnswer(localCid: bigint, initiatorCid: bigint): Promise<IncomingAnswer> {
  return answerFor(await pauseStatusOf(localCid, initiatorCid));
}
