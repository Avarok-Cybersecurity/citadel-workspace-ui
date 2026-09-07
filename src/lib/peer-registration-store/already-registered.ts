/**
 * "Peer already registered" is a success wearing a Failure variant.
 *
 * CIDs are permanent (CLAUDE.md, "CID Lifecycle"): registrations are stored by
 * CID pair and the CID never changes, so after any disconnect and reconnect the
 * registration is still on the server and the agent answers the next attempt
 * with `PeerRegisterFailure { message: "Peer N is already registered" }`.
 * CLAUDE.md states the consequence outright — *"'Peer Already Registered' is
 * NOT an Error … Treat this as success, not failure."*
 *
 * Four modules read that variant and three knew the rule. The fourth,
 * `accept-matcher.ts`, rejected its promise — and `lifecycle.ts` awaits that
 * promise on the line before `connectToPeer`, so the rejection skipped the
 * connect and no P2P channel was opened at all. The agent log for the six
 * failing specs shows exactly that: every send `to SERVER (no peer_cid)`, and
 * not one `[PeerChannelCreated]`.
 *
 * One predicate, because the test for it was spelled three different ways
 * across the modules that had it, and a fourth spelling is how the next one
 * drifts.
 */

/** Whether an agent refusal message is really the already-registered case. */
export function isAlreadyRegistered(message: string | undefined): boolean {
  // Case-insensitive: the agent writes "is already registered" and the UI has
  // carried "Already registered" in its own strings.
  return message !== undefined && /already registered/i.test(message);
}
