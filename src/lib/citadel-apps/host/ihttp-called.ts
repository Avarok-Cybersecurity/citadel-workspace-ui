/**
 * Streams this instance OPENED as a client (IhttpCall). Keyed by (target app id, stream id), as
 * the guest SDK keys them. Outbound: monotonic ids, head limits, the 4 MiB request body under the
 * server's credit, 64 KiB chunks, 8 live calls. Inbound: one response head, the 16 MiB response
 * body under the credit the app grants back (IhttpConsumed), from the one server that answered.
 */
import type { Address } from '../sdk/generated/Address';
import type { Caller } from '../sdk/generated/Caller';
import type { IhttpFrame } from '../sdk/generated/IhttpFrame';
import type { ResponseHead } from '../sdk/generated/ResponseHead';
import { abortBoth, allow, cancel, deny, frame, headersProblem, MAX_CREDIT, peerKey, requestHeadProblem, type RouterAction, type Verdict } from './ihttp-common';
import type { IhttpLimits } from './limits';

interface Called {
  readonly appId: string;
  readonly id: bigint;
  readonly deadline: number;
  /** The server, as the session named it in its first frame back; null until then. */
  server: Caller | null;
  requestBytes: number;
  /** Request body frames we may still send. */
  creditOut: number;
  /** Response body frames the server may still send. */
  creditIn: number;
  responseStarted: boolean;
  responseBytes: number;
}

export const addressApp = (to: Address): string => ('user' in to ? to.user.app_id : to.scope.app_id);
const calledKey = (appId: string, id: bigint): string => `${appId}#${id.toString()}`;

export class CalledStreams {
  private readonly streams: Map<string, Called> = new Map<string, Called>();
  private last: bigint = -1n;

  constructor(private readonly limits: IhttpLimits) {}

  get size(): number {
    return this.streams.size;
  }

  has(appId: string, id: bigint): boolean {
    return this.streams.has(calledKey(appId, id));
  }

  /** A frame the app sends on a call: `idInUse` says whether a served stream already holds the id. */
  outbound(to: Address, f: IhttpFrame, now: number, idInUse: boolean): Verdict {
    const appId: string = addressApp(to);
    const kind: IhttpFrame['kind'] = f.kind;
    if (typeof kind === 'object' && 'RequestHead' in kind) {
      if (f.stream <= this.last) return deny({ policy: 'stream_id' }, []);
      if (idInUse) return deny({ policy: 'stream_id_in_use' }, []);
      if (kind.RequestHead.app_id !== appId) return deny({ policy: 'wrong_app' }, []);
      if (this.streams.size >= this.limits.maxStreamsPerCaller) return deny({ limit: 'calls' }, []);
      const bad: string | null = requestHeadProblem(kind.RequestHead, this.limits);
      if (bad !== null) return deny({ limit: bad }, []);
      this.last = f.stream;
      this.streams.set(calledKey(appId, f.stream), {
        appId, id: f.stream, server: null, requestBytes: 0, responseStarted: false, responseBytes: 0,
        creditOut: this.limits.initialCredit, creditIn: this.limits.initialCredit,
        deadline: now + (kind.RequestHead.body_len === null ? this.limits.streamingTimeoutMs : this.limits.streamTimeoutMs),
      });
      return allow([]);
    }
    const c: Called | undefined = this.streams.get(calledKey(appId, f.stream));
    if (c === undefined) return deny({ policy: 'unknown_stream' }, []);
    if (kind === 'End') return allow([]);
    if ('Cancel' in kind) {
      this.streams.delete(calledKey(appId, f.stream));
      return allow([]);
    }
    // The server's credit for our response is minted by the host from IhttpConsumed, never sent by the app.
    if ('Credit' in kind) return deny({ policy: 'credit_is_granted_by_the_host' }, []);
    if (!('Body' in kind)) return deny({ policy: 'protocol' }, []);
    const bytes: number = kind.Body.bytes.byteLength;
    if (bytes > this.limits.maxChunkBytes) return deny({ limit: 'chunk' }, []);
    if (c.creditOut <= 0) return deny({ limit: 'credit' }, []);
    if (c.requestBytes + bytes > this.limits.maxRequestBodyBytes) return deny({ limit: 'request_body' }, []);
    c.requestBytes += bytes;
    c.creditOut -= 1;
    return allow([]);
  }

  /** A frame from the server on a call this instance made. */
  inbound(peer: Caller, f: IhttpFrame): RouterAction[] {
    const c: Called = this.streams.get(calledKey(peer.app_id, f.stream)) as Called;
    if (c.server === null) c.server = peer;
    else if (peerKey(c.server) !== peerKey(peer)) return [cancel(peer, f.stream, 'unknown_stream')];
    const kind: IhttpFrame['kind'] = f.kind;
    const deliver: RouterAction[] = [{ kind: 'deliver', peer, frame: f }];
    if (kind === 'End' || (typeof kind === 'object' && 'Cancel' in kind)) {
      this.streams.delete(calledKey(c.appId, c.id));
      return deliver;
    }
    if ('Credit' in kind) {
      if (kind.Credit.n <= 0) return this.abort(c, peer, 'credit');
      c.creditOut = Math.min(MAX_CREDIT, c.creditOut + kind.Credit.n);
      return deliver;
    }
    if ('ResponseHead' in kind) {
      const head: ResponseHead = kind.ResponseHead;
      if (c.responseStarted || headersProblem(head.headers, this.limits) !== null) return this.abort(c, peer, 'protocol');
      if (head.body_len !== null && head.body_len > BigInt(this.limits.maxResponseBodyBytes)) return this.abort(c, peer, 'response_body_too_large');
      c.responseStarted = true;
      return deliver;
    }
    if (!('Body' in kind) || !c.responseStarted) return this.abort(c, peer, 'protocol');
    const bytes: number = kind.Body.bytes.byteLength;
    if (c.creditIn <= 0) return this.abort(c, peer, 'credit');
    if (bytes > this.limits.maxChunkBytes) return this.abort(c, peer, 'chunk_too_large');
    if (c.responseBytes + bytes > this.limits.maxResponseBodyBytes) return this.abort(c, peer, 'response_body_too_large');
    c.responseBytes += bytes;
    c.creditIn -= 1;
    return deliver;
  }

  /** The app read one response chunk: one more credit to the server. Null: not a call of ours. */
  consumed(peer: Caller, id: bigint): RouterAction[] | null {
    const c: Called | undefined = this.streams.get(calledKey(peer.app_id, id));
    if (c === undefined || c.server === null || peerKey(c.server) !== peerKey(peer)) return null;
    c.creditIn = Math.min(MAX_CREDIT, c.creditIn + 1);
    return [{ kind: 'reply', peer, frame: frame(id, { Credit: { n: 1 } }) }];
  }

  tick(now: number): RouterAction[] {
    const out: RouterAction[] = [];
    for (const c of [...this.streams.values()]) {
      if (now < c.deadline) continue;
      this.streams.delete(calledKey(c.appId, c.id));
      if (c.server !== null) out.push(...abortBoth(c.server, c.id, 'timeout'));
    }
    return out;
  }

  private abort(c: Called, peer: Caller, reason: string): RouterAction[] {
    this.streams.delete(calledKey(c.appId, c.id));
    return abortBoth(peer, c.id, reason);
  }
}
