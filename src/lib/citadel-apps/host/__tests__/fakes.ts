/**
 * TEST FAKES for the injected ports and the clock: the only stand-ins these tests use. Each fake
 * records the arguments it was called with and answers what the test configured.
 */
import type { CborMap } from '../cbor';
import type { DispatchClock } from '../dispatch';
import type { LogPort, NodesPort, PortAnswer, PortCall, PortReply, StoragePort, UiPort } from '../ports';

export interface Recorder {
  readonly calls: { readonly method: string; readonly args: CborMap }[];
}

export function recordingCall(rec: Recorder, method: string, answer: () => PortReply): PortCall {
  return (args: CborMap): PortReply => {
    rec.calls.push({ method, args });
    return answer();
  };
}

const okLater = (value: unknown) => (): Promise<PortAnswer> => Promise.resolve({ ok: value });
const okNow = (value: unknown) => (): PortAnswer => ({ ok: value });

export function fakeNodes(rec: Recorder): NodesPort {
  return {
    read: recordingCall(rec, 'nodes.read', okLater({ id: 'n1', name: 'Board' })),
    children: recordingCall(rec, 'nodes.children', okLater([])),
    create: recordingCall(rec, 'nodes.create', okLater({ id: 'n2' })),
    rename: recordingCall(rec, 'nodes.rename', okLater(null)),
    move: recordingCall(rec, 'nodes.move', okLater(null)),
  };
}

export function fakeStorage(rec: Recorder): StoragePort {
  return {
    get: recordingCall(rec, 'storage.get', okLater(null)),
    set: recordingCall(rec, 'storage.set', okLater(null)),
    setMany: recordingCall(rec, 'storage.set_many', okLater(null)),
    delete: recordingCall(rec, 'storage.delete', okLater(null)),
    list: recordingCall(rec, 'storage.list', okLater([])),
  };
}

export function fakeUi(rec: Recorder): UiPort {
  return {
    setToolbar: recordingCall(rec, 'ui.set_toolbar', okNow(null)),
    openMenu: recordingCall(rec, 'ui.open_menu', okNow(null)),
    dialog: recordingCall(rec, 'ui.dialog', okNow(null)),
    toast: recordingCall(rec, 'ui.toast', okNow(null)),
    requestHeight: recordingCall(rec, 'ui.request_height', okNow(null)),
  };
}

export function fakeLog(rec: Recorder): LogPort {
  return { write: recordingCall(rec, 'log.write', okNow(null)) };
}

/** A clock the test advances by hand; timers fire in `advance`. */
export class ManualClock implements DispatchClock {
  private t: number = 0;
  private timers: { at: number; fire: () => void; live: boolean }[] = [];

  readonly now = (): number => this.t;

  readonly after = (ms: number, fire: () => void): (() => void) => {
    const timer = { at: this.t + ms, fire, live: true };
    this.timers.push(timer);
    return (): void => {
      timer.live = false;
    };
  };

  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.live && x.at <= this.t);
    this.timers = this.timers.filter((x) => !due.includes(x));
    for (const x of due) x.fire();
  }
}
