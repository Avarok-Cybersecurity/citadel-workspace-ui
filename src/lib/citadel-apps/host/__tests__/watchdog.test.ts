/**
 * The handle's watchdog over a scripted channel and a manual clock: exactly when it fires, what
 * it measures from, and that answers in time keep an instance alive.
 */
import { describe, expect, it } from 'vitest';
import type { Capability } from '../capabilities';
import { launchAppInstance, type AppInstance, type Launch } from '../instance';
import { InstanceSlots } from '../instance-slots';
import { STANDARD_HOST_POLICY } from '../limits';
import type { FromWorker, HostChannel, ToWorker } from '../worker-protocol';
import { fixtureContext } from './app-fixtures';
import { ManualClock } from './fakes';

interface Scripted {
  readonly channel: HostChannel;
  readonly sent: ToWorker[];
  readonly reply: (m: FromWorker) => void;
  terminated: number;
}

function scripted(): Scripted {
  let listener: (e: MessageEvent<unknown>) => void = () => {};
  const s: Scripted = {
    sent: [],
    terminated: 0,
    reply: (m: FromWorker): void => listener({ data: m } as MessageEvent<unknown>),
    channel: {
      postMessage: (m: ToWorker): void => { s.sent.push(m); },
      addEventListener: (_t: 'message', l: (e: MessageEvent<unknown>) => void): void => { listener = l; },
      terminate: (): void => { s.terminated++; },
    },
  };
  return s;
}

const BUDGET: number = STANDARD_HOST_POLICY.computeBudgetMs;

function launch(clock: ManualClock, s: Scripted, slots: InstanceSlots = new InstanceSlots(8)): AppInstance {
  const l: Launch = launchAppInstance({
    appId: 'a.b', module: {} as WebAssembly.Module, granted: new Set<Capability>(), memory: { initialPages: 1, maxPages: 1 },
    context: fixtureContext([]), pageUrl: 'https://work.avarok.net/', policy: STANDARD_HOST_POLICY, ports: {}, clock, slots, spawn: () => s.channel,
  });
  if (!l.ok) throw new Error('no slot');
  return l.instance;
}

const seqOf = (m: ToWorker): number => ('seq' in m ? m.seq : -1);

describe('watchdog', () => {
  it('a load that never answers is stopped at the budget, not before', () => {
    const clock: ManualClock = new ManualClock();
    const s: Scripted = scripted();
    const slots: InstanceSlots = new InstanceSlots(8);
    const i: AppInstance = launch(clock, s, slots);
    clock.advance(BUDGET - 1);
    expect(i.state).toBe('loading');
    clock.advance(1);
    expect(i.state).toBe('stopped-unresponsive');
    expect(s.terminated).toBe(1);
    expect(slots.inUse).toBe(0);
  });

  it('control: answers within the budget keep it running indefinitely', () => {
    const clock: ManualClock = new ManualClock();
    const s: Scripted = scripted();
    const i: AppInstance = launch(clock, s);
    clock.advance(BUDGET - 1);
    s.reply({ kind: 'loaded', seq: seqOf(s.sent[0]), status: 0 });
    for (let n: number = 0; n < 10; n++) {
      i.frame(16);
      clock.advance(BUDGET - 1);
      s.reply({ kind: 'done', seq: seqOf(s.sent[s.sent.length - 1]) });
    }
    clock.advance(BUDGET * 10);
    expect(i.state).toBe('running');
    expect(s.terminated).toBe(0);
  });

  it('a queued message gets its own budget from when the one ahead of it finished', () => {
    const clock: ManualClock = new ManualClock();
    const s: Scripted = scripted();
    const i: AppInstance = launch(clock, s);
    s.reply({ kind: 'loaded', seq: seqOf(s.sent[0]), status: 0 });
    i.frame(16);
    i.frame(16);
    const [first, second] = s.sent.slice(-2).map(seqOf);
    clock.advance(BUDGET - 100);
    s.reply({ kind: 'done', seq: first });
    clock.advance(BUDGET - 1);
    expect(i.state).toBe('running');
    clock.advance(1);
    expect(i.state).toBe('stopped-unresponsive');
    expect(second).toBeGreaterThan(first);
  });

  it('worker-initiated guest runs (busy ... done) are timed too', () => {
    const clock: ManualClock = new ManualClock();
    const s: Scripted = scripted();
    const i: AppInstance = launch(clock, s);
    s.reply({ kind: 'loaded', seq: seqOf(s.sent[0]), status: 0 });
    s.reply({ kind: 'busy', seq: -1 });
    clock.advance(BUDGET);
    expect(i.state).toBe('stopped-unresponsive');
  });

  it('a trap stops the instance at once', () => {
    const clock: ManualClock = new ManualClock();
    const s: Scripted = scripted();
    const i: AppInstance = launch(clock, s);
    s.reply({ kind: 'trapped', seq: seqOf(s.sent[0]), message: 'RuntimeError: unreachable', memoryPages: 1 });
    expect(i.state).toBe('stopped-trapped');
    expect(s.terminated).toBe(1);
  });
});
