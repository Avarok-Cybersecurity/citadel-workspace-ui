/**
 * What the discovery modal does with a `PeerRegisterFailure`.
 *
 * Two outcomes, and they are opposites. "Already registered" is a SUCCESS
 * wearing the Failure variant — see
 * `lib/peer-registration-store/already-registered.ts` — so the row is marked
 * registered and nothing is said. Anything else is a genuine refusal and is
 * reported by name.
 *
 * A refusal used to reach only `debugLog`, compiled out in production, so the
 * user was told "Request Sent" and then nothing. It is correlated by
 * `request_id`, because `PeerRegisterFailure` carries no `peer_cid`.
 *
 * Extracted because `usePeerDiscovery` crossed the 250-line limit, and because
 * the decision is worth reading on its own: telling the user "your request was
 * not accepted" about a peer who IS registered is the opposite of what happened,
 * and leaves the row unmarked so they try again.
 */
import { isAlreadyRegistered } from '@/lib/peer-registration-store/already-registered';

export type PeerRegisterFailureOutcome =
  | { kind: 'already-registered'; cid: string | undefined }
  | { kind: 'refused'; reason: string | undefined };

/** Classify the failure. Pure, so the rule is testable without a modal. */
export function classifyPeerRegisterFailure(
  failure: Record<string, unknown>,
): PeerRegisterFailureOutcome {
  const reason: string | undefined =
    typeof failure.message === 'string' ? failure.message : undefined;
  if (isAlreadyRegistered(reason)) {
    return { kind: 'already-registered', cid: (failure.cid as bigint | undefined)?.toString() };
  }
  return { kind: 'refused', reason };
}

/** What the modal needs in order to act on the outcome. */
export interface PeerRegisterFailureDeps {
  readonly markRegistered: (cid: string) => void;
  readonly reportRefusal: (reason: string | undefined) => void;
}

/**
 * Apply the outcome. Kept beside the classification so the two cannot drift:
 * the whole defect was one branch treating a success as a refusal.
 */
export function applyPeerRegisterFailure(
  failure: Record<string, unknown>,
  deps: PeerRegisterFailureDeps,
): void {
  const outcome: PeerRegisterFailureOutcome = classifyPeerRegisterFailure(failure);
  if (outcome.kind === 'already-registered') {
    if (outcome.cid) deps.markRegistered(outcome.cid);
    return;
  }
  deps.reportRefusal(outcome.reason);
}
