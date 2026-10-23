/**
 * PreferP2pThenRelay (owner decision OD10): a stream picks its plane at its RequestHead, falls
 * back to the relay only when P2P refused before any frame reached the peer and only when the
 * relay is held, and never switches after. The two planes are recording fakes of IhttpPort, the
 * router's only I/O; the router under test is the production one.
 */
import { describe, expect, it } from 'vitest';
import type { Capability } from '../../host/capabilities';
import type { IhttpPort, InboundIhttpFrame, PortAnswer } from '../../host/ports';
import type { Address } from '../../sdk/generated/Address';
import type { Caller } from '../../sdk/generated/Caller';
import type { IhttpFrame } from '../../sdk/generated/IhttpFrame';
import type { Transport } from '../../sdk/generated/Transport';
import { transportRouter } from '../ihttp-transport-router';

const APP: string = 'net.avarok.compute-pool';
const to: Address = { user: { app_id: APP, username: 'bob' } };
const head = (stream: bigint): IhttpFrame => ({ v: 1, stream, kind: { RequestHead: { method: 'POST', path: '/job/primes', query: '', headers: [], body_len: 0n, app_id: APP, scope_key: 'ws' } } });
const end = (stream: bigint): IhttpFrame => ({ v: 1, stream, kind: 'End' });

interface Plane { port: IhttpPort; sent: bigint[]; answer: PortAnswer<null>; inbound: (i: InboundIhttpFrame) => void }

function plane(): Plane {
  const p: Plane = { sent: [], answer: { ok: null }, inbound: () => undefined, port: undefined as unknown as IhttpPort };
  p.port = {
    IhttpServe: async (): Promise<PortAnswer<null>> => ({ ok: null }),
    IhttpCall: async ({ frame }): Promise<PortAnswer<null>> => { p.sent.push(frame.stream); return p.answer; },
    respond: async (_peer: Caller, f: IhttpFrame): Promise<PortAnswer<null>> => { p.sent.push(f.stream); return { ok: null }; },
    onFrame: (l): (() => void) => { p.inbound = l; return (): void => undefined; },
  };
  return p;
}

interface Rig { relay: Plane; p2p: Plane; call: (t: Transport, f: IhttpFrame) => Promise<PortAnswer<null>>; router: IhttpPort }

const rig = (held: Capability[]): Rig => {
  const relay: Plane = plane();
  const p2p: Plane = plane();
  const router: IhttpPort = transportRouter({ relay: relay.port, p2p: p2p.port, held: new Set<Capability>(held) });
  return { relay, p2p, router, call: async (transport: Transport, frame: IhttpFrame) => router.IhttpCall({ to, frame, transport }) };
};

describe('a stream keeps the plane it opened on', () => {
  it('prefer opens on P2P and every later frame follows it', async () => {
    const r: Rig = rig(['ihttp.p2p.call', 'ihttp.call']);
    expect(await r.call('prefer_p2p_then_relay', head(1n))).toEqual({ ok: null });
    expect(await r.call('prefer_p2p_then_relay', end(1n))).toEqual({ ok: null });
    expect([r.p2p.sent, r.relay.sent]).toEqual([[1n, 1n], []]);
  });

  it('falls back to the relay when P2P refused before opening, and stays there', async () => {
    const r: Rig = rig(['ihttp.p2p.call', 'ihttp.call']);
    r.p2p.answer = { refused: { unavailable: 'p2p_not_advertised' } };
    expect(await r.call('prefer_p2p_then_relay', head(1n))).toEqual({ ok: null });
    r.p2p.answer = { ok: null };
    expect(await r.call('prefer_p2p_then_relay', end(1n))).toEqual({ ok: null });
    expect([r.p2p.sent, r.relay.sent]).toEqual([[1n], [1n, 1n]]);
  });

  it('without the relay capability it answers unavailable:p2p and sends nothing on the relay', async () => {
    const r: Rig = rig(['ihttp.p2p.call']);
    r.p2p.answer = { refused: { unavailable: 'refused' } };
    expect(await r.call('prefer_p2p_then_relay', head(1n))).toEqual({ refused: { unavailable: 'p2p' } });
    expect(r.relay.sent).toEqual([]);
  });

  it('a refusal after the frame reached the peer is not a reason to fall back', async () => {
    const r: Rig = rig(['ihttp.p2p.call', 'ihttp.call']);
    r.p2p.answer = { refused: { unavailable: 'p2p_queue' } };
    expect(await r.call('prefer_p2p_then_relay', head(1n))).toEqual({ refused: { unavailable: 'p2p_queue' } });
    expect(r.relay.sent).toEqual([]);
  });

  it('an explicit p2p call never falls back, and an explicit relay call never touches P2P', async () => {
    const r: Rig = rig(['ihttp.p2p.call', 'ihttp.call']);
    r.p2p.answer = { refused: { unavailable: 'refused' } };
    expect(await r.call('p2p', head(1n))).toEqual({ refused: { unavailable: 'refused' } });
    expect(await r.call('relay', head(2n))).toEqual({ ok: null });
    expect([r.p2p.sent, r.relay.sent]).toEqual([[1n], [2n]]);
  });

  it('prefer with only the relay held goes straight to the relay; neither held is ungranted', async () => {
    const r: Rig = rig(['ihttp.call']);
    expect(await r.call('prefer_p2p_then_relay', head(1n))).toEqual({ ok: null });
    expect([r.p2p.sent, r.relay.sent]).toEqual([[], [1n]]);
    expect(await rig([]).call('prefer_p2p_then_relay', head(1n))).toEqual({ refused: 'ungranted' });
  });

  it('a frame on a stream no head opened is refused, and a response goes back the way it came', async () => {
    const r: Rig = rig(['ihttp.p2p.call', 'ihttp.call']);
    expect(await r.call('p2p', end(9n))).toEqual({ refused: { policy: 'unknown_stream' } });
    const caller: Caller = { username: 'carol', cid: 3n, app_id: APP, install_id: 'i', via: 'p2p' };
    await r.router.respond(caller, end(4n));
    await r.router.respond({ ...caller, via: 'relay' }, end(5n));
    expect([r.p2p.sent, r.relay.sent]).toEqual([[4n], [5n]]);
  });
});
