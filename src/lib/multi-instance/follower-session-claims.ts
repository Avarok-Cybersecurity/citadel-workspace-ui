/**
 * The leader claims, on its own connection, every session its follower tabs hold.
 *
 * One browser has one WebSocket to the agent, and the agent binds each session to the
 * connection that last claimed it. When the leader tab reloads, the connection its
 * followers' sessions were bound to closes; the new leader's connection claimed only its
 * own tab's session, so the agent refused every request for a follower's session ("the
 * connection does not own it") and delivered its messages to a connection that no longer
 * existed. Measured on the live site: a follower's peer list timed out and it could not
 * send a connection request until it was reloaded too.
 *
 * The agent already allows this claim — a session whose connection is gone is orphaned
 * (connection_management.rs `owner_of`) — so the fix is that somebody asks. The leader
 * knows each follower's CID from the instance registry (cid-update / instance-announce),
 * and claims each once per connection.
 */
import type { InstanceInfo } from './instance-manager-types';

/** CIDs held by OTHER tabs that this connection has not yet claimed. */
export function cidsToClaim(
  instances: readonly InstanceInfo[],
  selfInstanceId: string,
  claimedOnThisConnection: ReadonlySet<bigint>,
): bigint[] {
  const out: bigint[] = [];
  for (const { instanceId, cid } of instances) {
    if (instanceId === selfInstanceId || cid === null) continue;
    if (claimedOnThisConnection.has(cid) || out.includes(cid)) continue;
    out.push(cid);
  }
  return out;
}

/**
 * What a claim's result means for this connection.
 *
 * "Owned by a live connection" (claim-session.ts reads the agent's refusal) — in the normal
 * case that is this very connection (the follower registered through it), so there is
 * nothing to do and it is recorded as settled. Anything else is a real failure: it is
 * reported, and left unsettled so the next trigger tries again.
 */
export type ClaimResult = 'settled' | 'failed';

export function readClaimOutcome(error: unknown | null, isOwnedByALiveConnection: (error: unknown) => boolean): ClaimResult {
  if (error === null) return 'settled';
  return isOwnedByALiveConnection(error) ? 'settled' : 'failed';
}

type Handler = (payload: unknown) => void;

export interface FollowerClaimDeps {
  on: (event: string, handler: Handler) => void;
  isLeader: () => boolean;
  selfInstanceId: () => string;
  instances: () => InstanceInfo[];
  claim: (cid: bigint) => Promise<unknown>;
  isOwnedByALiveConnection: (error: unknown) => boolean;
  reportFailure: (cid: bigint, error: unknown) => void;
}

/**
 * Wires the decision to its triggers:
 * - this tab's connection (re)opens as leader, or it becomes leader: claim every follower CID;
 * - a follower reports its CID while this tab leads: claim that one;
 * - the connection drops: forget what was claimed, since the next one has claimed nothing.
 *
 * Returns the claims currently in flight, for tests to await.
 */
export function installFollowerSessionClaims(deps: FollowerClaimDeps): { settle: () => Promise<void> } {
  let claimed: Set<bigint> = new Set<bigint>();
  const inFlight: Set<Promise<void>> = new Set<Promise<void>>();

  const claimPending = (): void => {
    if (!deps.isLeader()) return;
    const generation: Set<bigint> = claimed;
    for (const cid of cidsToClaim(deps.instances(), deps.selfInstanceId(), generation)) {
      generation.add(cid);
      const attempt: Promise<void> = deps.claim(cid).then(
        (): null => null,
        (error: unknown): unknown => error,
      ).then((error: unknown | null): void => {
        if (readClaimOutcome(error, deps.isOwnedByALiveConnection) === 'failed') {
          generation.delete(cid);
          deps.reportFailure(cid, error);
        }
      });
      inFlight.add(attempt);
      void attempt.finally((): void => { inFlight.delete(attempt); });
    }
  };

  deps.on('on-ws-connection-success', (): void => { claimed = new Set<bigint>(); claimPending(); });
  deps.on('instance:leader-changed', (payload: unknown): void => {
    if ((payload as { isLeader?: boolean } | null)?.isLeader === true) claimPending();
  });
  deps.on('instance:registered', (): void => { claimPending(); });
  deps.on('websocket-disconnected', (): void => { claimed = new Set<bigint>(); });

  return { settle: async (): Promise<void> => { await Promise.all([...inFlight]); } };
}
