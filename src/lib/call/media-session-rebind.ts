/**
 * A call's media sessions, re-opened on the socket that replaced theirs.
 *
 * The agent binds a media session to the connection that opened it
 * (kernel/requests/media/open.rs: `session.owner() == uuid`) and pumps the
 * peer's frames to that connection. One browser has one connection, the
 * leader's. When the leader tab closes or reloads mid-call, another tab is
 * elected and opens a new connection, and the call -- which lives in the tab
 * whose session is in it, untouched by the election -- went on sending into a
 * session whose frames were being delivered to a socket that no longer
 * existed: the user heard nothing from then on.
 *
 * A new connection is not usable for a session until it has claimed it, and
 * the claim is announced in every tab (claim-relay.ts). That is the moment to
 * re-open: the agent rebuilds a stale session for the requester's fresh uuid
 * and confirms a live one as already open, so a re-open is safe either way.
 */
export interface MediaRebindDeps {
  /** Subscribe to "this session was claimed on a connection"; returns the unsubscribe. */
  onSessionClaimed: (handler: (cid: bigint) => void) => () => void;
  /** The session this call is placed as. */
  selfCid: bigint;
  reopen: (peerCid: bigint) => Promise<void>;
  /** A re-open that failed: the caller decides how loudly. */
  reportFailure: (peerCid: bigint, error: unknown) => void;
}

export class MediaSessionRebind {
  private readonly open: Set<bigint> = new Set<bigint>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: MediaRebindDeps) {}

  /** Listening only while a session is open, so a finished call holds no subscription. */
  opened(peerCid: bigint): void {
    this.open.add(peerCid);
    if (this.unsubscribe) return;
    this.unsubscribe = this.deps.onSessionClaimed((cid: bigint): void => {
      if (cid === this.deps.selfCid) this.rebind();
    });
  }

  closed(peerCid: bigint): void {
    this.open.delete(peerCid);
    if (this.open.size > 0 || !this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = null;
  }

  private rebind(): void {
    for (const peerCid of [...this.open]) {
      void this.deps.reopen(peerCid).catch((error: unknown): void => this.deps.reportFailure(peerCid, error));
    }
  }
}
