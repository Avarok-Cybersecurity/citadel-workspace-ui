/**
 * Whether the agent still holds a session.
 *
 * The agent keeps sessions in memory, so a restart ends all of them, while the
 * browser still remembers their CIDs. The agent's GetSessions answer is the
 * authority: a CID it does not list is gone, and a CID it lists (connected or
 * reconnecting) is not. A failed query is not an answer, so it never says
 * "gone".
 */
import type { ActiveSessionsResult } from '@/lib/connection/queries';
import type { ActiveSession } from '@/types/session-types';

export function agentLacksSession(cid: bigint, result: ActiveSessionsResult): boolean {
  return result.ok && !result.sessions.some((s: ActiveSession) => s.cid === cid);
}

/**
 * The SDK's refusal for a CID the agent holds no session for:
 * "Session for <cid> not found in session manager. Failed to dispatch peer command".
 */
const SESSION_NOT_FOUND: string = 'not found in session manager';

export function isSessionNotFoundRefusal(error: unknown): boolean {
  const message: string = error instanceof Error ? error.message : String(error);
  return message.includes(SESSION_NOT_FOUND);
}
