/**
 * Internal HTTP through a whole instance: the guest advertises a route in app_init, inbound frames
 * arrive from the IhttpPort, the worker's router admits the advertised route to the guest and
 * answers an unadvertised one with Cancel through IhttpPort.respond.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { encodeCbor } from '../cbor';
import type { Capability } from '../capabilities';
import type { IhttpFrame, IhttpPeer } from '../ihttp-types';
import { inspectArtifact, type LoadVerdict } from '../inspect';
import { launchAppInstance, type AppInstance } from '../instance';
import { InstanceSlots } from '../instance-slots';
import { STANDARD_HOST_POLICY } from '../limits';
import type { HostPorts, InboundIhttpFrame, PortAnswer } from '../ports';
import { appModule, callGroup, importIndex, type AppModuleOptions } from './app-fixtures';
import { fakeUi, type Recorder } from './fakes';
import { inProcess, realClock, until, type InProcess } from './in-process';
import { op } from './wasm-builder';

const APP = 'com.acme.board';
const ROUTES_AT = 256;
const routes: Uint8Array = encodeCbor({ routes: [{ method: 'GET', path: '/cards/:id' }] });

/** init: ihttp.serve(routes). event: anything longer than 60 bytes is forwarded to ui.toast. */
function server(): Uint8Array {
  const base: AppModuleOptions = { groups: ['ihttp', 'ui'] };
  const init: number[] = [...callGroup(base, 'ihttp', 1, ROUTES_AT, routes.byteLength), ...op.i32(0)];
  const toUi: number[] = [...op.i32(4), ...op.localGet(0), ...op.localGet(1), ...op.call(importIndex(base, 'ui')), ...op.drop];
  const event: number[] = [...op.localGet(1), ...op.i32(60), 0x4b, 0x04, 0x40, ...toUi, 0x0b];
  return appModule({ ...base, init, event, data: [{ offset: ROUTES_AT, bytes: routes }] });
}

const peer: IhttpPeer = { username: 'bob', cid: 42n, app_id: APP, install_id: 'i-bob', via: 'p2p' };
const request = (stream: bigint, path: string): IhttpFrame => ({
  v: 1, stream, kind: { RequestHead: { method: 'GET', path, query: '', headers: [], body_len: 0n, app_id: APP, scope_key: 'ws' } },
});

let rig: InProcess | null = null;
afterEach(() => rig?.close());

describe('ihttp through an instance', () => {
  it('an unadvertised route is cancelled back to the caller; the advertised one reaches the guest', async () => {
    const rec: Recorder = { calls: [] };
    const responded: { peer: IhttpPeer; frame: IhttpFrame }[] = [];
    const advertised: unknown[] = [];
    let inbound: (f: InboundIhttpFrame) => void = () => {};
    const ports: HostPorts = {
      ui: fakeUi(rec),
      ihttp: {
        advertise: (args): PortAnswer => { advertised.push(args); return { ok: null }; },
        respond: (p: IhttpPeer, frame: IhttpFrame): PortAnswer => { responded.push({ peer: p, frame }); return { ok: null }; },
        call: (): PortAnswer => ({ ok: null }),
        onFrame: (listener: (f: InboundIhttpFrame) => void) => { inbound = listener; return () => {}; },
      },
    };
    const granted: ReadonlySet<Capability> = new Set<Capability>(['ihttp.serve']);
    const verdict: LoadVerdict = await inspectArtifact(server(), granted, 16);
    if (!verdict.ok) throw new Error(verdict.refusal.code);
    rig = inProcess();
    const launched = launchAppInstance({
      appId: APP, module: verdict.module, granted, memory: { initialPages: 1, maxPages: 16 }, context: encodeCbor({}),
      policy: STANDARD_HOST_POLICY, ports, clock: realClock, slots: new InstanceSlots(8), spawn: rig.spawn,
    });
    if (!launched.ok) throw new Error('no slot');
    const i: AppInstance = launched.instance;
    await until(() => i.state === 'running' && advertised.length === 1, 2000);
    expect(advertised[0]).toEqual({ routes: [{ method: 'GET', path: '/cards/:id' }] });

    inbound({ from: peer, frame: request(1n, '/admin') });
    await until(() => responded.length === 1, 2000);
    expect(responded[0].frame.kind).toEqual({ Cancel: { reason: 'unrouted' } });
    expect(rec.calls).toEqual([]);

    inbound({ from: peer, frame: request(2n, '/cards/7') });
    await until(() => rec.calls.length === 1, 2000);
    expect(rec.calls[0].args).toMatchObject({ ihttp: { from: { username: 'bob' }, frame: { stream: 2n, kind: { RequestHead: { path: '/cards/7' } } } } });
    expect(responded.length).toBe(1);
  });
});
