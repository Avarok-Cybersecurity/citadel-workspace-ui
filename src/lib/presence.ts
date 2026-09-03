/**
 * Whether a workspace member is actually online.
 *
 * This dot has now been wrong four times, each in a different way:
 *
 *   1. `Math.random() > 0.5` — a coin flip contradicting the same user's
 *      status elsewhere on every render.
 *   2. `connectionService.canMessageUser` — a map keyed on the literal
 *      'current-user' that only the demo simulation writes, so constant false
 *      for everyone while naming a service that sounds authoritative.
 *   3. This module's first version — which asked the peer registry for a CID,
 *      having assumed member ids ARE CIDs. They are usernames: the kernel sets
 *      `user_id = get_username_by_cid(...)` and `ListMembers` returns those
 *      verbatim. The numeric guard rejected every real id, so it went straight
 *      back to constant false. A comment in this file asserted the wrong thing
 *      confidently, which is how the assumption survived review.
 *   4. `UserDirectory` ignoring all of the above and rendering "is registered
 *      with me" under a green dot — so a registered peer who is offline showed
 *      as online.
 *   5. Upstream of all of it: `Peer.isOnline` was a plain boolean, and the
 *      registry INVENTED `true` for a peer the agent had said nothing about.
 *      This function ORs that flag with the live poll, so the invention
 *      outranked the real answer. The field is now `boolean | null`, and this
 *      function returns null for the same reason: not knowing is a third
 *      answer, and the two it used to be squeezed into are both assertions.
 *
 * A member id is a USERNAME. The peer registry indexes peers by CID and carries
 * both the username and the real `isOnline` the agent reports, so the lookup is
 * by username, and the answer comes from the same set the sidebar's peer list
 * uses.
 *
 * A numeric id is still accepted, because nothing forbids a numeric username
 * and treating one as unknown would be a fifth version of the same bug.
 */

import { p2pRegistrationService, type Peer } from './p2p-registration-service';
import { p2pAutoConnectService } from './p2p-auto-connect-service';
import { debugLog } from './debug-config';

/** A member id as a CID, when it is one. Usernames are not. */
export function memberIdToCid(memberId: string): bigint | null {
  if (!/^\d+$/.test(memberId)) return null;
  try {
    return BigInt(memberId);
  } catch {
    return null;
  }
}

/**
 * The peer this member id refers to, by username or by CID.
 *
 * Searches by username FIRST: that is what a member id is, and a numeric
 * username would otherwise be looked up as somebody else's CID.
 */
function findPeer(memberId: string): Peer | undefined {
  const { allPeers } = p2pRegistrationService.getPeers();

  const byUsername: ReturnType<typeof allPeers.find> = allPeers.find((peer): boolean => peer.username === memberId);
  if (byUsername) return byUsername;

  const cid: bigint | null = memberIdToCid(memberId);
  return cid === null ? undefined : allPeers.find((peer) => peer.cid === cid);
}

/**
 * Presence for a member id: true, false, or null for "nobody has said".
 *
 * Null for a member the registry has never heard of. The previous version
 * returned false there and called it honest, which it was not quite: the UI
 * renders that as the word "Offline", which is an assertion about somebody who
 * might be sitting right there. An unregistered member's presence is unknown to
 * this client, and now the type can say so.
 */
export function isMemberOnline(memberId: string): boolean | null {
  const peer: ReturnType<typeof findPeer> = findPeer(memberId);
  if (!peer) {
    debugLog('Presence', 'no registered peer for member, presence unknown:', memberId);
    return null;
  }

  // The polled set is the live answer where it HAS one. Before the first poll
  // it is empty, and reading "absent from an empty set" as offline is what put
  // the word beside people who were sitting right there.
  const polled: boolean | null = p2pAutoConnectService.peerOnlineStatus(peer.cid);
  if (polled !== null) return polled;
  return peer.isOnline;
}
