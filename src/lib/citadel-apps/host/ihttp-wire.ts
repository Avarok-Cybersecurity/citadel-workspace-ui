/**
 * An internal-HTTP frame has two shapes. The guest ABI's (sdk/generated/IhttpFrame) is what an
 * app hands the host and is handed back; the wire's (citadel-ihttp-types, sdk/wire-generated) is
 * what the kernel relays and a peer's agent reads (R4.4). This is the one translation between
 * them, held to the kernel's encodings by the shared runtime-wire fixture.
 *
 * Out: methods in the wire's spelling, header names lowercased (the wire takes no other; HTTP
 * names are case-blind), an empty query as none, and the host's cancel reasons narrowed to the
 * wire's closed set, so no free text crosses from one app to another. In: the reverse, with a
 * wire reason in snake case. A frame that is not a wire frame is null.
 */
import type { FrameKind } from '../sdk/generated/FrameKind';
import type { HttpMethod } from '../sdk/generated/HttpMethod';
import type { IhttpFrame } from '../sdk/generated/IhttpFrame';
import type { RequestHead } from '../sdk/generated/RequestHead';
import type { ResponseHead } from '../sdk/generated/ResponseHead';
import type { CancelReason } from '../sdk/wire-generated/CancelReason';
import type { IhttpFrame as WireFrame } from '../sdk/wire-generated/IhttpFrame';
import type { IhttpFrameKind } from '../sdk/wire-generated/IhttpFrameKind';
import type { IhttpHeader } from '../sdk/wire-generated/IhttpHeader';
import type { IhttpMethod } from '../sdk/wire-generated/IhttpMethod';
import { array, bytes, literal, nullable, str, struct, tagged, u16, u32, u64, u8, type Parsed, type Schema } from './schema';

type WireRequestHead = Extract<IhttpFrameKind, { RequestHead: unknown }>['RequestHead'];
type WireResponseHead = Extract<IhttpFrameKind, { ResponseHead: unknown }>['ResponseHead'];

/** Set on every stream id the relay allocates and on none a caller may choose (kernel ihttp_relay). */
export const RELAY_STREAM_BIT: bigint = 1n << 63n;

const METHODS: Readonly<Record<HttpMethod, IhttpMethod>> = { GET: 'Get', POST: 'Post', PUT: 'Put', DELETE: 'Delete', PATCH: 'Patch', HEAD: 'Head' };
const SDK_METHOD: ReadonlyMap<IhttpMethod, HttpMethod> = new Map((Object.entries(METHODS) as [HttpMethod, IhttpMethod][]).map(([s, w]) => [w, s]));

const REASONS: Readonly<Record<CancelReason, string>> = {
  Caller: 'caller', Timeout: 'timeout', TooLarge: 'too_large', Busy: 'busy',
  RateLimited: 'rate_limited', NoRoute: 'no_route', Refused: 'refused', Failed: 'failed', Closed: 'closed',
};
const TOO_LARGE: ReadonlySet<string> = new Set<string>([
  'too_large', 'body_longer_than_declared', 'chunk_too_large', 'request_body_too_large', 'response_body_too_large',
  'path_too_long', 'too_many_headers', 'header_too_large',
]);
const NARROWED: ReadonlyMap<string, CancelReason> = new Map<string, CancelReason>([
  ...(Object.entries(REASONS) as [CancelReason, string][]).map(([w, s]): [string, CancelReason] => [s, w]),
  ['rate', 'RateLimited'], ['unrouted', 'NoRoute'], ['caller_concurrency', 'Busy'], ['server_concurrency', 'Busy'],
]);

function reasonOut(reason: string): CancelReason {
  return TOO_LARGE.has(reason) ? 'TooLarge' : NARROWED.get(reason) ?? 'Refused';
}

const headersOut = (h: readonly (readonly [string, string])[]): IhttpHeader[] => h.map(([name, value]) => ({ name: name.toLowerCase(), value }));
const headersIn = (h: readonly IhttpHeader[]): [string, string][] => h.map((x: IhttpHeader): [string, string] => [x.name, x.value]);

function kindOut(kind: FrameKind): IhttpFrameKind {
  if (kind === 'End') return 'End';
  if ('RequestHead' in kind) {
    const h: RequestHead = kind.RequestHead;
    return { RequestHead: {
      method: METHODS[h.method], path: h.path, query: h.query === '' ? null : h.query, headers: headersOut(h.headers),
      body_len: h.body_len, app_id: h.app_id, scope_key: h.scope_key,
    } };
  }
  if ('ResponseHead' in kind) {
    const h: ResponseHead = kind.ResponseHead;
    return { ResponseHead: { status: h.status, headers: headersOut(h.headers), body_len: h.body_len } };
  }
  if ('Body' in kind) return { Body: { bytes: kind.Body.bytes } };
  if ('Cancel' in kind) return { Cancel: { reason: reasonOut(kind.Cancel.reason) } };
  return { Credit: { n: kind.Credit.n } };
}

export const toWireFrame = (f: IhttpFrame): WireFrame => ({ v: f.v, stream: f.stream, kind: kindOut(f.kind) });

const header: Schema<IhttpHeader> = struct<IhttpHeader>({ name: str, value: str });
const method: Schema<IhttpMethod> = literal('Get', 'Post', 'Put', 'Delete', 'Patch', 'Head');
const reason: Schema<CancelReason> = literal(...(Object.keys(REASONS) as CancelReason[]));

const wireKind: Schema<IhttpFrameKind> = tagged<IhttpFrameKind>(['End'], {
  RequestHead: struct({ method, path: str, query: nullable(str), headers: array(header), body_len: nullable(u64), app_id: str, scope_key: str }),
  ResponseHead: struct({ status: u16, headers: array(header), body_len: nullable(u64) }),
  Body: struct<{ bytes: Uint8Array }>({ bytes }),
  Cancel: struct<{ reason: CancelReason }>({ reason }),
  Credit: struct<{ n: number }>({ n: u32 }),
});

const wireFrame: Schema<WireFrame> = struct<WireFrame>({ v: u8, stream: u64, kind: wireKind });

function kindIn(kind: IhttpFrameKind): FrameKind {
  if (kind === 'End') return 'End';
  if ('RequestHead' in kind) {
    const h: WireRequestHead = kind.RequestHead;
    return { RequestHead: {
      method: SDK_METHOD.get(h.method) as HttpMethod, path: h.path, query: h.query ?? '', headers: headersIn(h.headers),
      body_len: h.body_len, app_id: h.app_id, scope_key: h.scope_key,
    } };
  }
  if ('ResponseHead' in kind) {
    const h: WireResponseHead = kind.ResponseHead;
    return { ResponseHead: { status: h.status, headers: headersIn(h.headers), body_len: h.body_len } };
  }
  if ('Body' in kind) return { Body: { bytes: kind.Body.bytes } };
  if ('Cancel' in kind) return { Cancel: { reason: REASONS[kind.Cancel.reason] } };
  return { Credit: { n: kind.Credit.n } };
}

/** A decoded wire frame in the guest ABI's shape, or null when it is not one. */
export function fromWireFrame(value: unknown): IhttpFrame | null {
  const parsed: Parsed<WireFrame> = wireFrame(value);
  return parsed === null ? null : { v: parsed.v.v, stream: parsed.v.stream, kind: kindIn(parsed.v.kind) };
}
