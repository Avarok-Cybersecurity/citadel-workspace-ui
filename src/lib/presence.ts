/**
 * Whether a workspace member is actually online.
 *
 * The green dot beside a name has now had three sources. It began as
 * `Math.random() > 0.5`, which made it a coin flip that contradicted the same
 * user's status elsewhere on every render. That was replaced by
 * `connectionService.canMessageUser(member.id)` — real-looking, and constant
 * false: the map it reads is keyed on the literal `'current-user'` and is
 * written only by `acceptConnectionRequest`, which has no caller outside the
 * demo simulation. Replacing a random lie with a constant one is the harder
 * bug to see, because the code now names a service that sounds authoritative.
 *
 * The real source is the peer registry's `online_status`, which the
 * auto-connect service polls and caches — the same set the sidebar's peer list
 * has always used. Members are keyed by CID rendered as a string, so the only
 * work here is parsing that back and admitting when it is not a CID.
 */

import { p2pAutoConnectService } from './p2p-auto-connect-service';
import { debugLog } from './debug-config';

/**
 * A member id as a CID, or null when it is not one.
 *
 * Member ids arrive from the wire as strings and are usually the CID, but the
 * mapping layer accepts anything non-empty. `BigInt('alice')` throws, so this
 * has to be asked rather than assumed.
 */
export function memberIdToCid(memberId: string): bigint | null {
  if (!/^\d+$/.test(memberId)) return null;
  try {
    return BigInt(memberId);
  } catch {
    return null;
  }
}

/**
 * Presence for a member id, from the polled peer registry.
 *
 * False for a member whose id is not a CID: unknown reads as offline rather
 * than as a dot that means nothing.
 */
export function isMemberOnline(memberId: string): boolean {
  const cid = memberIdToCid(memberId);
  if (cid === null) {
    debugLog('Presence', 'member id is not a CID, reporting offline:', memberId);
    return false;
  }
  return p2pAutoConnectService.isPeerOnline(cid);
}
