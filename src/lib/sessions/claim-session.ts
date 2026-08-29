/**
 * Taking ownership of a session for THIS tab.
 *
 * "Not orphaned" from the agent means somebody already has this session — and
 * that somebody may be another tab in this browser, not a stale server-side
 * record. Treating the refusal as success lets two tabs register the same CID,
 * and `findInstanceByCid` returns the first map hit: every CID-routed
 * notification (messages, transfer ticks, call media) goes to one tab while the
 * other renders the same conversation and silently never updates, with the
 * winner able to flip on re-registration.
 *
 * Round 153 fixed that — in the auto-claim path, and in none of the other
 * three: the workspace switcher, the orphan-sessions navbar, and the
 * post-login redirect all still swallowed the refusal and adopted. Four copies
 * of a check is how three of them come to differ, so this is the check, once.
 */

import { websocketService } from '../websocket-service';
import { instanceManager } from '../multi-instance';
import { debugLog } from '../debug-config';

export type ClaimOutcome =
  /** The session was orphaned and is now ours. */
  | { status: 'claimed' }
  /** Live, and no other tab in this browser holds it — safe to select. */
  | { status: 'already-active' }
  /** Live, and another tab in this browser is using it. Do not adopt. */
  | { status: 'owned-by-another-tab'; instanceId: string };

/** Does another instance already own this CID? */
function otherTabOwns(cid: bigint): string | null {
  const owner: string | null = instanceManager.findInstanceByCid(cid);
  return owner && owner !== instanceManager.instanceId ? owner : null;
}

/**
 * Claim `cid` for this tab, or report why not.
 *
 * Throws for any failure that is NOT "not orphaned" — a claim that fails for
 * another reason is a real error and the caller should say so.
 */
export async function claimSessionForThisTab(cid: bigint): Promise<ClaimOutcome> {
  try {
    await websocketService.claimSession(cid, true);
    debugLog('ClaimSession', `Claimed ${cid} (was orphaned)`);
    return { status: 'claimed' };
  } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message?.includes('not orphaned')) {
      throw error;
    }

    const owner: string | null = otherTabOwns(cid);
    if (owner) {
      debugLog('ClaimSession', `${cid} is owned by instance ${owner}; not adopting`);
      return { status: 'owned-by-another-tab', instanceId: owner };
    }

    debugLog('ClaimSession', `${cid} is live and unowned here; selecting it`);
    return { status: 'already-active' };
  }
}

/** What to tell the user when another tab has it. */
export const SESSION_OWNED_ELSEWHERE = {
  title: 'Already Open Elsewhere',
  description:
    'This session is open in another tab. Switch to it, or pick a different session here.',
} as const;
