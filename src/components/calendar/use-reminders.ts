/**
 * The interim reminders, bound to the pane (design §3.7): a `ReminderRunner` over the member's own
 * plans, the instance's clock and `notify`, firing only while this tab is the leader. It looks
 * again when the tab becomes or stops being the leader and whenever the pane's entries are read
 * anew (a save writes its plan first). Answers what was missed while no window was open, for the
 * pane to show once.
 */
import { useEffect, useRef, useState } from 'react';
import type { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import { formatTimeIn } from '@/lib/calendar/format';
import type { CalendarPorts } from '@/lib/calendar/ports';
import { reminderStore, ReminderRunner } from '@/lib/calendar/reminder-runner';
import type { Due } from '@/lib/calendar/reminder-scheduler';

export interface RemindersInput {
  ports: CalendarPorts;
  engine: CalendarEngine;
  /** Whether this tab holds the WebSocket: the one that fires. */
  leader: boolean;
  displayZone: string;
  nodeName: (id: string) => string;
  /** Changes whenever the pane's entries are read anew. */
  revision: unknown;
}

const keyOf = (d: Due): string => `${d.eventId}@${d.fire.at_ms}`;

export function useReminders({ ports, engine, leader, displayZone, nodeName, revision }: RemindersInput): { missed: Due[]; dismiss: () => void } {
  const [missed, setMissed] = useState<Due[]>([]);
  const leading = useRef<boolean>(leader);
  leading.current = leader;
  const named = useRef(nodeName);
  named.current = nodeName;
  const zone = useRef<string>(displayZone);
  zone.current = displayZone;
  const runner = useRef<ReminderRunner | null>(null);
  /** Shown in this tab already: a follower never moves the handled instant, so it would see them again. */
  const shown = useRef<Set<string>>(new Set());
  useEffect(() => {
    const made: ReminderRunner = new ReminderRunner({
      ...reminderStore(ports, engine),
      clock: ports.clock,
      isLeader: (): boolean => leading.current,
      fire: (due: Due): Promise<void> => ports.notify(due.title, `Starts at ${formatTimeIn(due.fire.start_ms, zone.current)} · ${named.current(due.node)}`),
    });
    runner.current = made;
    return (): void => {
      made.stop();
      runner.current = null;
    };
  }, [ports, engine]);
  useEffect(() => {
    runner.current?.tick().then(
      (late: Due[]): void => {
        const fresh: Due[] = late.filter((d: Due) => !shown.current.has(keyOf(d)));
        fresh.forEach((d: Due) => shown.current.add(keyOf(d)));
        if (fresh.length > 0) setMissed((before: Due[]) => [...before, ...fresh]);
      },
      (e: unknown): void => console.error('[calendar] reminders could not be handled', e),
    );
  }, [ports, engine, leader, revision]);
  return { missed, dismiss: (): void => setMissed([]) };
}
