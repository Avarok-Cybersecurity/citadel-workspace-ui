/**
 * The current day and minute on the display zone's clock, for "today" and the now line: read
 * from the page's clock and moved on at each minute boundary, so the grid never shows a stale day.
 */
import { useEffect, useState } from 'react';
import type { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import type { CivilDateTime } from '@/lib/calendar/generated/CivilDateTime';

const MINUTE_MS: number = 60_000;

export function useMinuteClock(engine: CalendarEngine, zone: string): CivilDateTime {
  const read = (): CivilDateTime => engine.civilOf(zone, BigInt(Date.now()));
  const [now, setNow] = useState<CivilDateTime>(read);
  useEffect(() => {
    setNow(engine.civilOf(zone, BigInt(Date.now())));
    let id: ReturnType<typeof setTimeout>;
    const next = (): void => {
      id = setTimeout((): void => {
        setNow(engine.civilOf(zone, BigInt(Date.now())));
        next();
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    next();
    return (): void => clearTimeout(id);
  }, [engine, zone]);
  return now;
}
