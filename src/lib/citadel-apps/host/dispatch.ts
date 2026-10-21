/**
 * One host call, from the guest's request bytes to CBOR reply bytes: rate limits, size caps, op
 * lookup, argument decoding, the capability check, the ihttp router's gate, then the port. Pure over
 * an injected clock, invoker and router sink. It NEVER throws: every failure is a reply the guest
 * can read, so nothing a port or a hostile request does unwinds into the module.
 *
 * Replies are `{ok: value}` or `{refused: Refused}` (R4.6), serde externally tagged, snake_case.
 */
import type { AbiGroup } from './abi';
import { decodeCbor, encodeCbor, isCborMap, type CborMap, type Decoded } from './cbor';
import type { Capability } from './capabilities';
import { respondArgs } from './ihttp-codec';
import type { IhttpRouter, OutboundVerdict, RouterAction } from './ihttp-router';
import { parseRoutes, type ParsedRoutes } from './ihttp-routes';
import type { HostPolicy } from './limits';
import { findOp, type OpClock, type OpEntry } from './ops';
import type { PortAnswer, PortReply, Refused } from './ports';
import { TokenBucket } from './token-bucket';

export type DispatchOutcome = { readonly now: Uint8Array } | { readonly later: Promise<Uint8Array> };

export interface DispatchClock {
  readonly now: () => number;
  /** Calls `fire` after `ms`; returns the cancel. */
  readonly after: (ms: number, fire: () => void) => () => void;
}

/** Carries an op to its port: directly (tests, the main thread) or across the worker boundary. */
export interface PortInvoker {
  readonly invoke: (entry: OpEntry, args: CborMap) => PortReply | undefined;
}

export interface DispatcherDeps {
  /** The effective grant (intrinsic + installed). */
  readonly granted: ReadonlySet<Capability>;
  readonly policy: HostPolicy;
  readonly clock: DispatchClock;
  readonly invoker: PortInvoker;
  readonly router: IhttpRouter;
  /** Cancels the router decided on while gating a call (sent to callers, told to the app). */
  readonly routerActions: (actions: readonly RouterAction[]) => void;
}

const refused = (why: Refused): Uint8Array => encodeCbor({ refused: why });

export function isPortAnswer(value: unknown): value is PortAnswer {
  if (!isCborMap(value)) return false;
  const keys: string[] = Object.keys(value);
  return keys.length === 1 && (keys[0] === 'ok' || keys[0] === 'refused');
}

export class Dispatcher {
  private readonly hostBucket: TokenBucket;
  private readonly serverBucket: TokenBucket;

  constructor(private readonly deps: DispatcherDeps) {
    const now: number = deps.clock.now();
    this.hostBucket = new TokenBucket(deps.policy.hostCallsPerSecond, now);
    this.serverBucket = new TokenBucket(deps.policy.serverCallsPerSecond, now);
  }

  call(group: AbiGroup, op: number, request: Uint8Array): DispatchOutcome {
    try {
      return this.dispatch(group, op, request);
    } catch {
      return { now: refused({ unavailable: 'host_error' }) };
    }
  }

  private dispatch(group: AbiGroup, op: number, request: Uint8Array): DispatchOutcome {
    const { policy, clock, granted } = this.deps;
    if (!this.hostBucket.take(clock.now())) return { now: refused({ limit: 'host_calls' }) };
    if (request.byteLength > policy.maxRequestBytes) return { now: refused({ limit: 'request_bytes' }) };
    if (group === 'log' && request.byteLength > policy.maxLogBytes) return { now: refused({ limit: 'log_bytes' }) };
    const entry: OpEntry | undefined = findOp(group, op);
    if (entry === undefined) return { now: refused({ policy: 'unknown_op' }) };
    const decoded: Decoded = decodeCbor(request);
    if (!decoded.ok || !isCborMap(decoded.value)) return { now: refused({ policy: 'bad_arguments' }) };
    const args: CborMap = decoded.value;
    const cap: Capability | null = entry.cap(args);
    if (cap === null) return { now: refused({ policy: 'bad_arguments' }) };
    if (!granted.has(cap)) return { now: refused('ungranted') };
    if (entry.server(args) && !this.serverBucket.take(clock.now())) return { now: refused({ limit: 'server_calls' }) };
    const gate: Refused | null = this.ihttpGate(entry, args);
    if (gate !== null) return { now: refused(gate) };
    let reply: PortReply | undefined;
    try {
      reply = this.deps.invoker.invoke(entry, args);
    } catch {
      return { now: refused({ unavailable: 'port_failed' }) };
    }
    if (reply === undefined) return { now: refused({ unavailable: entry.port }) };
    if (!(reply instanceof Promise)) return { now: this.encodeAnswer(reply) };
    return { later: this.bounded(reply, this.timeoutFor(entry.clock)) };
  }

  /** ihttp.serve installs the route table; ihttp.respond must be on a stream the router admitted. */
  private ihttpGate(entry: OpEntry, args: CborMap): Refused | null {
    if (entry.group !== 'ihttp') return null;
    const { router, policy } = this.deps;
    if (entry.name === 'serve') {
      const parsed: ParsedRoutes = parseRoutes(args.routes, policy.ihttp.maxRoutes, policy.ihttp.maxPathBytes);
      if (!parsed.ok) return { policy: 'bad_routes' };
      router.setRoutes(parsed.routes);
      return null;
    }
    if (entry.name === 'respond') {
      const parsed: ReturnType<typeof respondArgs> = respondArgs(args);
      if (parsed === null) return { policy: 'bad_arguments' };
      const verdict: OutboundVerdict = router.outbound(parsed.peer, parsed.frame);
      if (verdict.ok) return null;
      if (verdict.actions.length > 0) this.deps.routerActions(verdict.actions);
      return verdict.refused;
    }
    return null;
  }

  private timeoutFor(clock: OpClock): number {
    const { policy } = this.deps;
    if (clock === 'host_net') return policy.hostNetTimeoutMs;
    if (clock === 'server_net') return policy.serverNetTimeoutMs;
    return policy.portTimeoutMs;
  }

  private bounded(reply: Promise<PortAnswer>, ms: number): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve: (bytes: Uint8Array) => void): void => {
      let settled: boolean = false;
      const settle = (bytes: Uint8Array): void => {
        if (settled) return;
        settled = true;
        cancel();
        resolve(bytes);
      };
      const cancel: () => void = this.deps.clock.after(ms, (): void => settle(refused({ limit: 'timeout' })));
      reply.then(
        (answer: PortAnswer): void => settle(this.encodeAnswer(answer)),
        (): void => settle(refused({ unavailable: 'port_failed' })),
      );
    });
  }

  private encodeAnswer(answer: unknown): Uint8Array {
    if (!isPortAnswer(answer)) return refused({ unavailable: 'port_answer' });
    let bytes: Uint8Array;
    try {
      bytes = encodeCbor(answer);
    } catch {
      return refused({ unavailable: 'port_answer' });
    }
    return bytes.byteLength > this.deps.policy.maxReplyBytes ? refused({ limit: 'reply_bytes' }) : bytes;
  }
}
