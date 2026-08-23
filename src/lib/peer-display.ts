/**
 * Peer Display
 *
 * How a peer is named in the UI. One module so every surface — conversation
 * list, peer discovery, pending requests, account switcher — answers the
 * question identically.
 *
 * The rule: a CID is an internal routing identifier and is never a person's
 * name. Surfaces previously rendered `User 70409342...` (the first 8 digits of
 * a decimal u64) as the display name and the next 16 digits as the subtitle,
 * which is unreadable, unmemorable, and indistinguishable between two peers
 * whose CIDs happen to share a prefix.
 *
 * When no username is known we derive a SHORT HANDLE instead: base36 of the
 * CID's low bits, which is compact, stable for a given peer, and visibly a
 * handle rather than a truncated number pretending to be a name.
 */

import { toCidKey, type CidLike } from './utils/cid-utils';

/** Number of base36 characters in a derived handle. */
const HANDLE_LENGTH = 6;

/** Characters that read ambiguously in a short code, mapped to clearer ones. */
const AMBIGUOUS: Record<string, string> = { O: '0', I: '1', L: '1' };

export interface PeerIdentity {
  cid: CidLike;
  username?: string | null;
  fullName?: string | null;
}

/**
 * A short, stable, human-readable handle for a peer with no known username.
 *
 * Derived from the CID's low 32 bits in base36 so it stays compact regardless of
 * how large the CID is. Returns `null` when the CID is unusable, so callers can
 * fall back to a generic label rather than printing a handle for a peer that has
 * no valid identifier at all.
 */
export function shortPeerHandle(cid: CidLike): string | null {
  const key = toCidKey(cid);
  if (!key) return null;

  // Low 32 bits keep the handle short while still varying between peers; the
  // full CID in base36 would be up to 13 characters.
  const low = BigInt(key) & 0xffffffffn;
  const base36 = low.toString(36).toUpperCase().padStart(HANDLE_LENGTH, '0');
  const tail = base36.slice(-HANDLE_LENGTH);

  return tail
    .split('')
    .map(c => AMBIGUOUS[c] ?? c)
    .join('');
}

/**
 * The name to show for a peer.
 *
 * Prefers what the peer calls themselves, then their username, then a derived
 * handle. Note the ordering: `fullName` wins because it is the display name a
 * user chose, while `username` is the login identifier.
 */
export function peerDisplayName(peer: PeerIdentity): string {
  const fullName = peer.fullName?.trim();
  if (fullName) return fullName;

  const username = peer.username?.trim();
  if (username) return username;

  const handle = shortPeerHandle(peer.cid);
  return handle ? `Peer ${handle}` : 'Unknown peer';
}

/**
 * One or two characters for an avatar fallback.
 *
 * Uses the first letter of a real name where one exists; otherwise the first two
 * characters of the derived handle, which are letters/digits rather than the
 * leading digits of a decimal CID (those were frequently identical across peers).
 */
export function peerInitials(peer: PeerIdentity): string {
  const name = peer.fullName?.trim() || peer.username?.trim();
  if (name) return name.slice(0, 1).toUpperCase();

  const handle = shortPeerHandle(peer.cid);
  return handle ? handle.slice(0, 2) : '?';
}

/**
 * Whether this peer is being shown under a derived handle rather than a name
 * they chose. Lets a surface add a hint ("name not yet shared") instead of
 * silently presenting a handle as though it were an identity.
 */
export function isUnnamedPeer(peer: PeerIdentity): boolean {
  return !peer.fullName?.trim() && !peer.username?.trim();
}
