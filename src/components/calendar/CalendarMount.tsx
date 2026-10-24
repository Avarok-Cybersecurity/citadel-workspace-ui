/**
 * The Calendar's tab as the first-party registry mounts it (first-party/registry.ts): the core
 * loaded for the page, its ports over the glue instance the tab was bound with, the member's
 * display zone (asked once, ZoneQuestion), and the store kept read from storage and refreshed on
 * StorageChanged (use-calendar-sources.ts). Everything below it is CalendarTab, which reads no port.
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { GlueTabProps } from '@/lib/citadel-apps/first-party/registry';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import { intlOffsetAt } from '@/lib/calendar/engine/intl-offsets';
import { loadCalendarWasm } from '@/lib/calendar/engine/load-calendar-wasm';
import type { Chip } from '@/lib/calendar/placement';
import { calendarPorts, type CalendarPorts } from '@/lib/calendar/ports';
import { calendarReducer, initialCalendar, type CalendarState } from '@/lib/calendar/store';
import { useCalendarSources } from '@/lib/calendar/use-calendar-sources';
import { displayZoneOf, nodeZone, type DisplayZoneChoice } from '@/lib/calendar/zones';
import { CalendarTab } from './CalendarTab';
import { EventDetails } from './EventDetails';
import { useCalendarSettings, type SettingsState } from './use-calendar-settings';
import { useMinuteClock } from './use-minute-clock';
import { ZoneQuestion } from './ZoneQuestion';

type EngineState = { kind: 'loading' } | { kind: 'ready'; engine: CalendarEngine } | { kind: 'failed' };

/** Below this width the Calendar opens on Agenda, which reads as a list on a phone. */
const NARROW_PX: number = 640;

function Status({ children, alert = false }: { children: React.ReactNode; alert?: boolean }): JSX.Element {
  return <p role={alert ? 'alert' : 'status'} className={`m-[16px] text-sm ${alert ? 'text-destructive-emphasis' : 'text-muted-foreground'}`}>{children}</p>;
}

interface PaneProps {
  ports: CalendarPorts;
  engine: CalendarEngine;
  nodeId: string;
  me: string;
  displayZone: string;
}

function CalendarPane({ ports, engine, nodeId, me, displayZone }: PaneProps): JSX.Element {
  const { state: ws } = useWorkspace();
  const now = useMinuteClock(engine, displayZone);
  const [state, dispatch] = useReducer(calendarReducer, undefined, (): CalendarState =>
    initialCalendar(window.innerWidth < NARROW_PX ? 'agenda' : 'month', now.date));
  const [open, setOpen] = useState<Chip | null>(null);
  useCalendarSources(ports, engine, nodeId, dispatch);
  const nodeName = useCallback((id: string): string => ws.nodes[id]?.name ?? 'a page you cannot see', [ws.nodes]);
  const zone: string | null = useMemo(() => nodeZone(ws.nodes, nodeId, ws.workspace?.metadata), [ws.nodes, nodeId, ws.workspace?.metadata]);
  return (
    <div className="flex min-w-0 flex-col gap-3 p-[16px]">
      {open !== null && <EventDetails chip={open} displayZone={displayZone} nodeName={nodeName} onClose={(): void => setOpen(null)} />}
      <CalendarTab
        state={state} dispatch={dispatch} engine={engine} viewer={me} displayZone={displayZone}
        node={{ id: nodeId, name: ws.nodes[nodeId]?.name ?? 'This page', zone }} nodeName={nodeName}
        now={now} onOpenChip={setOpen} onCreate={null}
      />
    </div>
  );
}

export function CalendarMount({ glue, nodeId, me }: GlueTabProps): JSX.Element {
  const ports: CalendarPorts = useMemo(() => calendarPorts(glue), [glue]);
  const [loaded, setLoaded] = useState<EngineState>({ kind: 'loading' });
  useEffect(() => {
    let live: boolean = true;
    loadCalendarWasm().then((g) => { if (live) setLoaded({ kind: 'ready', engine: new CalendarEngine(g, intlOffsetAt()) }); }, (error: unknown): void => {
      console.error('[calendar] the core did not load', error);
      if (live) setLoaded({ kind: 'failed' });
    });
    return (): void => { live = false; };
  }, []);
  const settings: SettingsState = useCalendarSettings(ports);
  const deviceZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (loaded.kind === 'failed') return <Status alert>The Calendar could not be loaded. Reload the page to try again.</Status>;
  if (settings.kind === 'failed') return <Status alert>Your Calendar settings could not be read: {settings.reason}.</Status>;
  if (loaded.kind === 'loading' || settings.kind === 'loading') return <Status>Loading the Calendar…</Status>;
  if (settings.kind === 'absent') {
    return <ZoneQuestion deviceZone={deviceZone} saving={settings.saving} error={settings.error} onChoose={(choice: DisplayZoneChoice): void => settings.choose(choice)} />;
  }
  return <CalendarPane ports={ports} engine={loaded.engine} nodeId={nodeId} me={me} displayZone={displayZoneOf(settings.settings.displayZone, deviceZone)} />;
}
