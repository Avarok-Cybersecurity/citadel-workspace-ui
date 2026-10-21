/**
 * The serving side of internal HTTP for one app instance (R4.4), pure over an injected clock.
 * Inbound frames come from callers the session vouches for; the router decides which reach the
 * app and answers the rest with Cancel. It enforces: advertised routes only, this app's id only,
 * monotonic stream ids per caller, 30 requests/s per caller, 8 live streams per caller and 64 per
 * server, head limits (path, header count and size), the 4 MiB request body and 16 MiB response
 * body caps, 64 KiB chunks, credit-based flow control both ways, and stream deadlines.
 */
import type { IhttpLimits } from './limits';
import type { Refused } from './ports';
import { matchRoute, type RoutePattern } from './ihttp-routes';
import { IHTTP_METHODS, peerKey, type IhttpFrame, type IhttpPeer, type RequestHead, type ResponseHead } from './ihttp-types';
import { TokenBucket } from './token-bucket';

export type RouterAction =
  /** Hand this frame to the app (as an AppEvent). */
  | { readonly kind: 'deliver'; readonly peer: IhttpPeer; readonly frame: IhttpFrame }
  /** Send this frame back to the caller. */
  | { readonly kind: 'reply'; readonly peer: IhttpPeer; readonly frame: IhttpFrame };

export type OutboundVerdict = { readonly ok: true } | { readonly ok: false; readonly refused: Refused; readonly actions: readonly RouterAction[] };

interface Stream {
  readonly peer: IhttpPeer;
  readonly id: bigint;
  readonly deadline: number;
  readonly declaredBody: bigint | null;
  requestBytes: number;
  /** Body frames the caller may still send us. */
  creditIn: number;
  /** Body frames we may still send the caller. */
  creditOut: number;
  responseStarted: boolean;
  responseBytes: number;
}

const MAX_CREDIT = 1024;

export class IhttpRouter {
  private routes: readonly RoutePattern[] = [];
  private readonly streams: Map<string, Stream> = new Map<string, Stream>();
  private readonly lastStream: Map<string, bigint> = new Map<string, bigint>();
  private readonly buckets: Map<string, TokenBucket> = new Map<string, TokenBucket>();

  constructor(private readonly appId: string, private readonly limits: IhttpLimits) {}

  /** The advertised table; an empty one makes every request unrouted. */
  setRoutes(routes: readonly RoutePattern[]): void {
    this.routes = routes;
  }

  get liveStreams(): number {
    return this.streams.size;
  }

  inbound(peer: IhttpPeer, frame: IhttpFrame, now: number): RouterAction[] {
    const kind: IhttpFrame['kind'] = frame.kind;
    if (typeof kind === 'object' && 'RequestHead' in kind) return this.open(peer, frame.stream, kind.RequestHead, now);
    const stream: Stream | undefined = this.streams.get(this.key(peer, frame.stream));
    if (stream === undefined) return [cancelTo(peer, frame.stream, 'unknown_stream')];
    if (kind === 'End') return [{ kind: 'deliver', peer, frame }];
    if ('Cancel' in kind) {
      this.close(stream);
      return [{ kind: 'deliver', peer, frame }];
    }
    if ('Credit' in kind) {
      if (!Number.isInteger(kind.Credit.n) || kind.Credit.n <= 0) return this.abort(stream, 'credit');
      stream.creditOut = Math.min(MAX_CREDIT, stream.creditOut + kind.Credit.n);
      return [{ kind: 'deliver', peer, frame }];
    }
    if ('Body' in kind) return this.body(stream, frame, kind.Body.bytes);
    return this.abort(stream, 'protocol');
  }

  /** The app read one inbound body chunk: grant the caller one more. */
  consumed(peer: IhttpPeer, streamId: bigint): RouterAction[] {
    const stream: Stream | undefined = this.streams.get(this.key(peer, streamId));
    if (stream === undefined) return [];
    stream.creditIn = Math.min(MAX_CREDIT, stream.creditIn + 1);
    return [{ kind: 'reply', peer, frame: { v: 1, stream: streamId, kind: { Credit: { n: 1 } } } }];
  }

  /** A frame the app wants to send back on a stream it is serving. */
  outbound(peer: IhttpPeer, frame: IhttpFrame): OutboundVerdict {
    const stream: Stream | undefined = this.streams.get(this.key(peer, frame.stream));
    if (stream === undefined) return { ok: false, refused: { policy: 'unknown_stream' }, actions: [] };
    const kind: IhttpFrame['kind'] = frame.kind;
    if (kind === 'End') {
      if (!stream.responseStarted) return { ok: false, refused: { policy: 'no_response_head' }, actions: [] };
      this.close(stream);
      return { ok: true };
    }
    if ('Cancel' in kind) {
      this.close(stream);
      return { ok: true };
    }
    if ('ResponseHead' in kind) return this.responseHead(stream, kind.ResponseHead);
    if ('Body' in kind) return this.responseBody(stream, kind.Body.bytes);
    if ('Credit' in kind) return { ok: false, refused: { policy: 'credit_is_granted_by_the_host' }, actions: [] };
    return { ok: false, refused: { policy: 'protocol' }, actions: [] };
  }

  /** Cancels every stream past its deadline, both ways. */
  tick(now: number): RouterAction[] {
    const out: RouterAction[] = [];
    for (const stream of [...this.streams.values()]) if (now >= stream.deadline) out.push(...this.abort(stream, 'timeout'));
    return out;
  }

  private open(peer: IhttpPeer, id: bigint, head: RequestHead, now: number): RouterAction[] {
    const who: string = peerKey(peer);
    const last: bigint | undefined = this.lastStream.get(who);
    if (last !== undefined && id <= last) return [cancelTo(peer, id, 'stream_id')];
    this.lastStream.set(who, id);
    if (!this.bucket(who, now).take(now)) return [cancelTo(peer, id, 'rate')];
    if (head.app_id !== this.appId) return [cancelTo(peer, id, 'wrong_app')];
    const fromPeer: number = [...this.streams.values()].filter((s: Stream) => peerKey(s.peer) === who).length;
    if (fromPeer >= this.limits.maxStreamsPerCaller) return [cancelTo(peer, id, 'caller_concurrency')];
    if (this.streams.size >= this.limits.maxStreamsPerServer) return [cancelTo(peer, id, 'server_concurrency')];
    const bad: string | null = this.headProblem(head);
    if (bad !== null) return [cancelTo(peer, id, bad)];
    if (matchRoute(this.routes, head.method, head.path) === null) return [cancelTo(peer, id, 'unrouted')];
    const streaming: boolean = head.body_len === null;
    const stream: Stream = {
      peer, id, declaredBody: head.body_len, requestBytes: 0,
      // R4.4's initial credit is implicit in both directions: neither side sends Credit{4} first.
      creditIn: this.limits.initialCredit, creditOut: this.limits.initialCredit,
      responseStarted: false, responseBytes: 0,
      deadline: now + (streaming ? this.limits.streamingTimeoutMs : this.limits.streamTimeoutMs),
    };
    this.streams.set(this.key(peer, id), stream);
    return [{ kind: 'deliver', peer, frame: { v: 1, stream: id, kind: { RequestHead: head } } }];
  }

  private body(stream: Stream, frame: IhttpFrame, bytes: Uint8Array): RouterAction[] {
    if (stream.creditIn <= 0) return this.abort(stream, 'credit');
    if (bytes.byteLength > this.limits.maxChunkBytes) return this.abort(stream, 'chunk_too_large');
    const total: number = stream.requestBytes + bytes.byteLength;
    if (total > this.limits.maxRequestBodyBytes) return this.abort(stream, 'request_body_too_large');
    if (stream.declaredBody !== null && BigInt(total) > stream.declaredBody) return this.abort(stream, 'body_longer_than_declared');
    stream.requestBytes = total;
    stream.creditIn -= 1;
    return [{ kind: 'deliver', peer: stream.peer, frame }];
  }

  private responseHead(stream: Stream, head: ResponseHead): OutboundVerdict {
    if (stream.responseStarted) return { ok: false, refused: { policy: 'response_head_sent' }, actions: [] };
    if (!Number.isInteger(head.status) || head.status < 100 || head.status > 599) return { ok: false, refused: { policy: 'status' }, actions: [] };
    if (this.headersProblem(head.headers) !== null) return { ok: false, refused: { limit: 'headers' }, actions: [] };
    if (head.body_len !== null && head.body_len > BigInt(this.limits.maxResponseBodyBytes)) {
      return { ok: false, refused: { limit: 'response_body' }, actions: this.abort(stream, 'response_body_too_large') };
    }
    stream.responseStarted = true;
    return { ok: true };
  }

  private responseBody(stream: Stream, bytes: Uint8Array): OutboundVerdict {
    if (!stream.responseStarted) return { ok: false, refused: { policy: 'no_response_head' }, actions: [] };
    if (bytes.byteLength > this.limits.maxChunkBytes) return { ok: false, refused: { limit: 'chunk' }, actions: [] };
    if (stream.creditOut <= 0) return { ok: false, refused: { limit: 'credit' }, actions: [] };
    const total: number = stream.responseBytes + bytes.byteLength;
    if (total > this.limits.maxResponseBodyBytes) {
      return { ok: false, refused: { limit: 'response_body' }, actions: this.abort(stream, 'response_body_too_large') };
    }
    stream.responseBytes = total;
    stream.creditOut -= 1;
    return { ok: true };
  }

  private headProblem(head: RequestHead): string | null {
    if (!IHTTP_METHODS.has(head.method)) return 'method';
    if (new TextEncoder().encode(head.path + head.query).byteLength > this.limits.maxPathBytes) return 'path_too_long';
    if (head.body_len !== null && head.body_len > BigInt(this.limits.maxRequestBodyBytes)) return 'request_body_too_large';
    return this.headersProblem(head.headers);
  }

  private headersProblem(headers: readonly (readonly [string, string])[]): string | null {
    if (headers.length > this.limits.maxHeaders) return 'too_many_headers';
    const enc: TextEncoder = new TextEncoder();
    const tooBig: boolean = headers.some(([k, v]: readonly [string, string]) => enc.encode(k).byteLength + enc.encode(v).byteLength > this.limits.maxHeaderBytes);
    return tooBig ? 'header_too_large' : null;
  }

  /** Cancels a stream to the caller and tells the app. */
  private abort(stream: Stream, reason: string): RouterAction[] {
    this.close(stream);
    const frame: IhttpFrame = { v: 1, stream: stream.id, kind: { Cancel: { reason } } };
    return [{ kind: 'reply', peer: stream.peer, frame }, { kind: 'deliver', peer: stream.peer, frame }];
  }

  private close(stream: Stream): void {
    this.streams.delete(this.key(stream.peer, stream.id));
  }

  private bucket(who: string, now: number): TokenBucket {
    let b: TokenBucket | undefined = this.buckets.get(who);
    if (b === undefined) {
      b = new TokenBucket(this.limits.requestsPerSecondPerCaller, now);
      this.buckets.set(who, b);
    }
    return b;
  }

  private key(peer: IhttpPeer, id: bigint): string {
    return `${peerKey(peer)}#${id.toString()}`;
  }
}

function cancelTo(peer: IhttpPeer, stream: bigint, reason: string): RouterAction {
  return { kind: 'reply', peer, frame: { v: 1, stream, kind: { Cancel: { reason } } } };
}
