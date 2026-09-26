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
  /** Ask every tab to say which session it holds (cid-report-request). */
  requestReports: () => void;
  unregister: (instanceId: string) => void;
  /** How long a tab has to answer before it is taken to be gone. */
  reportWindowMs: number;
  schedule: (fn: () => void, ms: number) => void;
}

/** The registered payload's instance and cid, when it names a session. */
function registration(payload: unknown): { instanceId: string; cid: bigint } | null {
  const p: { instanceId?: unknown; cid?: unknown } | null = payload as { instanceId?: unknown; cid?: unknown } | null;
  return typeof p?.instanceId === 'string' && typeof p.cid === 'bigint' ? { instanceId: p.instanceId, cid: p.cid } : null;
}

/**
 * Wires the decision to its triggers:
 * - this tab's connection (re)opens as leader, or it becomes leader: claim every follower
 *   CID the registry holds, and ask every tab to report in;
 * - a tab reports a CID while this tab leads: claim that one;
 * - the connection drops: forget what was claimed, since the next one has claimed nothing.
 *
 * A tab that closed without its goodbye, or switched account, left its entry — and its
 * CID — in the registry, and a failed claim used to be retried on EVERY later
 * registration of any tab, so the leader re-claimed a session nobody held for the life
 * of the page. Now a failed claim is retried only when a tab reports that very CID again,
 * and a tab that does not answer the report within the window is removed, so its CID is
 * not claimed on the next connection either.
 *
 * Returns the claims currently in flight, for tests to await.
 */
export function installFollowerSessionClaims(deps: FollowerClaimDeps): { settle: () => Promise<void> } {
  let claimed: Set<bigint> = new Set<bigint>();
  const inFlight: Set<Promise<void>> = new Set<Promise<void>>();
  /** Tabs that have answered the report round in progress, or null between rounds. */
  let answered: Set<string> | null = null;

  const claimOne = (cid: bigint): void => {
    const generation: Set<bigint> = claimed;
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
  };

  const expireSilentTabs = (): void => {
    const heard: Set<string> | null = answered;
    answered = null;
    if (!heard || !deps.isLeader()) return;
    for (const { instanceId } of deps.instances()) {
      if (instanceId !== deps.selfInstanceId() && !heard.has(instanceId)) deps.unregister(instanceId);
    }
  };

  const claimAll = (): void => {
    if (!deps.isLeader()) return;
    for (const cid of cidsToClaim(deps.instances(), deps.selfInstanceId(), claimed)) claimOne(cid);
    if (answered === null) {
      answered = new Set<string>();
      deps.schedule(expireSilentTabs, deps.reportWindowMs);
    }
    deps.requestReports();
  };

  deps.on('on-ws-connection-success', (): void => { claimed = new Set<bigint>(); claimAll(); });
  deps.on('instance:leader-changed', (payload: unknown): void => {
    if ((payload as { isLeader?: boolean } | null)?.isLeader === true) claimAll();
  });
  deps.on('instance:registered', (payload: unknown): void => {
    const reported: { instanceId: string; cid: bigint } | null = registration(payload);
    const instanceId: unknown = (payload as { instanceId?: unknown } | null)?.instanceId;
    if (typeof instanceId === 'string') answered?.add(instanceId);
    if (!reported || !deps.isLeader() || reported.instanceId === deps.selfInstanceId()) return;
    if (!claimed.has(reported.cid)) claimOne(reported.cid);
  });
  deps.on('websocket-disconnected', (): void => { claimed = new Set<bigint>(); });

  return { settle: async (): Promise<void> => { await Promise.all([...inFlight]); } };
}
