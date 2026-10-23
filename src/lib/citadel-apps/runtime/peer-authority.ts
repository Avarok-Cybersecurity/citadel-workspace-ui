/**
 * The serving and calling hosts' authority for P2P (p2p-demo-design §1, check #5): the kernel's
 * `AuthorizePeer`, asked per (peer CID, direction) for this install and held until
 * min(until_ms, now + 60 s), so a revocation takes effect within a minute -- or at once, when an
 * install-change push evicts every answer. A refusal is never held: the next frame asks again.
 * Each peer is rate-limited BEFORE the kernel is asked, so a flood of heads cannot become kernel
 * load. Pure over the injected ask and clock.
 */
import { TokenBucket } from '../host/token-bucket';
import type { PeerDirection } from 'citadel-workspace-client-ts';
import type { PeerAuthorization } from '../member-consent-types';

/** At most this long, whatever the kernel's until_ms says. */
export const AUTHORIZE_CACHE_MS: number = 60_000;

export type AuthorizeAsk = (peerCid: bigint, direction: PeerDirection) => Promise<PeerAuthorization>;

const directionKey = (d: PeerDirection): string =>
  (d === 'Call' ? 'call' : 'Serve' in d ? `serve/${d.Serve.routes_digest}` : `topic/${d.Topic.topic}`);

interface Held {
  readonly answer: Extract<PeerAuthorization, { ok: true }>;
  readonly until: number;
}

export class PeerAuthority {
  private readonly held: Map<string, Held> = new Map<string, Held>();
  private readonly asking: Map<string, Promise<PeerAuthorization>> = new Map<string, Promise<PeerAuthorization>>();
  private readonly buckets: Map<bigint, TokenBucket> = new Map<bigint, TokenBucket>();

  /** `asksPerSecond`: per peer, before the kernel is asked (the manifest's call rate). */
  constructor(private readonly ask: AuthorizeAsk, private readonly nowMs: () => number, private readonly asksPerSecond: number) {}

  /** The kernel's answer for this peer, from the cache while it is fresh. `limited`: the peer is over its rate. */
  authorize(peerCid: bigint, direction: PeerDirection): Promise<PeerAuthorization | 'limited'> {
    const key: string = `${peerCid.toString()}|${directionKey(direction)}`;
    const now: number = this.nowMs();
    const cached: Held | undefined = this.held.get(key);
    if (cached !== undefined && now < cached.until) return Promise.resolve(cached.answer);
    this.held.delete(key);
    const pending: Promise<PeerAuthorization> | undefined = this.asking.get(key);
    if (pending !== undefined) return pending;
    if (!this.bucket(peerCid, now).take(now)) return Promise.resolve('limited');
    const asked: Promise<PeerAuthorization> = this.ask(peerCid, direction).then(
      (answer: PeerAuthorization): PeerAuthorization => {
        if (this.asking.get(key) === asked) this.asking.delete(key);
        if (answer.ok) this.held.set(key, { answer, until: Math.min(Number(answer.untilMs), this.nowMs() + AUTHORIZE_CACHE_MS) });
        return answer;
      },
      (): PeerAuthorization => {
        if (this.asking.get(key) === asked) this.asking.delete(key);
        return { ok: false };
      },
    );
    this.asking.set(key, asked);
    return asked;
  }

  /** An install or app change was pushed: nothing held is trusted any more. */
  evictAll(): void {
    this.held.clear();
    this.asking.clear();
  }

  private bucket(peerCid: bigint, now: number): TokenBucket {
    let b: TokenBucket | undefined = this.buckets.get(peerCid);
    if (b === undefined) {
      b = new TokenBucket(this.asksPerSecond, now);
      this.buckets.set(peerCid, b);
    }
    return b;
  }
}
