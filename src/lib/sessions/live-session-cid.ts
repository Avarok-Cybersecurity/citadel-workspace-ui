import { sessionIsOnServer } from './same-server';
import type { ActiveSession } from '@/types/session-types';

/**
 * The CID the agent holds for this account right now, if it holds one.
 *
 * The stored record's CID is a copy, and copies go stale -- a boot used to
 * erase them all. The agent's live list is the authority the landing page
 * resumes from; matched by username and by the typed host, since behind the
 * edge `server_address` is the resolved address (see same-server).
 */
export function liveSessionCid(
  live: readonly ActiveSession[],
  account: { username: string; serverAddress: string },
): bigint | undefined {
  return live.find((s: ActiveSession) => s.username === account.username && sessionIsOnServer(s, account.serverAddress))?.cid;
}
