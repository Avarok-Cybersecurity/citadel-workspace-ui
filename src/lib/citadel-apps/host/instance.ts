/**
 * The main-thread handle of one app instance: owns its worker, carries the worker's port calls to
 * the injected ports (re-checked against the grant), and runs the watchdog. Every message that
 * makes the worker run guest code is outstanding until the worker answers it; the oldest
 * outstanding one has `computeBudgetMs` from the moment it became the oldest, after which the
 * worker is terminated and the handle reports `stopped-unresponsive`.
 */
import { APP_INIT_OK } from './abi';
import { encodeCbor, type CborMap } from './cbor';
import type { Capability } from './capabilities';
import type { DispatchClock } from './dispatch';
import type { InstanceSlots } from './instance-slots';
import { regrantedCall } from './invoker';
import type { HostPolicy } from './limits';
import type { HostPorts, InboundIhttpFrame, PortAnswer, PortReply } from './ports';
import { isFromWorker, type FromWorker, type HostChannel, type ToWorker } from './worker-protocol';

export type InstanceState =
  | 'loading' | 'running' | 'init-failed' | 'stopped-unresponsive' | 'stopped-trapped' | 'terminated';

export interface LaunchOptions {
  readonly appId: string;
  /** From an `ok` load verdict: the module has already passed inspect.ts. */
  readonly module: WebAssembly.Module;
  readonly granted: ReadonlySet<Capability>;
  readonly memory: { readonly initialPages: number; readonly maxPages: number };
  readonly context: Uint8Array;
  readonly policy: HostPolicy;
  readonly ports: HostPorts;
  readonly clock: DispatchClock;
  readonly slots: InstanceSlots;
  /** Starts the worker: spawnAppWorker() on a page, a test channel in tests. */
  readonly spawn: () => HostChannel;
}

export type Launch = { readonly ok: true; readonly instance: AppInstance } | { readonly ok: false; readonly reason: 'instance_limit' };

export function launchAppInstance(options: LaunchOptions): Launch {
  const release: (() => void) | null = options.slots.acquire();
  if (release === null) return { ok: false, reason: 'instance_limit' };
  return { ok: true, instance: new AppInstance(options, release) };
}

const STOPPED: ReadonlySet<InstanceState> = new Set<InstanceState>(['init-failed', 'stopped-unresponsive', 'stopped-trapped', 'terminated']);

export class AppInstance {
  private current: InstanceState = 'loading';
  private readonly listeners: Set<(state: InstanceState) => void> = new Set<(state: InstanceState) => void>();
  private readonly outstanding: Set<number> = new Set<number>();
  private cancelWatchdog: (() => void) | null = null;
  private nextSeq: number = 0;
  private unsubscribeIhttp: (() => void) | null = null;
  private readonly channel: HostChannel;
  /** Why the guest trapped, when it did. */
  trapMessage: string | null = null;
  initStatus: number | null = null;

  constructor(private readonly options: LaunchOptions, private readonly release: () => void) {
    this.channel = options.spawn();
    this.channel.addEventListener('message', (event: MessageEvent<unknown>): void => {
      if (isFromWorker(event.data)) this.onMessage(event.data);
    });
    this.send({
      kind: 'load', seq: this.seq(), module: options.module, appId: options.appId, granted: [...options.granted],
      memory: options.memory, context: options.context, policy: options.policy,
    }, []);
  }

  get state(): InstanceState {
    return this.current;
  }

  onState(listener: (state: InstanceState) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /** One AppEvent (pointer, key, resize, ...), CBOR-encoded for the guest. */
  postEvent(event: CborMap): void {
    if (this.current !== 'running') return;
    this.send({ kind: 'event', seq: this.seq(), event: encodeCbor(event) }, []);
  }

  frame(dtMs: number): void {
    if (this.current !== 'running') return;
    this.send({ kind: 'frame', seq: this.seq(), dtMs }, []);
  }

  /** Transfers the canvas to the worker; the page keeps only the placeholder element. */
  attachCanvas(canvas: OffscreenCanvas): void {
    if (STOPPED.has(this.current)) return;
    this.channel.postMessage({ kind: 'canvas', canvas }, [canvas]);
  }

  terminate(): void {
    this.stop('terminated');
  }

  private seq(): number {
    return ++this.nextSeq;
  }

  private send(message: ToWorker, transfer: Transferable[]): void {
    if ('seq' in message) this.begin(message.seq);
    this.channel.postMessage(message, transfer);
  }

  private begin(seq: number): void {
    this.outstanding.add(seq);
    if (this.outstanding.size === 1) this.armWatchdog();
  }

  private finish(seq: number): void {
    const oldest: number | undefined = this.outstanding.values().next().value;
    this.outstanding.delete(seq);
    if (seq === oldest) this.armWatchdog();
  }

  private armWatchdog(): void {
    this.cancelWatchdog?.();
    this.cancelWatchdog = null;
    if (this.outstanding.size === 0 || STOPPED.has(this.current)) return;
    this.cancelWatchdog = this.options.clock.after(this.options.policy.computeBudgetMs, (): void => this.stop('stopped-unresponsive'));
  }

  private onMessage(message: FromWorker): void {
    if (STOPPED.has(this.current)) return;
    switch (message.kind) {
      case 'busy': this.begin(message.seq); return;
      case 'done': this.finish(message.seq); return;
      case 'trapped':
        this.trapMessage = message.message;
        this.stop('stopped-trapped');
        return;
      case 'loaded':
        this.finish(message.seq);
        this.initStatus = message.status;
        if (message.status !== APP_INIT_OK) {
          this.stop('init-failed');
          return;
        }
        this.setState('running');
        this.unsubscribeIhttp = this.options.ports.ihttp?.onFrame((inbound: InboundIhttpFrame): void => {
          if (this.current === 'running') this.send({ kind: 'ihttp', seq: this.seq(), peer: inbound.from, frame: inbound.frame }, []);
        }) ?? null;
        return;
      case 'port_call': this.portCall(message); return;
      case 'ihttp_out': void this.options.ports.ihttp?.respond(message.peer, message.frame); return;
    }
  }

  private portCall(message: Extract<FromWorker, { kind: 'port_call' }>): void {
    const answer = (a: PortAnswer): void => {
      if (!STOPPED.has(this.current)) this.channel.postMessage({ kind: 'port_reply', id: message.id, answer: a }, []);
    };
    let reply: PortReply;
    try {
      reply = regrantedCall(this.options.ports, this.options.granted, message.group, message.op, message.args);
    } catch {
      answer({ refused: { unavailable: 'port_failed' } });
      return;
    }
    if (reply instanceof Promise) reply.then(answer, (): void => answer({ refused: { unavailable: 'port_failed' } }));
    else answer(reply);
  }

  private stop(state: InstanceState): void {
    if (STOPPED.has(this.current)) return;
    this.cancelWatchdog?.();
    this.cancelWatchdog = null;
    this.outstanding.clear();
    this.unsubscribeIhttp?.();
    this.unsubscribeIhttp = null;
    this.channel.terminate();
    this.release();
    this.setState(state);
  }

  private setState(state: InstanceState): void {
    this.current = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}
