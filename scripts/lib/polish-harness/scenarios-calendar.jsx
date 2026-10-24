/**
 * The Calendar tab in each view, on the shipped engine (the vendored glue and its committed
 * binary, over the browser's Intl), fed the placement fixture: every kind of entry a node shows.
 * The harness serves no public/ directory, so the binary is handed to the glue's own init by URL.
 */
import { useEffect, useReducer, useState } from 'react';
import * as glue from '../../../vendor/calendar/calendar_glue.js';
import wasmUrl from '../../../public/calendar/calendar_glue_bg.wasm?url';
import { CalendarTab } from '@/components/calendar/CalendarTab';
import { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import { intlOffsetAt } from '@/lib/calendar/engine/intl-offsets';
import { calendarReducer, initialCalendar } from '@/lib/calendar/store';
import { JULY_WEEK, VIEWER } from '@/lib/calendar/__tests__/placement-fixture';

const NOW = { date: { y: 2024, m: 7, d: 16 }, minute: 600 };
const NAMES = { company: 'Company', 'team-d': 'Team D — Developer experience and tooling', n1: 'Platform' };
const SOURCES = ['node', 'authored', 'inherited', 'up_pulled'];

function seeded(view) {
  return SOURCES.reduce(
    (state, source) => calendarReducer(state, { type: 'read', source, entries: JULY_WEEK.filter((e) => e.source === source), unreadable: 0 }),
    initialCalendar(view, NOW.date),
  );
}

function Calendar({ view, zone }) {
  const [engine, setEngine] = useState(null);
  const [state, dispatch] = useReducer(calendarReducer, view, seeded);
  useEffect(() => {
    glue.default({ module_or_path: wasmUrl }).then(() => setEngine(new CalendarEngine(glue, intlOffsetAt())));
  }, []);
  if (engine === null) return <p>Loading the calendar</p>;
  return (
    <main className="mx-auto max-w-6xl p-4">
      <CalendarTab state={state} dispatch={dispatch} engine={engine} viewer={VIEWER} displayZone={zone}
        node={{ id: 'n1', name: 'Platform', zone: 'America/New_York' }} nodeName={(id) => NAMES[id] ?? id}
        now={NOW} onOpenChip={() => {}} onCreate={null} />
    </main>
  );
}

export const CALENDAR_SCENARIOS = {
  'calendar-month': () => <Calendar view="month" zone="America/New_York" />,
  'calendar-week': () => <Calendar view="week" zone="America/Chicago" />,
  'calendar-day': () => <Calendar view="day" zone="America/New_York" />,
  'calendar-agenda': () => <Calendar view="agenda" zone="America/Chicago" />,
};
