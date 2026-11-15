/**
 * "While you were away" (design §3.7): the reminders that fell due while no window had the
 * Calendar open, shown once, never fired late as if on time, with each event's start and page.
 */
import { Button } from '@/components/ui/button';
import { formatDayLong, formatTimeIn } from '@/lib/calendar/format';
import type { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import type { Due } from '@/lib/calendar/reminder-scheduler';

interface RemindersAwayProps {
  missed: readonly Due[];
  engine: CalendarEngine;
  displayZone: string;
  nodeName: (id: string) => string;
  onDismiss: () => void;
}

export function RemindersAway({ missed, engine, displayZone, nodeName, onDismiss }: RemindersAwayProps): JSX.Element | null {
  if (missed.length === 0) return null;
  return (
    <section aria-label="While you were away" className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted p-3" data-testid="calendar-reminders-away">
      <h2 className="text-sm font-semibold text-foreground">While you were away</h2>
      <ul className="flex min-w-0 flex-col gap-1">
        {missed.map((d: Due) => (
          <li key={`${d.eventId}@${d.fire.at_ms}`} className="min-w-0 text-sm text-foreground">
            <span className="font-medium">{d.title}</span>
            <span className="text-muted-foreground"> · {formatDayLong(engine.civilOf(displayZone, d.fire.start_ms).date)}, {formatTimeIn(d.fire.start_ms, displayZone)} · {nodeName(d.node)}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="h-[44px] self-start" onClick={onDismiss}>Dismiss</Button>
    </section>
  );
}
