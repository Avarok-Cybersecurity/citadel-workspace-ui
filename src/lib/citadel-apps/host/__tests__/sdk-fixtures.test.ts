// @vitest-environment node
/**
 * The Rust SDK's REAL hostile fixtures (apps/sdk-fixtures/wasm/*.wasm), judged and run as
 * fixtures.json states: each through this host's inspector, then (when it has a run) through the
 * loader and the production worker entry in a real thread, with the run's own policy, and compared
 * once every pending reply has been delivered. The inspector's codes must equal the Rust
 * inspector's; a run's init, frame, events, report, log and memory must equal the reference host's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppEvent } from '../../sdk/generated/AppEvent';
import { FIXTURES } from '../../sdk/__tests__/sdk-paths';
import type { Capability } from '../capabilities';
import { inspectArtifact, type LoadVerdict } from '../inspect';
import { launchAppInstance, type AppInstance, type InstanceState, type Launch } from '../instance';
import { InstanceSlots } from '../instance-slots';
import { instanceMemoryFor, STANDARD_HOST_POLICY, validateHostPolicy, type HostPolicy } from '../limits';
import type { HostPorts, PortAnswer } from '../ports';
import { fixtureContext } from './app-fixtures';
import { ihttpRemote, type IhttpRemoteConfig } from './ihttp-remote';
import { realClock, until } from './in-process';
import { bundleWorkerEntry, threadChannel, type BundledEntry } from './real-worker';

interface Run {
  readonly granted: Capability[];
  readonly host: { readonly max_memory_pages: number; readonly max_reply_bytes?: number; readonly ihttp_remote?: IhttpRemoteConfig };
  readonly init: number | 'trap';
  readonly frame?: 'ok' | 'trap';
  readonly events?: readonly { readonly event: AppEvent; readonly outcome: 'ok' | 'trap' }[];
  readonly report?: Readonly<Record<string, string>>;
  readonly log?: readonly string[];
  readonly log_contains?: string;
  readonly memory_pages_after?: number;
}

interface Fixture {
  readonly declared: Capability[];
  readonly inspect: { readonly accepted: true } | { readonly rejects: string[] };
  readonly control?: { readonly declared: Capability[] };
  readonly run?: Run;
  readonly control_run?: Run;
}

/** The Rust inspector test's ceiling (harness/tests/inspect.rs CEILING_PAGES). */
const INSPECT_CEILING_PAGES: number = 4096;
/** The reference run's request/reply cap unless the run states one (harness/tests/run.rs). */
const DEFAULT_IO_BYTES: number = 1 << 20;
/** Long enough for any well-behaved call on a loaded machine; the slow-frame fixture never returns. */
const BUDGET_MS: number = 1500;

const manifest: { fixtures: Record<string, Fixture> } | null = FIXTURES.present
  ? JSON.parse(readFileSync(join(FIXTURES.path, 'fixtures.json'), 'utf8')) as { fixtures: Record<string, Fixture> }
  : null;
const fixtures: [string, Fixture][] = manifest === null ? [] : Object.entries(manifest.fixtures);
const wasm = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES.path, 'wasm', `${name}.wasm`)));
const caps = (list: readonly Capability[]): ReadonlySet<Capability> => new Set<Capability>(list);

describe(`the SDK fixtures (source: ${FIXTURES.label})`, () => {
  it.skipIf(!FIXTURES.present)('are the designed eleven, every one committed', () => {
    expect(fixtures.map(([n]) => n).sort()).toEqual(['exfil-attempts', 'foreign-import', 'hello-canvas', 'huge-reply', 'ihttp-stream-client', 'linker-start',
      'over-memory', 'panics', 'slow-frame', 'undeclared-import', 'ungranted-calls']);
  });

  for (const [name, f] of fixtures) {
    it(`${name}: the inspector judges it as the Rust inspector does`, async () => {
      const v: LoadVerdict = await inspectArtifact(wasm(name), caps(f.declared), INSPECT_CEILING_PAGES);
      expect(v.ok ? [] : [...v.reasons].sort()).toEqual('rejects' in f.inspect ? [...f.inspect.rejects].sort() : []);
      if (f.control !== undefined) expect((await inspectArtifact(wasm(name), caps(f.control.declared), INSPECT_CEILING_PAGES)).ok).toBe(true);
    });
  }
});

let entry: BundledEntry | null = null;
beforeAll(async () => {
  if (FIXTURES.present) entry = await bundleWorkerEntry();
}, 60_000);
afterAll(() => entry?.dispose());

interface Live {
  readonly instance: AppInstance;
  readonly log: string[];
}

/** The reference host's ports (harness/src/respond.rs, remote.rs): log, events, internal navigation, FilesRead, the ihttp far end. */
function referencePorts(log: string[], maxReplyBytes: number, remote: IhttpRemoteConfig | undefined): HostPorts {
  return {
    ...(remote === undefined ? {} : { ihttp: ihttpRemote(remote) }),
    log: { LogWrite: ({ message }): PortAnswer<null> => { log.push(message); return { ok: null }; } },
    events: { Subscribe: () => ({ ok: null }), RequestFrames: () => ({ ok: null }) },
    navigate: { currentUrl: () => 'https://work.avarok.net/workspace', open: () => ({ ok: null }) },
    files: {
      FilesRead: ({ len }) => Promise.resolve(len > maxReplyBytes ? { refused: { limit: 'read_len' } } : { ok: { bytes: new Uint8Array(len) } }),
      FilesList: () => ({ refused: { unavailable: 'no port in the reference host' } }),
      FilesWrite: () => ({ refused: { unavailable: 'no port in the reference host' } }),
      FilesDelete: () => ({ refused: { unavailable: 'no port in the reference host' } }),
    },
  };
}

async function start(name: string, f: Fixture, run: Run): Promise<Live> {
  const maxReplyBytes: number = run.host.max_reply_bytes ?? DEFAULT_IO_BYTES;
  const policy: HostPolicy = validateHostPolicy({
    ...STANDARD_HOST_POLICY, memoryMaxPages: run.host.max_memory_pages, maxRequestBytes: DEFAULT_IO_BYTES, maxReplyBytes, computeBudgetMs: BUDGET_MS,
  });
  const v: LoadVerdict = await inspectArtifact(wasm(name), caps(f.declared), policy.memoryMaxPages);
  if (!v.ok) throw new Error(`${name}: refused ${v.reasons.join(', ')}`);
  const log: string[] = [];
  const bundled: BundledEntry = entry as BundledEntry;
  const launched: Launch = launchAppInstance({
    appId: 'net.avarok.fixture', module: v.module, granted: caps(run.granted), context: fixtureContext(run.granted),
    pageUrl: 'https://work.avarok.net/workspace', memory: instanceMemoryFor(v.memory, run.host.max_memory_pages, policy), policy,
    ports: referencePorts(log, maxReplyBytes, run.host.ihttp_remote), clock: realClock, slots: new InstanceSlots(1), spawn: () => threadChannel(bundled),
  });
  if (!launched.ok) throw new Error('no slot');
  return { instance: launched.instance, log };
}

/** Every pending reply delivered: nothing new logged and the state unchanged for a while. */
async function settle(live: Live): Promise<void> {
  let seen: string = '';
  for (;;) {
    const now: string = `${live.instance.state}|${live.log.length}`;
    if (now === seen) return;
    seen = now;
    await new Promise<void>((r) => setTimeout(r, 250));
  }
}

const report = (log: readonly string[]): Record<string, string> =>
  Object.fromEntries(log.flatMap((l: string) => { const at: number = l.indexOf('='); return at < 0 ? [] : [[l.slice(0, at), l.slice(at + 1)]]; }));
const STOPPED: readonly InstanceState[] = ['init-failed', 'stopped-trapped', 'stopped-unresponsive', 'terminated'];

async function play(name: string, f: Fixture, run: Run): Promise<void> {
  const live: Live = await start(name, f, run);
  const i: AppInstance = live.instance;
  await until(() => i.state !== 'loading', 10_000);
  if (run.init === 'trap') expect([name, i.state]).toEqual([name, 'stopped-trapped']);
  else expect([name, i.initStatus, i.state]).toEqual([name, run.init, run.init === 0 ? 'running' : 'init-failed']);
  await settle(live);
  for (const step of run.events ?? []) {
    i.postEvent(step.event);
    await settle(live);
    expect([name, step.event, i.state]).toEqual([name, step.event, step.outcome === 'ok' ? 'running' : 'stopped-trapped']);
  }
  if (run.frame !== undefined) {
    i.frame(16);
    await new Promise<void>((r) => setTimeout(r, BUDGET_MS + 300));
    expect([name, i.state]).toEqual([name, run.frame === 'ok' ? 'running' : 'stopped-unresponsive']);
  }
  // Pending replies and far-end frames may still be in flight: wait for every expected probe
  // (bounded; a missing one then fails below with its name), then for quiet.
  const probes: string[] = Object.keys(run.report ?? {});
  await until(() => probes.every((p: string) => p in report(live.log)), 10_000).catch((): void => undefined);
  await settle(live);
  const got: Record<string, string> = report(live.log);
  for (const [probe, want] of Object.entries(run.report ?? {})) expect([name, probe, got[probe]]).toEqual([name, probe, want]);
  // As harness/tests/run.rs: exfil-attempts reports every probe and no other.
  if (name === 'exfil-attempts') expect(Object.keys(got).sort()).toEqual(Object.keys(run.report ?? {}).sort());
  for (const line of run.log ?? []) expect(live.log).toContain(line);
  if (run.log_contains !== undefined) expect(live.log.some((l: string) => l.includes(run.log_contains as string))).toBe(true);
  if (run.memory_pages_after !== undefined) expect([name, i.trapMemoryPages]).toEqual([name, run.memory_pages_after]);
  if (!STOPPED.includes(i.state)) i.terminate();
}

describe(`the SDK fixtures, run in the production worker (source: ${FIXTURES.label})`, () => {
  it.skipIf(!FIXTURES.present)('every fixture with a run is run, controls included', () => {
    expect(fixtures.flatMap(([, f]) => [f.run, f.control_run]).filter((r) => r !== undefined).length).toBe(10);
  });

  for (const [name, f] of fixtures) {
    for (const key of ['run', 'control_run'] as const) {
      const run: Run | undefined = f[key];
      if (run !== undefined) it(`${name} ${key}`, () => play(name, f, run), 30_000);
    }
  }
});
