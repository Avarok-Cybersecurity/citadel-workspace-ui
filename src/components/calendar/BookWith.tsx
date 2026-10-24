/**
 * "Book with someone" on this node (design §3.6.1 step 1): the members who offer a type here, and
 * the chosen one's booking page. A member deep link (booking-link.ts) arrives with the host and
 * type already chosen. What the host is busy with comes from the events this pane has read.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { busyOf, hostsOn, readBookingPage, type BookingPageData, type HostBusy } from '@/lib/calendar/booking-pages';
import type { BookingChoice, BookOutcome } from '@/lib/calendar/booking-form';
import type { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import type { CivilDate } from '@/lib/calendar/generated/CivilDate';
import { PortRefused, refusalCopy, type CalendarPorts } from '@/lib/calendar/ports';
import type { CalendarEntry } from '@/lib/calendar/store';
import { BookingPage } from './BookingPage';

interface BookWithProps {
  ports: CalendarPorts;
  engine: CalendarEngine;
  node: { id: string; name: string };
  me: string;
  entries: ReadonlyMap<string, CalendarEntry>;
  displayZone: string;
  deviceZone: string;
  today: CivilDate;
  nowMs: bigint;
  initial: { host: string; typeId: string | null } | null;
  onBook: (host: string, choice: BookingChoice) => Promise<BookOutcome>;
}

type Hosts = { kind: 'loading' } | { kind: 'failed'; reason: string } | { kind: 'ready'; hosts: string[] };
type Page = { kind: 'none' } | { kind: 'loading'; host: string } | { kind: 'failed'; host: string; reason: string } | { kind: 'ready'; page: BookingPageData };

const reasonOf = (e: unknown): string => (e instanceof PortRefused ? refusalCopy(e.refused) : 'something went wrong');

export function BookWith(p: BookWithProps): JSX.Element {
  const { ports, engine, node, me, entries } = p;
  const [hosts, setHosts] = useState<Hosts>({ kind: 'loading' });
  const [page, setPage] = useState<Page>({ kind: 'none' });
  const open = useCallback((host: string): void => {
    setPage({ kind: 'loading', host });
    readBookingPage(ports, engine, node.id, host).then((data: BookingPageData): void => setPage({ kind: 'ready', page: data }), (e: unknown): void => setPage({ kind: 'failed', host, reason: reasonOf(e) }));
  }, [ports, engine, node.id]);
  useEffect(() => {
    hostsOn(ports, node.id).then((found: string[]): void => setHosts({ kind: 'ready', hosts: found.filter((h: string) => h !== me) }), (e: unknown): void => setHosts({ kind: 'failed', reason: reasonOf(e) }));
  }, [ports, node.id, me]);
  const initialHost: string | null = p.initial?.host ?? null;
  useEffect(() => { if (initialHost !== null) open(initialHost); }, [initialHost, open]);
  const shownHost: string | null = page.kind === 'ready' ? page.page.host : null;
  const busyFor = useMemo(() => (fromMs: bigint, toMs: bigint, zone: string): HostBusy => busyOf(entries.values(), shownHost ?? '', zone, { fromMs, toMs }, engine), [entries, engine, shownHost]);

  return (
    <section aria-label="Book with someone" className="flex min-w-0 flex-col gap-4" data-testid="calendar-book-with">
      {hosts.kind === 'loading' && <p role="status" className="text-sm text-muted-foreground">Finding who can be booked on {node.name}…</p>}
      {hosts.kind === 'failed' && <p role="alert" className="text-sm text-destructive-emphasis">Who can be booked could not be read: {hosts.reason}.</p>}
      {hosts.kind === 'ready' && hosts.hosts.length === 0 && page.kind === 'none' && (
        <p role="status" className="text-sm text-muted-foreground">Nobody else offers bookings on {node.name} yet.</p>
      )}
      {hosts.kind === 'ready' && hosts.hosts.length > 0 && (
        <div role="group" aria-label="People you can book" className="flex min-w-0 flex-wrap gap-2">
          {hosts.hosts.map((h: string) => {
            const on: boolean = (page.kind === 'ready' && page.page.host === h) || ((page.kind === 'loading' || page.kind === 'failed') && page.host === h);
            return <Button key={h} variant={on ? 'default' : 'outline'} aria-pressed={on} className="h-[44px]" onClick={(): void => open(h)}>{h}</Button>;
          })}
        </div>
      )}
      {page.kind === 'loading' && <p role="status" className="text-sm text-muted-foreground">Loading {page.host}&apos;s booking page…</p>}
      {page.kind === 'failed' && <p role="alert" className="text-sm text-destructive-emphasis">{page.host}&apos;s booking page could not be read: {page.reason}.</p>}
      {page.kind === 'ready' && (
        <BookingPage
          key={page.page.host} page={page.page} hostName={page.page.host} engine={engine} displayZone={p.displayZone} deviceZone={p.deviceZone}
          today={p.today} nowMs={p.nowMs} busyFor={busyFor} initialTypeId={p.initial?.host === page.page.host ? p.initial.typeId : null}
          onBook={(choice: BookingChoice): Promise<BookOutcome> => p.onBook(page.page.host, choice)}
        />
      )}
    </section>
  );
}
