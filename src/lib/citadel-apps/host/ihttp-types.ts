/**
 * Internal HTTP frames (design R4.4), as they travel in CBOR.
 *
 * LOCAL SHAPES: replace with the ts-rs export of `citadel-ihttp-types` when that crate lands.
 * The variant names follow R4.4 verbatim (serde's default external tagging, no rename):
 * `{RequestHead: {...}}`, `"End"`, `{Credit: {n}}`. Stream ids are u64, so bigint.
 */

export interface RequestHead {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly headers: readonly (readonly [string, string])[];
  /** null: the length is not known up front (a streaming request). */
  readonly body_len: bigint | null;
  readonly app_id: string;
  readonly scope_key: string;
}

export interface ResponseHead {
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly body_len: bigint | null;
}

export type IhttpFrameKind =
  | { readonly RequestHead: RequestHead }
  | { readonly ResponseHead: ResponseHead }
  | { readonly Body: { readonly bytes: Uint8Array } }
  | 'End'
  | { readonly Cancel: { readonly reason: string } }
  | { readonly Credit: { readonly n: number } };

export interface IhttpFrame {
  readonly v: 1;
  readonly stream: bigint;
  readonly kind: IhttpFrameKind;
}

/** Who a frame came from, as the authenticated session or the kernel stamped it. */
export interface IhttpPeer {
  readonly username: string;
  readonly cid: bigint;
  readonly app_id: string;
  readonly install_id: string;
  readonly via: 'p2p' | 'relay';
}

export const peerKey = (peer: IhttpPeer): string => `${peer.cid.toString()}/${peer.install_id}`;

export const IHTTP_METHODS: ReadonlySet<string> = new Set<string>(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH']);
