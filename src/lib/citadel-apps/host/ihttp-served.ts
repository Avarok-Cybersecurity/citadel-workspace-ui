/**
 * Streams this instance SERVES (a peer called it). Admits advertised routes under this app's id
 * only, monotonic stream ids per caller, 30 requests/s per caller, 8 live streams per caller and 64
 * per server, head limits, the 4 MiB request and 16 MiB response bodies, 64 KiB chunks, credit
 * both ways (R4.4's initial credit is implicit on both sides) and deadlines.
 */
import type { Caller } from '../sdk/generated/Caller';
import type { IhttpFrame } from '../sdk/generated/IhttpFrame';
import type { RequestHead } from '../sdk/generated/RequestHead';
import type { ResponseHead } from '../sdk/generated/ResponseHead';
import type { ServeOn } from '../sdk/generated/ServeOn';
import { abortBoth, allow, cancel, CLOSED_REASON, deny, frame, headersProblem, MAX_CREDIT, peerKey, requestHeadProblem, type ClosingAction, type RouterAction, type Verdict } from './ihttp-common';
import { servesVia } from './ihttp-planes';
import { matchRoute, type RoutePattern } from './ihttp-routes';
import type { IhttpLimits } from './limits';
import { TokenBucket } from './token-bucket';

interface Served {
  readonly peer: Caller;
  readonly id: bigint;
  readonly deadline: number;
  readonly declaredBody: bigint | null;
  requestBytes: number;
  creditIn: number;
  creditOut: number;
  responseStarted: boolean;
  responseBytes: number;
}

export const servedKey = (peer: Caller, id: bigint): string => `${peerKey(peer)}#${id.toString()}`;

export class ServedStreams {
  routes: readonly RoutePattern[] = [];
  /** Serving nothing until IhttpServe says on which planes. */
  planes: ServeOn = { relay: false, p2p: false };
  private readonly streams: Map<string, Served> = new Map<string, Served>();
  private readonly lastStream: Map<string, bigint> = new Map<string, bigint>();
  private readonly buckets: Map<string, TokenBucket> = new Map<string, TokenBucket>();

  constructor(private readonly appId: string, private readonly limits: IhttpLimits) {}

  get size(): number {
    return this.streams.size;
  }

  has(peer: Caller, id: bigint): boolean {
    return this.streams.has(servedKey(peer, id));
  }

  /** Whether any caller from `appId` has stream `id` open with us (the collision check). */
  usesId(appId: string, id: bigint): boolean {
    return [...this.streams.values()].some((s: Served) => s.peer.app_id === appId && s.id === id);
  }

  open(peer: Caller, id: bigint, head: RequestHead, now: number): RouterAction[] {
    const who: string = peerKey(peer);
    const last: bigint | undefined = this.lastStream.get(who);
    if (last !== undefined && id <= last) return [cancel(peer, id, 'stream_id')];
    this.lastStream.set(who, id);
    if (!this.bucket(who, now).take(now)) return [cancel(peer, id, 'rate')];
    if (head.app_id !== this.appId) return [cancel(peer, id, 'wrong_app')];
    const fromPeer: number = [...this.streams.values()].filter((s: Served) => peerKey(s.peer) === who).length;
    if (fromPeer >= this.limits.maxStreamsPerCaller) return [cancel(peer, id, 'caller_concurrency')];
    if (this.streams.size >= this.limits.maxStreamsPerServer) return [cancel(peer, id, 'server_concurrency')];
    const bad: string | null = requestHeadProblem(head, this.limits);
    if (bad !== null) return [cancel(peer, id, bad)];
    // A plane the app does not serve on looks exactly like a route it does not have.
    if (!servesVia(this.planes, peer.via) || matchRoute(this.routes, head.method, head.path) === null) return [cancel(peer, id, 'unrouted')];
    this.streams.set(servedKey(peer, id), {
      peer, id, declaredBody: head.body_len, requestBytes: 0,
      creditIn: this.limits.initialCredit, creditOut: this.limits.initialCredit, responseStarted: false, responseBytes: 0,
      deadline: now + (head.body_len === null ? this.limits.streamingTimeoutMs : this.limits.streamTimeoutMs),
    });
    return [{ kind: 'deliver', peer, frame: frame(id, { RequestHead: head }) }];
  }

  /** A non-head frame from the caller on a stream it opened. */
  inbound(peer: Caller, f: IhttpFrame): RouterAction[] {
    const s: Served = this.streams.get(servedKey(peer, f.stream)) as Served;
    const kind: IhttpFrame['kind'] = f.kind;
    if (kind === 'End') return [{ kind: 'deliver', peer, frame: f }];
    if ('Cancel' in kind) {
      this.streams.delete(servedKey(peer, f.stream));
      return [{ kind: 'deliver', peer, frame: f }];
    }
    if ('Credit' in kind) {
      if (kind.Credit.n <= 0) return this.abort(s, 'credit');
      s.creditOut = Math.min(MAX_CREDIT, s.creditOut + kind.Credit.n);
      return [{ kind: 'deliver', peer, frame: f }];
    }
    if (!('Body' in kind)) return this.abort(s, 'protocol');
    const bytes: number = kind.Body.bytes.byteLength;
    if (s.creditIn <= 0) return this.abort(s, 'credit');
    if (bytes > this.limits.maxChunkBytes) return this.abort(s, 'chunk_too_large');
    const total: number = s.requestBytes + bytes;
    if (total > this.limits.maxRequestBodyBytes) return this.abort(s, 'request_body_too_large');
    if (s.declaredBody !== null && BigInt(total) > s.declaredBody) return this.abort(s, 'body_longer_than_declared');
    s.requestBytes = total;
    s.creditIn -= 1;
    return [{ kind: 'deliver', peer, frame: f }];
  }

  /** The app's frame back to its caller (IhttpRespond). */
  respond(peer: Caller, f: IhttpFrame): Verdict {
    const s: Served | undefined = this.streams.get(servedKey(peer, f.stream));
    if (s === undefined) return deny({ policy: 'unknown_stream' }, []);
    const kind: IhttpFrame['kind'] = f.kind;
    if (kind === 'End') {
      if (!s.responseStarted) return deny({ policy: 'no_response_head' }, []);
      this.streams.delete(servedKey(peer, f.stream));
      return allow([]);
    }
    if ('Cancel' in kind) {
      this.streams.delete(servedKey(peer, f.stream));
      return allow([]);
    }
    if ('ResponseHead' in kind) return this.responseHead(s, kind.ResponseHead);
    if ('Body' in kind) return this.responseBody(s, kind.Body.bytes.byteLength);
    if ('Credit' in kind) return deny({ policy: 'credit_is_granted_by_the_host' }, []);
    return deny({ policy: 'protocol' }, []);
  }

  /** The app read one request chunk: one more credit to the caller. */
  consumed(peer: Caller, id: bigint): RouterAction[] {
    const s: Served = this.streams.get(servedKey(peer, id)) as Served;
    s.creditIn = Math.min(MAX_CREDIT, s.creditIn + 1);
    return [{ kind: 'reply', peer, frame: frame(id, { Credit: { n: 1 } }) }];
  }

  tick(now: number): RouterAction[] {
    return [...this.streams.values()].filter((s: Served) => now >= s.deadline).flatMap((s: Served) => this.abort(s, 'timeout'));
  }

  private responseHead(s: Served, head: ResponseHead): Verdict {
    if (s.responseStarted) return deny({ policy: 'response_head_sent' }, []);
    if (head.status < 100 || head.status > 599) return deny({ policy: 'status' }, []);
    if (headersProblem(head.headers, this.limits) !== null) return deny({ limit: 'headers' }, []);
    if (head.body_len !== null && head.body_len > BigInt(this.limits.maxResponseBodyBytes)) {
      return deny({ limit: 'response_body' }, this.abort(s, 'response_body_too_large'));
    }
    s.responseStarted = true;
    return allow([]);
  }

  private responseBody(s: Served, bytes: number): Verdict {
    if (!s.responseStarted) return deny({ policy: 'no_response_head' }, []);
    if (bytes > this.limits.maxChunkBytes) return deny({ limit: 'chunk' }, []);
    if (s.creditOut <= 0) return deny({ limit: 'credit' }, []);
    const total: number = s.responseBytes + bytes;
    if (total > this.limits.maxResponseBodyBytes) return deny({ limit: 'response_body' }, this.abort(s, 'response_body_too_large'));
    s.responseBytes = total;
    s.creditOut -= 1;
    return allow([]);
  }

  /** The instance is closing: every caller is told, and nothing is served any more. */
  closeAll(): ClosingAction[] {
    const out: ClosingAction[] = [...this.streams.values()].map((s: Served): ClosingAction =>
      ({ kind: 'reply', peer: s.peer, frame: frame(s.id, { Cancel: { reason: CLOSED_REASON } }) }));
    this.streams.clear();
    this.routes = [];
    return out;
  }

  private abort(s: Served, reason: string): RouterAction[] {
    this.streams.delete(servedKey(s.peer, s.id));
    return abortBoth(s.peer, s.id, reason);
  }

  private bucket(who: string, now: number): TokenBucket {
    let b: TokenBucket | undefined = this.buckets.get(who);
    if (b === undefined) {
      b = new TokenBucket(this.limits.requestsPerSecondPerCaller, now);
      this.buckets.set(who, b);
    }
    return b;
  }
}
