/**
 * The per-member P2P and topic records, with the names S2 gives them (citadel-workspace-types
 * `apps::peer`, docs/plans/p2p-demo-design.md §1, §7). LOCAL STAND-INS until those generated
 * bindings reach citadel-workspace-client-ts; the shapes are the ts-rs ones, so the swap is an
 * import change and nothing else.
 */

/** One member's answer for one install. Absent from `peer_for_me`: never asked. */
export interface PeerConsent {
  readonly serve: boolean;
  readonly call: boolean;
  /** group.topic.subscribe and group.topic.publish. */
  readonly topics: boolean;
  readonly at_ms: bigint;
}

/** This member's consent and per-install block list (usernames), from ListInstalls. */
export interface PeerForMe {
  readonly install_id: string;
  readonly consent: PeerConsent;
  readonly blocked: readonly string[];
}

/** What a member decides for one install: the three planes, each on its own. */
export type ConsentPlane = 'serve' | 'call' | 'topics';

/** Which way an AuthorizePeer asks. */
export type PeerDirection = { Serve: { routes_digest: string } } | 'Call' | { Topic: { topic: string } };

/** The kernel's stamp of the other end: never what the page's peer list or the frame says. */
export interface IhttpFrom {
  readonly username: string;
  readonly cid: bigint;
  readonly app_id: string;
  readonly install_id: string;
}

/** AuthorizePeer's answer; every refusal is the one uniform `NoHost`. */
export type PeerAuthorization =
  | { readonly ok: true; readonly peer: IhttpFrom; readonly untilMs: bigint }
  | { readonly ok: false };
