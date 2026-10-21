/**
 * The dispatcher's guards over fake ports. Each refusal has its control: the same call passing
 * once the guard's condition is not met.
 */
import { describe, expect, it } from 'vitest';
import { decodeCbor, encodeCbor } from '../cbor';
import type { Capability } from '../capabilities';
import { Dispatcher, type DispatchOutcome } from '../dispatch';
import { IhttpRouter } from '../ihttp-router';
import { directInvoker } from '../invoker';
import { STANDARD_HOST_POLICY, type HostPolicy } from '../limits';
import type { HostPorts, PortAnswer } from '../ports';
import { fakeLog, fakeNodes, fakeStorage, fakeUi, ManualClock, type Recorder } from './fakes';

interface Rig {
  readonly d: Dispatcher;
  readonly rec: Recorder;
  readonly clock: ManualClock;
}

function rig(granted: readonly Capability[], ports: (rec: Recorder) => HostPorts, policy: Partial<HostPolicy> = {}): Rig {
  const rec: Recorder = { calls: [] };
  const clock: ManualClock = new ManualClock();
  const p: HostPolicy = { ...STANDARD_HOST_POLICY, ...policy };
  const d: Dispatcher = new Dispatcher({
    granted: new Set<Capability>(['canvas', 'ui', 'events', 'navigate', 'log', ...granted]),
    policy: p, clock, invoker: directInvoker(ports(rec)), router: new IhttpRouter('com.acme.app', p.ihttp), routerActions: (): void => {},
  });
  return { d, rec, clock };
}

const req = (value: unknown): Uint8Array => encodeCbor(value);

async function answer(outcome: DispatchOutcome): Promise<unknown> {
  const bytes: Uint8Array = 'now' in outcome ? outcome.now : await outcome.later;
  const decoded = decodeCbor(bytes);
  if (!decoded.ok) throw new Error('reply is not CBOR');
  return decoded.value;
}

const all = (rec: Recorder): HostPorts => ({ nodes: fakeNodes(rec), storage: fakeStorage(rec), ui: fakeUi(rec), log: fakeLog(rec) });

describe('capabilities', () => {
  it('an op whose capability is not granted is ungranted, inside an open group (control: the granted op)', async () => {
    const { d, rec } = rig(['nodes.read'], all);
    expect(await answer(d.call('nodes', 3, req({ parent: 'n1', name: 'x' })))).toEqual({ refused: 'ungranted' });
    expect(rec.calls).toEqual([]);
    expect(await answer(d.call('nodes', 1, req({ id: 'n1' })))).toEqual({ ok: { id: 'n1', name: 'Board' } });
    expect(rec.calls.map((c) => c.method)).toEqual(['nodes.read']);
  });

  it('storage is gated per backend', async () => {
    const { d, rec } = rig(['storage.user'], all);
    expect(await answer(d.call('storage', 1, req({ backend: 'scope', key: 'k' })))).toEqual({ refused: 'ungranted' });
    expect(await answer(d.call('storage', 1, req({ key: 'k' })))).toEqual({ refused: { policy: 'bad_arguments' } });
    expect(await answer(d.call('storage', 1, req({ backend: 'user', key: 'k' })))).toEqual({ ok: null });
    expect(rec.calls.length).toBe(1);
  });

  it('a port that is not injected answers unavailable (control: injected answers)', async () => {
    expect(await answer(rig(['nodes.read'], () => ({})).d.call('nodes', 1, req({ id: 'n1' })))).toEqual({ refused: { unavailable: 'nodes' } });
    expect(await answer(rig(['nodes.read'], all).d.call('nodes', 1, req({ id: 'n1' })))).toMatchObject({ ok: {} });
  });
});

describe('rate limits', () => {
  it('the 201st host call within a second is refused; the 200th and a call a second later pass', async () => {
    const { d, clock } = rig([], all);
    for (let i: number = 0; i < 200; i++) expect(await answer(d.call('log', 1, req({ level: 'info', text: `${i}` })))).toEqual({ ok: null });
    expect(await answer(d.call('log', 1, req({ level: 'info', text: 'over' })))).toEqual({ refused: { limit: 'host_calls' } });
    clock.advance(1000);
    expect(await answer(d.call('log', 1, req({ level: 'info', text: 'later' })))).toEqual({ ok: null });
  });

  it('the 21st server call within a second is refused while host-only calls still pass', async () => {
    const { d } = rig(['nodes.read'], all);
    for (let i: number = 0; i < 20; i++) expect(await answer(d.call('nodes', 1, req({ id: 'n1' })))).toMatchObject({ ok: {} });
    expect(await answer(d.call('nodes', 1, req({ id: 'n1' })))).toEqual({ refused: { limit: 'server_calls' } });
    expect(await answer(d.call('ui', 4, req({ text: 'hi' })))).toEqual({ ok: null });
  });

  it('storage.local does not spend the server bucket', async () => {
    const { d } = rig(['storage.local'], all);
    for (let i: number = 0; i < 25; i++) expect(await answer(d.call('storage', 1, req({ backend: 'local', key: 'k' })))).toEqual({ ok: null });
  });
});

describe('size caps and malformed requests', () => {
  it('requests over the cap, logs over the log cap, and replies over the reply cap are refused', async () => {
    const big: HostPorts = { ui: { ...fakeUi({ calls: [] }), toast: (): PortAnswer => ({ ok: 'x'.repeat(200) }) } };
    const { d } = rig([], () => big, { maxRequestBytes: 64, maxLogBytes: 16, maxReplyBytes: 100 });
    expect(await answer(d.call('ui', 1, new Uint8Array(65)))).toEqual({ refused: { limit: 'request_bytes' } });
    expect(await answer(d.call('log', 1, req({ level: 'info', text: 'x'.repeat(20) })))).toEqual({ refused: { limit: 'log_bytes' } });
    expect(await answer(d.call('ui', 4, req({})))).toEqual({ refused: { limit: 'reply_bytes' } });
  });

  it('bytes that are not CBOR, a CBOR non-map and an unknown op are refused', async () => {
    const { d } = rig([], all);
    expect(await answer(d.call('ui', 4, Uint8Array.of(0xff, 0x00)))).toEqual({ refused: { policy: 'bad_arguments' } });
    expect(await answer(d.call('ui', 4, req([1, 2])))).toEqual({ refused: { policy: 'bad_arguments' } });
    expect(await answer(d.call('ui', 99, req({})))).toEqual({ refused: { policy: 'unknown_op' } });
  });
});

describe('ports that misbehave never reach the guest as exceptions', () => {
  const ui = (toast: () => never | Promise<PortAnswer> | unknown): HostPorts => ({ ui: { ...fakeUi({ calls: [] }), toast: toast as () => PortAnswer } });

  it('a port that throws, rejects or answers garbage is refused', async () => {
    expect(await answer(rig([], () => ui(() => { throw new Error('boom'); })).d.call('ui', 4, req({})))).toEqual({ refused: { unavailable: 'port_failed' } });
    expect(await answer(rig([], () => ui(() => Promise.reject(new Error('no')))).d.call('ui', 4, req({})))).toEqual({ refused: { unavailable: 'port_failed' } });
    expect(await answer(rig([], () => ui(() => ({ hello: 1 }))).d.call('ui', 4, req({})))).toEqual({ refused: { unavailable: 'port_answer' } });
  });

  it('a port that never answers times out on its own clock; network calls have a longer one', async () => {
    const never = (): Promise<PortAnswer> => new Promise<PortAnswer>(() => {});
    const r: Rig = rig(['nodes.read', 'net.host'], () => ({ nodes: { ...fakeNodes({ calls: [] }), read: never }, hostNet: { fetch: never } }));
    const nodes: DispatchOutcome = r.d.call('nodes', 1, req({ id: 'n1' }));
    const net: DispatchOutcome = r.d.call('net', 1, req({ url: 'https://api.acme.com/' }));
    let netDone: boolean = false;
    if ('later' in net) void net.later.then(() => { netDone = true; });
    r.clock.advance(STANDARD_HOST_POLICY.portTimeoutMs);
    expect(await answer(nodes)).toEqual({ refused: { limit: 'timeout' } });
    await Promise.resolve();
    expect(netDone).toBe(false);
    r.clock.advance(STANDARD_HOST_POLICY.hostNetTimeoutMs);
    expect(await answer(net)).toEqual({ refused: { limit: 'timeout' } });
  });
});

describe('navigate: internal links only', () => {
  const opened: string[] = [];
  const nav = (): HostPorts => ({ navigate: { currentUrl: () => 'https://work.avarok.net/workspace', open: (to: string): PortAnswer => { opened.push(to); return { ok: null }; } } });

  it('opens a same-origin link as a router path and refuses everything else', async () => {
    const { d } = rig([], nav);
    expect(await answer(d.call('navigate', 1, req({ href: '/workspace?nodeId=7' })))).toEqual({ ok: null });
    expect(await answer(d.call('navigate', 1, req({ href: 'https://work.avarok.net/workspace?nodeId=8' })))).toEqual({ ok: null });
    for (const href of ['https://evil.example/', 'javascript:alert(1)', 'mailto:a@b.c', 'data:text/html,x']) {
      expect(await answer(d.call('navigate', 1, req({ href })))).toEqual({ refused: { policy: 'not_an_internal_link' } });
    }
    expect(opened).toEqual(['/workspace?nodeId=7', '/workspace?nodeId=8']);
  });
});

describe('ihttp gate', () => {
  it('serve refuses a malformed route table; respond refuses a stream nobody opened', async () => {
    const ihttp: HostPorts = { ihttp: { advertise: (): PortAnswer => ({ ok: null }), respond: (): PortAnswer => ({ ok: null }), call: (): PortAnswer => ({ ok: null }), onFrame: () => () => {} } };
    const { d } = rig(['ihttp.serve'], () => ihttp);
    expect(await answer(d.call('ihttp', 1, req({ routes: [{ method: 'GET', path: 'nope' }] })))).toEqual({ refused: { policy: 'bad_routes' } });
    expect(await answer(d.call('ihttp', 1, req({ routes: [{ method: 'GET', path: '/cards/:id' }] })))).toEqual({ ok: null });
    const peer = { username: 'bob', cid: 5, app_id: 'com.acme.app', install_id: 'i', via: 'p2p' };
    const frame = { v: 1, stream: 1, kind: { ResponseHead: { status: 200, headers: [], body_len: null } } };
    expect(await answer(d.call('ihttp', 2, req({ peer, frame })))).toEqual({ refused: { policy: 'unknown_stream' } });
    expect(await answer(d.call('ihttp', 3, req({})))).toEqual({ refused: 'ungranted' });
  });
});
