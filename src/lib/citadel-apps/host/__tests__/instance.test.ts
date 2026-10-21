/**
 * An instance end to end with the production worker host (in-process, real MessageChannel): it
 * loads, fails init, traps when memory growth passes the maximum, reaches a granted port through
 * the main thread's re-check and gets its reply as a reply_ready event, and is capped per page.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { encodeCbor } from '../cbor';
import type { Capability } from '../capabilities';
import { inspectArtifact, type LoadVerdict } from '../inspect';
import { AppInstance, launchAppInstance, type Launch, type LaunchOptions } from '../instance';
import { InstanceSlots } from '../instance-slots';
import { STANDARD_HOST_POLICY } from '../limits';
import type { HostPorts } from '../ports';
import { appModule, growOrTrap, importIndex, type AppModuleOptions } from './app-fixtures';
import { fakeStorage, fakeUi, type Recorder } from './fakes';
import { inProcess, realClock, until, type InProcess } from './in-process';
import { op } from './wasm-builder';

let rigs: InProcess[] = [];
afterEach(() => {
  rigs.forEach((r: InProcess) => r.close());
  rigs = [];
});

async function launch(bytes: Uint8Array, opts: { granted?: Capability[]; declared?: Capability[]; ports?: HostPorts; slots?: InstanceSlots; maxPages?: number } = {}): Promise<{ launch: Launch; rig: InProcess }> {
  const granted: ReadonlySet<Capability> = new Set<Capability>(opts.granted ?? []);
  const declared: ReadonlySet<Capability> = new Set<Capability>(opts.declared ?? opts.granted ?? []);
  const verdict: LoadVerdict = await inspectArtifact(bytes, declared, opts.maxPages ?? 16);
  if (!verdict.ok) throw new Error(`fixture refused: ${verdict.refusal.code}`);
  const rig: InProcess = inProcess();
  rigs.push(rig);
  const options: LaunchOptions = {
    appId: 'com.acme.test', module: verdict.module, granted, context: encodeCbor({ install_id: 'i-1' }),
    memory: { initialPages: verdict.memory.minPages, maxPages: opts.maxPages ?? 16 }, policy: STANDARD_HOST_POLICY,
    ports: opts.ports ?? {}, clock: realClock, slots: opts.slots ?? new InstanceSlots(8), spawn: rig.spawn,
  };
  return { launch: launchAppInstance(options), rig };
}

const running = (l: Launch): AppInstance => {
  if (!l.ok) throw new Error('not launched');
  return l.instance;
};

describe('lifecycle', () => {
  it('the clean module loads and runs', async () => {
    const i: AppInstance = running((await launch(appModule())).launch);
    await until(() => i.state === 'running', 2000);
    expect(i.initStatus).toBe(0);
  });

  it('app_init returning non-zero is init-failed, and the worker is terminated', async () => {
    const { launch: l, rig } = await launch(appModule({ init: op.i32(7) }));
    const i: AppInstance = running(l);
    await until(() => i.state === 'init-failed', 2000);
    expect(i.initStatus).toBe(7);
    expect(rig.terminated()).toBe(1);
  });
});

describe('memory', () => {
  const grower = (pages: number): Uint8Array => appModule({ memory: { min: 1, max: 64 }, event: growOrTrap(pages) });

  it('growing past the host maximum traps the instance (control: growing within it keeps running)', async () => {
    const within: AppInstance = running((await launch(grower(1), { maxPages: 2 })).launch);
    await until(() => within.state === 'running', 2000);
    within.postEvent({ grow: 1 });
    const past: AppInstance = running((await launch(grower(2), { maxPages: 2 })).launch);
    await until(() => past.state === 'running', 2000);
    past.postEvent({ grow: 2 });
    await until(() => past.state === 'stopped-trapped', 2000);
    expect(past.trapMessage).toMatch(/unreachable/);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(within.state).toBe('running');
  });
});

/** event: if len > 40, forward to storage.get; else the first time only, forward to ui.toast. */
function forwarder(): Uint8Array {
  const base: AppModuleOptions = { groups: ['storage', 'ui'] };
  const toStorage: number[] = [...op.i32(1), ...op.localGet(0), ...op.localGet(1), ...op.call(importIndex(base, 'storage')), ...op.drop];
  const toUi: number[] = [...op.i32(4), ...op.localGet(0), ...op.localGet(1), ...op.call(importIndex(base, 'ui')), ...op.drop];
  const once: number[] = [...op.i32(16), 0x28, 0x02, 0x00, 0x45, 0x04, 0x40, ...op.i32(16), ...op.i32(1), ...op.store, ...toUi, 0x0b];
  const event: number[] = [...op.localGet(1), ...op.i32(40), 0x4b, 0x04, 0x40, ...toStorage, 0x05, ...once, 0x0b];
  return appModule({ ...base, event });
}

describe('ports through the worker boundary', () => {
  const big = { backend: 'user', key: 'k', pad: 'x'.repeat(40) };

  it('a granted call reaches the fake port and its reply arrives as a reply_ready event', async () => {
    const rec: Recorder = { calls: [] };
    const ports: HostPorts = { storage: fakeStorage(rec), ui: fakeUi(rec) };
    const i: AppInstance = running((await launch(forwarder(), { granted: ['storage.user'], ports })).launch);
    await until(() => i.state === 'running', 2000);
    i.postEvent(big);
    await until(() => rec.calls.length === 2, 2000);
    expect(rec.calls[0]).toEqual({ method: 'storage.get', args: big });
    expect(rec.calls[1].method).toBe('ui.toast');
    expect(rec.calls[1].args).toMatchObject({ reply_ready: { handle: expect.any(Number) } });
  });

  it('control: declared but not granted, the storage port is never reached', async () => {
    const rec: Recorder = { calls: [] };
    const ports: HostPorts = { storage: fakeStorage(rec), ui: fakeUi(rec) };
    const i: AppInstance = running((await launch(forwarder(), { granted: [], declared: ['storage.user'], ports })).launch);
    await until(() => i.state === 'running', 2000);
    i.postEvent(big);
    await new Promise<void>((r) => setTimeout(r, 100));
    expect(rec.calls.filter((c) => c.method.startsWith('storage'))).toEqual([]);
  });
});

describe('the per-page instance cap', () => {
  it('admits 8 and refuses the 9th until one is terminated', async () => {
    const slots: InstanceSlots = new InstanceSlots(STANDARD_HOST_POLICY.maxLiveInstancesPerPage);
    const live: AppInstance[] = [];
    for (let n: number = 0; n < 8; n++) live.push(running((await launch(appModule(), { slots })).launch));
    expect((await launch(appModule(), { slots })).launch).toEqual({ ok: false, reason: 'instance_limit' });
    live[0].terminate();
    expect((await launch(appModule(), { slots })).launch.ok).toBe(true);
  });
});
