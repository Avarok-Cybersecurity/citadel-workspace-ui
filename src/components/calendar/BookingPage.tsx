/**
 * What an invitee sees on a member's booking page (design §3.9 "Booking page", §3.6.1): the host's
 * types, a length, the zone the times are shown in, the free days and times, the type's questions
 * and one Confirm. Every time is the core's (`slotRequest` from the type's own rules, slot-list.ts),
 * shown in the zone chosen here, or the type's locked zone. It reads no port: the mount hands it
 * the host's page, what the host is busy with, and `onBook` (booking.ts).
 */
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { checkAnswers, type BookingChoice, type BookOutcome } from '@/lib/calendar/booking-form';
import type { BookingPageData, HostBusy } from '@/lib/calendar/booking-pages';
import { CalendarRefusal, type CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import { formatDayLong, formatDayShort } from '@/lib/calendar/format';
import { dateKey } from '@/lib/calendar/grid-keyboard';
import type { CivilDate } from '@/lib/calendar/generated/CivilDate';
import type { EventType } from '@/lib/calendar/generated/EventType';
import type { Interval } from '@/lib/calendar/generated/Interval';
import { slotDays, slotRequest, slotZone, type SlotDay } from '@/lib/calendar/slot-list';
import { cn } from '@/lib/utils';
import { QuestionsForm } from './QuestionsForm';
import { SlotList, slotName } from './SlotList';
import { ZoneSelect } from './ZoneSelect';

/** How many days of times one screen offers; Later and Earlier move by as many. */
export const RANGE_DAYS: number = 14;

export interface BookingPageProps {
  page: BookingPageData;
  hostName: string;
  engine: CalendarEngine;
  /** The invitee's display zone: where the zone switcher starts. */
  displayZone: string;
  deviceZone: string;
  today: CivilDate;
  nowMs: bigint;
  /** What the host is busy with over a range (booking-pages.ts `busyOf`, over what the pane read). */
  busyFor: (fromMs: bigint, toMs: bigint, zone: string) => HostBusy;
  initialTypeId: string | null;
  onBook: (choice: BookingChoice) => Promise<BookOutcome>;
}

type Slots = { kind: 'ok'; days: SlotDay[] } | { kind: 'refused'; reason: string } | { kind: 'none' };

const CARD: string = 'flex min-h-[44px] min-w-0 flex-col items-start rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function BookingPage(p: BookingPageProps): JSX.Element {
  const { page, engine, busyFor, nowMs } = p;
  const [type, setType] = useState<EventType | null>(page.types.find((t: EventType) => t.id === p.initialTypeId) ?? page.types[0] ?? null);
  const [duration, setDuration] = useState<number | null>(type?.durations_min[0] ?? null);
  const [chosenZone, setChosenZone] = useState<string>(p.displayZone);
  const [from, setFrom] = useState<CivilDate>(p.today);
  const [day, setDay] = useState<CivilDate | null>(null);
  const [slot, setSlot] = useState<Interval | null>(null);
  const [values, setValues] = useState<ReadonlyMap<string, string>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [busy, setBusy] = useState<boolean>(false);
  const [said, setSaid] = useState<string>('');
  const [alternatives, setAlternatives] = useState<Interval[]>([]);
  const times = useRef<HTMLDivElement>(null);
  const zone: string = type === null ? chosenZone : slotZone(type, chosenZone);
  const to: CivilDate = engine.addDays(from, RANGE_DAYS - 1);

  const slots: Slots = useMemo((): Slots => {
    if (type === null || duration === null || page.availability === null) return { kind: 'none' };
    const fromMs: bigint = engine.instantOf(page.availability.zone, { date: from, minute: 0 });
    const toMs: bigint = engine.instantOf(page.availability.zone, { date: engine.addDays(to, 1), minute: 0 });
    const { busy: taken, booked } = busyFor(fromMs, toMs, page.availability.zone);
    try {
      const free: Interval[] = engine.freeSlots(slotRequest({ type, durationMin: duration, availability: page.availability, busy: taken, booked, nowMs, from, to }));
      return { kind: 'ok', days: slotDays(free, zone, engine) };
    } catch (e: unknown) {
      if (e instanceof CalendarRefusal) return { kind: 'refused', reason: e.message };
      throw e;
    }
  }, [type, duration, page.availability, from, to, zone, engine, nowMs, busyFor]);

  const pickType = (t: EventType): void => {
    setType(t);
    setDuration(t.durations_min[0] ?? null);
    setSlot(null);
    setErrors(new Map());
  };
  const step = (days: number): void => {
    const next: CivilDate = engine.addDays(from, days);
    setFrom(days < 0 && dateKey(next) < dateKey(p.today) ? p.today : next);
    setDay(null);
    setSlot(null);
  };
  const confirm = async (): Promise<void> => {
    if (type === null || duration === null || slot === null) return;
    const checked = checkAnswers(type.questions, values);
    if (!checked.ok) {
      setErrors(checked.errors);
      setSaid('Some answers need attention.');
      return;
    }
    setErrors(new Map());
    setBusy(true);
    setAlternatives([]);
    const outcome: BookOutcome = await p.onBook({ type, durationMin: duration, slot, zone, answers: checked.answers });
    setBusy(false);
    if (outcome.kind === 'confirmed') setSaid(`Booked: ${type.name} with ${p.hostName}, ${slotName(slot, zone)}.`);
    else if (outcome.kind === 'requested') setSaid(`Requested: ${p.hostName} is not online and will confirm ${slotName(slot, zone)} when they are.`);
    else if (outcome.kind === 'failed') setSaid(`Not booked: ${outcome.reason}.`);
    else {
      setSlot(null);
      setAlternatives(outcome.alternatives);
      setSaid(outcome.alternatives.length === 0 ? 'That time was just taken. Choose another time.' : `That time was just taken. ${p.hostName} offers ${outcome.alternatives.length} other times.`);
      requestAnimationFrame((): void => times.current?.querySelector<HTMLElement>('[data-testid="calendar-slot"]')?.focus());
    }
  };

  if (page.availability === null || page.types.length === 0) {
    return <p role="status" className="text-sm text-muted-foreground" data-testid="calendar-booking-page">{p.hostName} has not opened bookings on this page yet.</p>;
  }
  return (
    <section aria-label={`Book with ${p.hostName}`} className="flex min-w-0 flex-col gap-4" data-testid="calendar-booking-page">
      <h2 className="text-base font-semibold text-foreground">Book with {p.hostName}</h2>
      <div role="group" aria-label="What to book" className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {page.types.map((t: EventType) => (
          <button key={t.id} type="button" aria-pressed={type?.id === t.id} onClick={(): void => pickType(t)} className={cn(CARD, type?.id === t.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
            <span className="font-medium text-foreground">{t.name}</span>
            <span className="text-muted-foreground">{t.durations_min.map((d: number) => `${d} min`).join(' or ')}</span>
          </button>
        ))}
      </div>
      {type !== null && type.durations_min.length > 1 && (
        <div role="group" aria-label="Length" className="flex flex-wrap gap-2">
          {type.durations_min.map((d: number) => (
            <Button key={d} variant={d === duration ? 'default' : 'outline'} aria-pressed={d === duration} className="h-[44px] min-w-[44px]" onClick={(): void => { setDuration(d); setSlot(null); }}>{d} min</Button>
          ))}
        </div>
      )}
      {type?.zone_lock === null ? (
        <ZoneSelect label="Show times in" value={chosenZone} deviceZone={p.deviceZone} onChange={(z: string): void => { setChosenZone(z); setDay(null); setSlot(null); }} />
      ) : (
        <p className="text-sm text-muted-foreground">Times are shown in {zone}, as {p.hostName} set for this type.</p>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="outline" className="h-[44px]" disabled={from.y === p.today.y && from.m === p.today.m && from.d === p.today.d} onClick={(): void => step(-RANGE_DAYS)}>Earlier</Button>
        <span className="min-w-0 flex-1 text-center text-sm text-foreground">{formatDayShort(from)} to {formatDayShort(to)}</span>
        <Button variant="outline" className="h-[44px]" onClick={(): void => step(RANGE_DAYS)}>Later</Button>
      </div>
      <div ref={times} className="flex min-w-0 flex-col gap-3">
        {alternatives.length > 0 && (
          <div role="group" aria-label={`Other times ${p.hostName} offers`} className="flex min-w-0 flex-wrap gap-2">
            {alternatives.map((s: Interval) => (
              <Button key={s.start_ms.toString()} variant="outline" className="h-[44px]" data-testid="calendar-slot" aria-label={`${formatDayLong(engine.civilOf(zone, s.start_ms).date)}, ${slotName(s, zone)}`}
                onClick={(): void => { setDay(engine.civilOf(zone, s.start_ms).date); setSlot(s); }}>
                {formatDayShort(engine.civilOf(zone, s.start_ms).date)} {slotName(s, zone)}
              </Button>
            ))}
          </div>
        )}
        {slots.kind === 'ok' && <SlotList days={slots.days} zone={zone} day={day} slot={slot} onDay={(d: CivilDate): void => { setDay(d); setSlot(null); }} onSlot={setSlot} />}
        {slots.kind === 'refused' && <p role="alert" className="text-sm text-destructive-emphasis">These times could not be worked out: {slots.reason}.</p>}
      </div>
      {type !== null && <QuestionsForm questions={type.questions} values={values} errors={errors} onChange={(id: string, v: string): void => setValues(new Map(values).set(id, v))} />}
      <div className="sticky bottom-0 flex justify-end border-t border-border bg-background py-2">
        <Button className="h-[44px]" disabled={slot === null || busy} onClick={(): void => { void confirm(); }} data-testid="calendar-confirm-booking">
          {slot === null || day === null ? 'Choose a time' : busy ? 'Booking…' : `Confirm · ${formatDayLong(day)}, ${slotName(slot, zone)}`}
        </Button>
      </div>
      <p aria-live="polite" role="status" className="text-sm text-foreground" data-testid="calendar-booking-said">{said}</p>
    </section>
  );
}
