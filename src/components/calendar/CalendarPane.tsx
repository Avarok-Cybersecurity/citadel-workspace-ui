/**
 * The Calendar pane once the core and the member's zone are known (design §3.9): the views over
 * the store kept read from storage, and in the page's flow the panels a member opens from them:
 * a new event, their booking page on this node, and booking someone else (which a member deep
 * link opens directly). Ids and the clock are read here, at the pane's edge; nothing below reads
 * a port, a clock or the address.
 */
import { useCallback, useMemo, useReducer, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { bookingTargetOf } from '@/lib/calendar/booking-link';
import type { BookingChoice, BookOutcome } from '@/lib/calendar/booking-form';
import { book as claim, bookingOf, bookingRole, cancelAsBooker, requestBooking, type BookingRole } from '@/lib/calendar/booking';
import type { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import type { EventCheck } from '@/lib/calendar/event-draft';
import type { CivilDate } from '@/lib/calendar/generated/CivilDate';
import type { Chip } from '@/lib/calendar/placement';
import { PortRefused, refusalCopy, type CalendarPorts } from '@/lib/calendar/ports';
import { calendarReducer, initialCalendar, type CalendarState } from '@/lib/calendar/store';
import { useCalendarSources } from '@/lib/calendar/use-calendar-sources';
import { nodeZone } from '@/lib/calendar/zones';
import { BookingSetup } from './BookingSetup';
import { BookWith } from './BookWith';
import { CalendarTab } from './CalendarTab';
import { EventDetails } from './EventDetails';
import { EventEditor } from './EventEditor';
import { useBookings } from './use-bookings';
import { useMinuteClock } from './use-minute-clock';
import type { Capability } from '@/lib/citadel-apps/host/capabilities';

/** Below this width the Calendar opens on Agenda, which reads as a list on a phone. */
const NARROW_PX: number = 640;

export interface CalendarPaneProps {
  ports: CalendarPorts;
  engine: CalendarEngine;
  nodeId: string;
  me: string;
  displayZone: string;
  deviceZone: string;
  /** What the install holds for this member: which booking planes it may serve and call on. */
  held: ReadonlySet<Capability>;
}

type Panel = { kind: 'none' } | { kind: 'new'; date: CivilDate } | { kind: 'setup' } | { kind: 'book' };

const newId = (): string => crypto.randomUUID();
const reasonOf = (e: unknown): string => (e instanceof PortRefused ? refusalCopy(e.refused) : 'something went wrong');

export function CalendarPane({ ports, engine, nodeId, me, displayZone, deviceZone, held }: CalendarPaneProps): JSX.Element {
  const { state: ws } = useWorkspace();
  const now = useMinuteClock(engine, displayZone);
  const nowMs: bigint = useMemo(() => engine.instantOf(displayZone, now), [engine, displayZone, now]);
  const [state, dispatch] = useReducer(calendarReducer, undefined, (): CalendarState =>
    initialCalendar(window.innerWidth < NARROW_PX ? 'agenda' : 'month', now.date));
  const [linked] = useState(() => bookingTargetOf(window.location.search, nodeId));
  const [panel, setPanel] = useState<Panel>(linked === null ? { kind: 'none' } : { kind: 'book' });
  const [open, setOpen] = useState<Chip | null>(null);
  useCalendarSources(ports, engine, nodeId, dispatch);
  const { client, host } = useBookings(ports, engine, nodeId, me, held);
  const nodeName = useCallback((id: string): string => ws.nodes[id]?.name ?? 'a page you cannot see', [ws.nodes]);
  const zone: string | null = useMemo(() => nodeZone(ws.nodes, nodeId, ws.workspace?.metadata), [ws.nodes, nodeId, ws.workspace?.metadata]);
  const node = { id: nodeId, name: ws.nodes[nodeId]?.name ?? 'This page' };
  const close = (): void => setPanel({ kind: 'none' });

  const saveEvent = async (checked: Extract<EventCheck, { ok: true }>): Promise<string | null> => {
    try {
      await ports.storage.set(checked.store, checked.key, engine.encodeEvent(checked.event));
      return null;
    } catch (e: unknown) {
      return reasonOf(e);
    }
  };
  const book = (host: string, choice: BookingChoice): Promise<BookOutcome> => {
    const booking = bookingOf(choice, { id: newId(), node: nodeId, host, me });
    if (client === null) return requestBooking(ports, engine, booking, nodeId, me);
    return claim({ ports, engine, client, node: nodeId, me, title: `${choice.type.name} with ${host}`, nowMs: BigInt(Date.now()) }, booking, null);
  };

  const openEntry = open === null ? undefined : state.entries.get(open.entryKey);
  const openEvent = openEntry === undefined || openEntry.source === 'inherited' ? null : openEntry.event;
  const role: BookingRole | null = openEvent === null ? null : bookingRole(openEvent, me);
  const cancelOpen = async (reason: string | null): Promise<string | null> => {
    if (role === null || openEvent === null) return 'this is not a booking you can cancel';
    try {
      if (role.kind === 'host') {
        const answer = await host.cancelAsHost(role.id, reason);
        return answer.status === 200 ? null : `it could not be cancelled (${answer.status})`;
      }
      if (client === null) return 'bookings cannot be changed from here right now';
      return await cancelAsBooker({ ports, engine, client, me, nowMs: BigInt(Date.now()) }, openEvent, role.host, role.id, reason);
    } catch (e: unknown) {
      return reasonOf(e);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 p-[16px]" data-testid="calendar-pane">
      {panel.kind === 'none' && (
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button variant="outline" className="h-[44px]" onClick={(): void => setPanel({ kind: 'book' })}>Book with someone</Button>
          <Button variant="outline" className="h-[44px]" onClick={(): void => setPanel({ kind: 'setup' })}>Your booking page</Button>
        </div>
      )}
      {panel.kind !== 'none' && panel.kind !== 'new' && (
        <Button variant="ghost" className="h-[44px] self-start" onClick={close}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to the calendar</span>
        </Button>
      )}
      {panel.kind === 'new' && (
        <EventEditor date={panel.date} node={node} me={me} displayZone={displayZone} engine={engine} newId={newId} nowMs={(): bigint => BigInt(Date.now())} onSave={saveEvent} onClose={close} />
      )}
      {panel.kind === 'setup' && <BookingSetup ports={ports} engine={engine} node={node} me={me} displayZone={displayZone} deviceZone={deviceZone} today={now.date} origin={window.location.origin} newId={newId} />}
      {panel.kind === 'book' && (
        <BookWith ports={ports} engine={engine} node={node} me={me} entries={state.entries} displayZone={displayZone} deviceZone={deviceZone}
          today={now.date} nowMs={nowMs} initial={linked === null ? null : { host: linked.host, typeId: linked.typeId }} onBook={book} />
      )}
      {(panel.kind === 'none' || panel.kind === 'new') && (
        <>
          {open !== null && <EventDetails chip={open} displayZone={displayZone} nodeName={nodeName} onClose={(): void => setOpen(null)} onCancelBooking={role === null ? null : cancelOpen} />}
          <CalendarTab
            state={state} dispatch={dispatch} engine={engine} viewer={me} displayZone={displayZone}
            node={{ ...node, zone }} nodeName={nodeName} now={now} onOpenChip={setOpen}
            onCreate={(date: CivilDate): void => setPanel({ kind: 'new', date })}
          />
        </>
      )}
    </div>
  );
}
