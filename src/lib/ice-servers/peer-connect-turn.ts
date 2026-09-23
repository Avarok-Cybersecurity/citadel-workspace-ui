/**
 * The one place a `PeerConnect` gains its `turn` field.
 *
 * Every PeerConnect the UI issues goes through `P2POperations.openP2PConnection`
 * — the ordinary initiator, the leader initiating on behalf of the other
 * same-browser session, and the forced initiator after a ClaimSession — and it
 * asks this module for the initiating session's relay servers. With none, the
 * field is left off entirely rather than sent as null, so an agent that
 * predates it sees exactly the request it always has.
 */
import type { IceServersGrant, TurnConfig, TurnPolicy } from '@/types/ice-servers';
import type { IceServersCache } from './cache';

/** Relay only when a direct path cannot be found. */
export const PEER_CONNECT_TURN_POLICY: TurnPolicy = 'fallback';

/** Resolves the `turn` field for a PeerConnect initiated by `cid`, or null. */
export type TurnSource = (cid: bigint) => Promise<TurnConfig | null>;

export function turnConfigFrom(grant: IceServersGrant | null): TurnConfig | null {
  if (grant === null || grant.ice_servers.length === 0) return null;
  return {
    policy: PEER_CONNECT_TURN_POLICY,
    ice_servers: grant.ice_servers,
    expires_at: grant.expires_at,
  };
}

export function turnSourceFrom(cache: IceServersCache): TurnSource {
  return async (cid: bigint): Promise<TurnConfig | null> => turnConfigFrom(await cache.get(cid));
}

/** The request body with `turn` attached when there is one, and untouched when not. */
export function withTurn<T extends object>(body: T, turn: TurnConfig | null): T | (T & { turn: TurnConfig }) {
  return turn === null ? body : { ...body, turn };
}
