/**
 * The worker side of an app instance: instantiates the module with ONLY the built imports and
 * runs its exports, one message at a time. app-host.worker.ts wires it to the real (scrubbed)
 * worker scope; tests wire it to an in-process channel or a node worker thread.
 *
 * Guest code is never re-entered: events the host raises while the guest is inside a host call
 * (a router Cancel, a reply that became ready) queue and are delivered after the export returns.
 * Any exception out of an export is a trap: the worker reports `trapped` and runs nothing more.
 */
import { PAGE_BYTES } from '../sdk/generated/AbiConstants';
import { ABI_ERROR, INIT_RESULT } from './abi';
import { encodeAppEvent } from './app-event';
import type { CborMap } from './cbor';
import { effectiveGrant, type Capability } from './capabilities';
import { canvasPort, type CanvasSurface } from './canvas-port';
import { Dispatcher, isPortAnswer, type DispatchClock, type PortInvoker } from './dispatch';
import { IhttpRouter, type RouterAction } from './ihttp-router';
import { buildImports } from './imports';
import { splitInvoker } from './invoker';
import type { OpEntry } from './ops';
import type { HostPorts, LogPort, PortAnswer, PortKey } from './ports';
import { inBounds, ReplyTable } from './reply-table';
import type { LoadMessage, ToWorker, WorkerChannel } from './worker-protocol';
import { isToWorker } from './worker-protocol';

interface Guest {
  readonly memory: WebAssembly.Memory;
  readonly alloc: (len: number) => number;
  readonly free: (ptr: number, len: number) => void;
  readonly init: (ptr: number, len: number) => number;
  readonly event: (ptr: number, len: number) => void;
  readonly frame: ((dtMs: number) => void) | null;
}

/** Answered in the worker: the canvas it owns, and log (which also tells the page). */
const LOCAL_PORTS: ReadonlySet<PortKey | 'host'> = new Set<PortKey | 'host'>(['canvas', 'log', 'host']);
const ROUTER_TICK_MS = 1000;

/** Surfaces for an attached OffscreenCanvas; the worker entry passes the real `getContext`. */
export type SurfaceOf = (canvas: OffscreenCanvas, dpr: number) => CanvasSurface | null;

export function startWorkerHost(channel: WorkerChannel, clock: DispatchClock, surfaceOf: SurfaceOf): void {
  let guest: Guest | null = null;
  let dead: boolean = false;
  let surface: CanvasSurface | null = null;
  let router: IhttpRouter | null = null;
  let replies: ReplyTable | null = null;
  let memoryPages: number = 0;
  let nextCall: number = 0;
  const waiting: Map<number, (answer: PortAnswer) => void> = new Map<number, (answer: PortAnswer) => void>();
  const queue: Uint8Array[] = [];

  const remote: PortInvoker = {
    invoke: (entry: OpEntry, args: CborMap): Promise<PortAnswer> => new Promise<PortAnswer>((resolve: (a: PortAnswer) => void): void => {
      const id: number = ++nextCall;
      waiting.set(id, resolve);
      channel.post({ kind: 'port_call', id, group: entry.group, op: entry.op, args });
    }),
  };

  const logToPage: LogPort = {
    LogWrite: ({ level, message }) => {
      channel.post({ kind: 'log', level, message });
      return { ok: null };
    },
  };

  const trap = (seq: number, error: unknown): void => {
    dead = true;
    const message: string = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    channel.post({ kind: 'trapped', seq, message, memoryPages: guest === null ? memoryPages : guest.memory.buffer.byteLength / PAGE_BYTES });
  };

  /** Copies bytes into guest memory through app_alloc, calls app_event, frees. */
  const deliver = (g: Guest, bytes: Uint8Array): void => {
    const ptr: number = g.alloc(bytes.byteLength) >>> 0;
    if (!inBounds(g.memory, ptr, bytes.byteLength)) throw new Error('app_alloc returned a pointer outside memory');
    new Uint8Array(g.memory.buffer, ptr, bytes.byteLength).set(bytes);
    g.event(ptr, bytes.byteLength);
    g.free(ptr, bytes.byteLength);
  };

  /** Runs guest code, then every event it queued; false if it trapped. */
  const run = (seq: number, body: (g: Guest) => void): boolean => {
    if (dead || guest === null) return false;
    try {
      body(guest);
      while (queue.length > 0) deliver(guest, queue.shift() as Uint8Array);
      return true;
    } catch (error: unknown) {
      trap(seq, error);
      return false;
    }
  };

  const routerActions = (actions: readonly RouterAction[]): void => {
    for (const a of actions) {
      if (a.kind === 'reply') channel.post({ kind: 'ihttp_out', peer: a.peer, frame: a.frame });
      else queue.push(encodeAppEvent({ ihttp: { from: a.peer, frame: a.frame } }));
    }
  };

  /**
   * Delivers queued events outside any message (a reply that became ready, a stream deadline).
   * Worker-initiated, so it announces itself with `busy` and the handle's watchdog times it too.
   */
  let selfSeq: number = 0;
  const drainSoon = (): void => {
    clock.after(0, (): void => {
      if (dead || guest === null || queue.length === 0) return;
      const seq: number = --selfSeq;
      channel.post({ kind: 'busy', seq });
      if (run(seq, () => {})) channel.post({ kind: 'done', seq });
    });
  };

  const tick = (): void => {
    if (dead) return;
    replies?.sweep();
    if (router !== null && router.liveStreams > 0) {
      routerActions(router.tick(clock.now()));
      drainSoon();
    }
    clock.after(ROUTER_TICK_MS, tick);
  };

  const load = (msg: LoadMessage): void => {
    const granted: ReadonlySet<Capability> = effectiveGrant(new Set<Capability>(msg.granted));
    const memory: WebAssembly.Memory = new WebAssembly.Memory({ initial: msg.memory.initialPages, maximum: msg.memory.maxPages });
    memoryPages = memory.buffer.byteLength / PAGE_BYTES;
    const table: ReplyTable = new ReplyTable(msg.policy.maxLiveReplies, msg.policy.replyTtlMs, clock.now);
    replies = table;
    router = new IhttpRouter(msg.appId, msg.policy.ihttp);
    const local: HostPorts = { canvas: canvasPort(() => surface), ...(msg.hasLogPort ? { log: logToPage } : {}) };
    const invoker: PortInvoker = splitInvoker(local, LOCAL_PORTS, remote);
    const dispatcher: Dispatcher = new Dispatcher({ granted, policy: msg.policy, clock, invoker, router, pageUrl: msg.pageUrl, routerActions });
    const imports: WebAssembly.Imports = buildImports(granted, memory, {
      call: (group, op, request) => dispatcher.call(group, op, request),
      replies: table,
      replyReady: (handle: number): void => {
        queue.push(encodeAppEvent({ reply_ready: { handle } }));
        drainSoon();
      },
    });
    let instance: WebAssembly.Instance;
    try {
      instance = new WebAssembly.Instance(msg.module, imports);
    } catch (error: unknown) {
      trap(msg.seq, error);
      return;
    }
    const x: WebAssembly.Exports = instance.exports;
    guest = {
      memory,
      alloc: x.app_alloc as Guest['alloc'],
      free: x.app_free as Guest['free'],
      init: x.app_init as Guest['init'],
      event: x.app_event as Guest['event'],
      frame: typeof x.app_frame === 'function' ? (x.app_frame as (dt: number) => void) : null,
    };
    let status: number = ABI_ERROR.BAD_REQUEST;
    const ok: boolean = run(msg.seq, (g: Guest): void => {
      const ptr: number = g.alloc(msg.context.byteLength) >>> 0;
      if (!inBounds(g.memory, ptr, msg.context.byteLength)) throw new Error('app_alloc returned a pointer outside memory');
      new Uint8Array(g.memory.buffer, ptr, msg.context.byteLength).set(msg.context);
      status = g.init(ptr, msg.context.byteLength);
      g.free(ptr, msg.context.byteLength);
    });
    if (!ok) return;
    if (status !== INIT_RESULT.OK) dead = true;
    channel.post({ kind: 'loaded', seq: msg.seq, status });
    clock.after(ROUTER_TICK_MS, tick);
  };

  const handle = (msg: ToWorker): void => {
    switch (msg.kind) {
      case 'load':
        if (guest === null && !dead) load(msg);
        return;
      case 'canvas':
        surface = surfaceOf(msg.canvas, msg.dpr);
        return;
      case 'event':
        if (run(msg.seq, (g: Guest) => deliver(g, msg.event))) channel.post({ kind: 'done', seq: msg.seq });
        return;
      case 'frame':
        if (run(msg.seq, (g: Guest) => g.frame?.(msg.dtMs))) channel.post({ kind: 'done', seq: msg.seq });
        return;
      case 'port_reply': {
        const resolve: ((a: PortAnswer) => void) | undefined = waiting.get(msg.id);
        waiting.delete(msg.id);
        resolve?.(isPortAnswer(msg.answer) ? msg.answer : { refused: { unavailable: 'port_answer' } });
        return;
      }
      case 'ihttp':
        if (router !== null) routerActions(router.inbound(msg.peer, msg.frame, clock.now()));
        if (run(msg.seq, () => {})) channel.post({ kind: 'done', seq: msg.seq });
        return;
    }
  };

  channel.listen((message: unknown): void => {
    if (isToWorker(message)) handle(message);
  });
}
