/**
 * Internal-HTTP frames and peers from the guest's decoded CBOR, shape-checked. Integers that are
 * u64 on the wire (stream ids, cids, body lengths) arrive as number or bigint depending on size and
 * leave here as bigint. Anything off-shape is null, never a partial frame.
 */
import { isCborMap, type CborMap } from './cbor';
import type { IhttpFrame, IhttpFrameKind, IhttpPeer, RequestHead, ResponseHead } from './ihttp-types';

function u64(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n && value < 2n ** 64n ? value : null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return null;
}

function optionalU64(value: unknown): bigint | null | undefined {
  if (value === null || value === undefined) return null;
  const n: bigint | null = u64(value);
  return n === null ? undefined : n;
}

function headers(value: unknown): [string, string][] | null {
  if (!Array.isArray(value)) return null;
  const out: [string, string][] = [];
  for (const pair of value as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null;
    out.push([pair[0], pair[1]]);
  }
  return out;
}

function requestHead(v: CborMap): RequestHead | null {
  const h: [string, string][] | null = headers(v.headers);
  const bodyLen: bigint | null | undefined = optionalU64(v.body_len);
  if (typeof v.method !== 'string' || typeof v.path !== 'string' || typeof v.query !== 'string') return null;
  if (typeof v.app_id !== 'string' || typeof v.scope_key !== 'string' || h === null || bodyLen === undefined) return null;
  return { method: v.method, path: v.path, query: v.query, headers: h, body_len: bodyLen, app_id: v.app_id, scope_key: v.scope_key };
}

function responseHead(v: CborMap): ResponseHead | null {
  const h: [string, string][] | null = headers(v.headers);
  const bodyLen: bigint | null | undefined = optionalU64(v.body_len);
  if (typeof v.status !== 'number' || h === null || bodyLen === undefined) return null;
  return { status: v.status, headers: h, body_len: bodyLen };
}

function frameKind(value: unknown): IhttpFrameKind | null {
  if (value === 'End') return 'End';
  if (!isCborMap(value)) return null;
  const keys: string[] = Object.keys(value);
  if (keys.length !== 1) return null;
  const inner: unknown = value[keys[0]];
  if (!isCborMap(inner)) return null;
  switch (keys[0]) {
    case 'RequestHead': { const h: RequestHead | null = requestHead(inner); return h === null ? null : { RequestHead: h }; }
    case 'ResponseHead': { const h: ResponseHead | null = responseHead(inner); return h === null ? null : { ResponseHead: h }; }
    case 'Body': return inner.bytes instanceof Uint8Array ? { Body: { bytes: inner.bytes } } : null;
    case 'Cancel': return typeof inner.reason === 'string' ? { Cancel: { reason: inner.reason } } : null;
    case 'Credit': return typeof inner.n === 'number' && Number.isInteger(inner.n) ? { Credit: { n: inner.n } } : null;
    default: return null;
  }
}

export function frameFromCbor(value: unknown): IhttpFrame | null {
  if (!isCborMap(value) || value.v !== 1) return null;
  const stream: bigint | null = u64(value.stream);
  const kind: IhttpFrameKind | null = frameKind(value.kind);
  return stream === null || kind === null ? null : { v: 1, stream, kind };
}

export function peerFromCbor(value: unknown): IhttpPeer | null {
  if (!isCborMap(value)) return null;
  const cid: bigint | null = u64(value.cid);
  if (typeof value.username !== 'string' || cid === null || typeof value.app_id !== 'string' || typeof value.install_id !== 'string') return null;
  if (value.via !== 'p2p' && value.via !== 'relay') return null;
  return { username: value.username, cid, app_id: value.app_id, install_id: value.install_id, via: value.via };
}

/** `{peer, frame}`: what `ihttp.respond` takes. */
export function respondArgs(args: CborMap): { readonly peer: IhttpPeer; readonly frame: IhttpFrame } | null {
  const peer: IhttpPeer | null = peerFromCbor(args.peer);
  const frame: IhttpFrame | null = frameFromCbor(args.frame);
  return peer === null || frame === null ? null : { peer, frame };
}
