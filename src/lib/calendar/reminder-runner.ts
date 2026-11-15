/**
 * The interim reminder scheduler's edge (design §3.7): it reads the member's plans and the instant
 * reminders were last handled, fires what is due through `notify`, and waits on the clock for the
 * next. Only the leader tab fires and moves that instant on (one WebSocket, one leader), so two
 * windows never fire one reminder twice; every window shows what was missed while none was open.
 *
 * A reminder fires only while some window has the Calendar open: the limitation is said where
 * reminders are chosen, until Signals timers and the durable inbox replace this.
 */
import type { DispatchClock } from '@/lib/citadel-apps/host/dispatch';
import type { CalendarEngine } from './engine/calendar-engine';
import type { ReminderPlan } from './generated/ReminderPlan';
import type { CalendarPorts, CalendarStore } from './ports';
import { nextDue, REMINDER_PREFIX, type Due, type Schedule } from './reminder-scheduler';

const USER: CalendarStore = { kind: 'user' };

/** `storage.user`: the instant, in UTC ms, up to which every reminder has been fired or shown. */
export const HANDLED_KEY: string = 'cal/reminders-handled';

export function encodeHandled(ms: bigint): Uint8Array {
  const bytes: Uint8Array = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, ms);
  return bytes;
}

export function decodeHandled(bytes: Uint8Array): bigint {
  if (bytes.byteLength !== 8) throw new Error(`a handled instant is 8 bytes, not ${bytes.byteLength}`);
  return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0);
}

export interface ReminderDeps {
  readonly clock: DispatchClock;
  readonly isLeader: () => boolean;
  readonly plans: () => Promise<ReminderPlan[]>;
  /** Null before reminders were ever handled: nothing counts as missed. */
  readonly handled: () => Promise<bigint | null>;
  readonly setHandled: (ms: bigint) => Promise<void>;
  readonly fire: (due: Due) => Promise<void>;
}

/** The runner's deps over the Calendar's own ports; `isLeader` and `fire` are the mount's. */
export function reminderStore(ports: CalendarPorts, engine: Pick<CalendarEngine, 'decodeReminderPlan'>): Pick<ReminderDeps, 'plans' | 'handled' | 'setHandled'> {
  return {
    plans: async (): Promise<ReminderPlan[]> => {
      const keys: string[] = await ports.storage.keys(USER, REMINDER_PREFIX);
      const values = await Promise.all(keys.map((k: string) => ports.storage.get(USER, k)));
      return values.flatMap((bytes) => {
        if (bytes === null) return [];
        try {
          return [engine.decodeReminderPlan(bytes)];
        } catch (e: unknown) {
          console.error('[calendar] a reminder plan could not be read', e);
          return [];
        }
      });
    },
    handled: async (): Promise<bigint | null> => {
      const bytes: Uint8Array | null = await ports.storage.get(USER, HANDLED_KEY);
      return bytes === null ? null : decodeHandled(bytes);
    },
    setHandled: (ms: bigint): Promise<void> => ports.storage.set(USER, HANDLED_KEY, encodeHandled(ms)),
  };
}

export class ReminderRunner {
  private cancel: (() => void) | null = null;
  private stopped: boolean = false;

  constructor(private readonly deps: ReminderDeps) {}

  /**
   * Handles what is due now and waits for the next; answers what was missed, for the caller to
   * show once. Run again on a storage change and on becoming the leader.
   */
  async tick(): Promise<Due[]> {
    this.cancel?.();
    this.cancel = null;
    const now: bigint = BigInt(Math.floor(this.deps.clock.now()));
    const [plans, since] = await Promise.all([this.deps.plans(), this.deps.handled()]);
    const schedule: Schedule = nextDue(plans, now, since ?? now);
    if (this.deps.isLeader()) {
      for (const due of schedule.due) await this.deps.fire(due);
      await this.deps.setHandled(now);
    }
    if (!this.stopped && schedule.nextMs !== null) {
      this.cancel = this.deps.clock.after(Number(schedule.nextMs - now), (): void => {
        this.tick().catch((e: unknown): void => console.error('[calendar] reminders could not be handled', e));
      });
    }
    return schedule.missed;
  }

  stop(): void {
    this.stopped = true;
    this.cancel?.();
    this.cancel = null;
  }
}
