/**
 * The host's side of booking as the tab mounts it (design §3.6.1 steps 3-4): a request a member
 * left while the host was away is answered when the host's Calendar next mounts; and while it is
 * mounted, a member booking the host is confirmed live and keeps their own copy. The host's install
 * holds no `notifications` here, so the live booking also shows that a refused notification does
 * not fail a booking already made. A booking is cancelled from its event, by its booker (with the
 * host, then their own copy) or by its host, and the host records who cancelled.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability } from '@/lib/citadel-apps/host/capabilities';
import { INTRO, WORKING_HOURS } from '@/lib/calendar/__tests__/booking-fixture';
import { realEngine, utc } from '@/lib/calendar/__tests__/engine-rig';
import { IhttpRelay } from '@/lib/calendar/__tests__/ihttp-relay';
import { MemoryStore } from '@/lib/calendar/__tests__/memory-store';
import { BOOKING_ACK_PREFIX, BOOKING_PREFIX, bookingOf } from '@/lib/calendar/booking';
import { BookingHost } from '@/lib/calendar/booking-host';
import type { Booking } from '@/lib/calendar/generated/Booking';
import { calendarPorts } from '@/lib/calendar/ports';
import { formatDayLong } from '@/lib/calendar/format';
import type { KvBackend } from '@/lib/citadel-apps/sdk/generated/KvBackend';
import { encodeSettings, SETTINGS_KEY } from '@/lib/calendar/zones';
import { mountCalendar, mountRig } from './mount-rig';

vi.mock('@/lib/calendar/engine/load-calendar-wasm', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const glue = await import('../../../../vendor/calendar/calendar_glue.js');
  return {
    loadCalendarWasm: async () => {
      glue.initSync({ module: readFileSync(join(process.cwd(), 'public/calendar/calendar_glue_bg.wasm')) });
      return glue;
    },
  };
});

const engine = realEngine();
const IHTTP: Capability[] = ['ihttp.serve', 'ihttp.call'];
const authored = (author: string): KvBackend => ({ node_authored: { node_id: 'n1', author } });

function anaOffersIntro(shared: Map<string, Uint8Array>): void {
  const ana: MemoryStore = new MemoryStore('ana', shared);
  ana.put(authored('ana'), 'cal/type/t1', engine.encodeEventType(INTRO));
  ana.put(authored('ana'), 'cal/availability', engine.encodeAvailability(WORKING_HOURS));
}

function signedIn(me: string, shared: Map<string, Uint8Array>, relay: IhttpRelay): void {
  const store: MemoryStore = new MemoryStore(me, shared);
  store.put('user', SETTINGS_KEY, encodeSettings({ displayZone: { kind: 'fixed', zone: 'America/New_York' } }));
  mountCalendar(mountRig(me, store, { ihttp: relay.port(me), held: IHTTP }).glue, me, false);
}

beforeEach((): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2024-07-16T15:00:00Z'));
  window.history.replaceState(null, '', '/workspace?nodeId=n1');
});
afterEach((): void => { vi.useRealTimers(); });

describe("the host's Calendar", () => {
  it('answers a request left while the host was away, when it next mounts', async () => {
    const shared: Map<string, Uint8Array> = new Map();
    anaOffersIntro(shared);
    const slot = { start_ms: utc('2024-07-17T13:00:00Z'), end_ms: utc('2024-07-17T13:30:00Z') };
    const request = bookingOf({ type: INTRO, durationMin: 30, slot, zone: 'America/New_York', answers: [{ question_id: 'q-topic', value: 'Roadmap' }] }, { id: 'r1', node: 'n1', host: 'ana', me: 'bob' });
    new MemoryStore('bob', shared).put(authored('bob'), `${BOOKING_PREFIX}r1`, engine.encodeBooking(request));
    signedIn('ana', shared, new IhttpRelay());
    await waitFor(() => expect(shared.has(`authored:n1:ana|${BOOKING_ACK_PREFIX}r1`)).toBe(true));
    const ack = shared.get(`authored:n1:ana|${BOOKING_ACK_PREFIX}r1`) as Uint8Array;
    expect(engine.decodeBooking(ack).state).toBe('confirmed');
    expect(engine.decodeEvent(shared.get('authored:n1:ana|cal/event/r1') as Uint8Array).visibility).toBe('busy_only');
  });

  it('confirms a member booking it live, and the booker keeps their own copy', async () => {
    const shared: Map<string, Uint8Array> = new Map();
    const relay: IhttpRelay = new IhttpRelay();
    anaOffersIntro(shared);
    signedIn('ana', shared, relay);
    await screen.findByTestId('calendar-tab');
    const bob: MemoryStore = new MemoryStore('bob', shared);
    bob.put('user', SETTINGS_KEY, encodeSettings({ displayZone: { kind: 'fixed', zone: 'America/New_York' } }));
    window.history.replaceState(null, '', '/workspace?nodeId=n1&tab=app%3Anet.avarok.calendar&book=ana');
    mountCalendar(mountRig('bob', bob, { ihttp: relay.port('bob'), held: IHTTP }).glue, 'bob', false);
    const page = within(await screen.findByTestId('calendar-booking-page'));
    const day: RegExp = new RegExp(`^${formatDayLong({ y: 2024, m: 7, d: 17 })},`);
    fireEvent.click(page.getByRole('button', { name: day }));
    fireEvent.click(page.getAllByTestId('calendar-slot')[0] as HTMLElement);
    fireEvent.change(page.getByLabelText(/What should we cover\?/), { target: { value: 'Roadmap' } });
    await act(async () => { fireEvent.click(page.getByTestId('calendar-confirm-booking')); });
    await waitFor(() => expect(page.getByTestId('calendar-booking-said')).toHaveTextContent(/^Booked: Intro call with ana/));
    expect([...shared.keys()].filter((k) => k.startsWith('user:bob|cal/private/'))).toHaveLength(1);
    expect([...shared.keys()].filter((k) => k.startsWith(`authored:n1:ana|${BOOKING_ACK_PREFIX}`))).toHaveLength(1);
  });

  it('cancels a booking from its event: the booker with the host, and the host on their own', async () => {
    const shared: Map<string, Uint8Array> = new Map();
    const relay: IhttpRelay = new IhttpRelay();
    anaOffersIntro(shared);
    signedIn('ana', shared, relay);
    await screen.findByTestId('calendar-tab');
    const slot = { start_ms: utc('2024-07-17T13:00:00Z'), end_ms: utc('2024-07-17T13:30:00Z') };
    const hourLater = (n: number): bigint => BigInt(n * 3_600_000);
    const made = (id: string, hours: number): Booking => bookingOf(
      { type: INTRO, durationMin: 30, slot: { start_ms: slot.start_ms + hourLater(hours), end_ms: slot.end_ms + hourLater(hours) }, zone: 'America/New_York', answers: [{ question_id: 'q-topic', value: 'x' }] },
      { id, node: 'n1', host: 'ana', me: 'bob' },
    );
    const anaHost = new BookingHost({ ports: calendarPorts(mountRig('ana', new MemoryStore('ana', shared)).glue), engine, node: 'n1', me: 'ana', nowMs: () => utc('2024-07-16T15:00:00Z') });
    for (const [id, hours] of [['k1', 0], ['k2', 1]] as const) {
      const verdict = await anaHost.decide(made(id, hours), 'bob', null);
      if (verdict.kind !== 'confirm') throw new Error(`the fixture booking ${id} should be free`);
      const ana = new MemoryStore('ana', shared);
      ana.put(authored('ana'), `cal/event/${id}`, engine.encodeEvent(verdict.event));
      ana.put(authored('ana'), `${BOOKING_ACK_PREFIX}${id}`, engine.encodeBooking(verdict.booking));
    }
    const bob: MemoryStore = new MemoryStore('bob', shared);
    bob.put('user', SETTINGS_KEY, encodeSettings({ displayZone: { kind: 'fixed', zone: 'America/New_York' } }));
    const own = engine.decodeEvent(shared.get('authored:n1:ana|cal/event/k1') as Uint8Array);
    bob.put('user', 'cal/private/k1', engine.encodeEvent({ ...own, author: 'bob', hosts: ['ana'], visibility: 'private', title: 'Intro call with ana' }));
    mountCalendar(mountRig('bob', bob, { ihttp: relay.port('bob'), held: IHTTP }).glue, 'bob', false);
    const chips = await screen.findAllByRole('button', { name: /^Intro call with ana/ });
    fireEvent.click(chips[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'clash' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' })); });
    await screen.findByText('The booking is cancelled.');
    expect(engine.decodeEvent(shared.get('authored:n1:ana|cal/event/k1') as Uint8Array).status).toEqual({ cancelled: { by: 'bob', reason: 'clash' } });
    expect(engine.decodeEvent(shared.get('user:bob|cal/private/k1') as Uint8Array).status).toEqual({ cancelled: { by: 'bob', reason: 'clash' } });
    expect((await anaHost.cancelAsHost('k2', null)).status).toBe(200);
    expect(engine.decodeBooking(shared.get(`authored:n1:ana|${BOOKING_ACK_PREFIX}k2`) as Uint8Array).state).toEqual({ cancelled: { by: 'ana', reason: null } });
  });
});
