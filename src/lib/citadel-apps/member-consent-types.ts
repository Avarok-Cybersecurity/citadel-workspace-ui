/**
 * The page's own words for a member's P2P and topic answers; the records themselves are the
 * generated S2 types (citadel-workspace-client-ts: PeerConsent, PeerForMe, PeerDirection,
 * IhttpFrom).
 */
import type { IhttpFrom } from 'citadel-workspace-client-ts';

/** What a member decides for one install: the three planes, each on its own. */
export type ConsentPlane = 'serve' | 'call' | 'topics';

/** AuthorizePeer's answer; every refusal is the one uniform `NoHost`. */
export type PeerAuthorization =
  | { readonly ok: true; readonly peer: IhttpFrom; readonly untilMs: bigint }
  | { readonly ok: false };
