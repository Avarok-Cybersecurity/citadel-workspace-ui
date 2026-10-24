/**
 * The booking protocol between members' instances (design §3.6.1), over the real glue gate and
 * iHTTP router, a fake relay and one shared store that answers on a later turn, as the kernel does: two bookers racing for one slot get one 201 and
 * one 409 with other times; a booking for someone other than its caller is refused; an offline host
 * is left a request, which their next instance answers; a cancellation says who made it; and a
 * reschedule moves a booking to a new time, the old one cancelled and the booker's copy moved.
 */
import { describe, expect, it } from 'vitest';
import type { Capability } from '@/lib/citadel-apps/host/capabilities';
import { glueInstance } from '@/lib/citadel-apps/host/glue-instance';
import { STANDARD_HOST_POLICY } from '@/lib/citadel-apps/host/limits';
import { ManualClock } from '@/lib/citadel-apps/host/__tests__/fakes';
import type { IhttpEndpoint } from '@/lib/citadel-apps/glue-sdk/ihttp-endpoint';
import { book, bookingOf, BOOKING_ACK_PREFIX, cancelBooking } from '../booking';
import { BookingHost, serveBookings } from '../booking-host';
import { saveAvailability, saveEventType } from '../booking-pages';
import type { BookingChoice } from '../booking-form';
import type { Booking } from '../generated/Booking';
import { calendarPorts, type CalendarPorts } from '../ports';
import { realEngine, utc } from './engine-rig';
import { INTRO, WORKING_HOURS } from './booking-fixture';
import { IhttpRelay } from './ihttp-relay';
import { MemoryStore } from './memory-store';

const engine = realEngine();
const HELD: Capability[] = ['storage.user', 'storage.node', 'storage.node.authored', 'ihttp.serve', 'ihttp.call', 'notifications'];
const NOW: bigint = utc('2024-07-15T12:00:00Z');
const SLOT = { start_ms: utc('2024-07-16T13:00:00Z'), end_ms: utc('2024-07-16T13:30:00Z') };
const choice: BookingChoice = { type: INTRO, durationMin: 30, slot: SLOT, zone: 'America/New_York', answers: [{ question_id: 'q-topic', value: 'Roadmap' }] };

interface Member {
  readonly name: string;
  readonly ports: CalendarPorts;
  readonly endpoint: IhttpEndpoint;
  readonly host: BookingHost;
  readonly notes: string[];
}

async function member(name: string, relay: IhttpRelay, shared: Map<string, Uint8Array>): Promise<Member> {
  const notes: string[] = [];
  const store: MemoryStore = new MemoryStore(name, shared);
  const glue = glueInstance({
    appId: 'net.avarok.calendar', held: new Set<Capability>(HELD), policy: STANDARD_HOST_POLICY, limits: { topics: null, p2p: null },
    ports: { storage: store.slowPort(), ihttp: relay.port(name), notify: { Notify: ({ title, body }) => { notes.push(`${title}: ${body}`); return { ok: null }; } } },
    clock: new ManualClock(), pageUrl: 'https://w.example/n1', storageChanges: () => () => {},
  });
  const ports: CalendarPorts = calendarPorts(glue);
  const host: BookingHost = new BookingHost({ ports, engine, node: 'n1', me: name, nowMs: () => NOW });
  return { name, ports, endpoint: await serveBookings(ports, host, { relay: true, p2p: false }), host, notes };
}

async function anaOpensBookings(ana: Member): Promise<void> {
  await saveEventType(ana.ports, engine, 'n1', 'ana', INTRO);
  await saveAvailability(ana.ports, engine, 'n1', 'ana', WORKING_HOURS);
}

const booking = (by: string, id: string): Booking => bookingOf(choice, { id, node: 'n1', host: 'ana', me: by });
const bookAs = (m: Member, b: Booking, replacing: string | null = null) =>
  book({ ports: m.ports, engine, client: m.endpoint.client, node: 'n1', me: m.name, title: 'Intro call with ana', nowMs: NOW }, b, replacing);

describe('the booking protocol', () => {
  it('confirms one of two bookers racing for a slot, and offers the other other times', async () => {
    const relay = new IhttpRelay();
    const shared: Map<string, Uint8Array> = new Map();
    const [ana, bob, cy] = (await Promise.all(['ana', 'bob', 'cy'].map((n) => member(n, relay, shared)))) as [Member, Member, Member];
    await anaOpensBookings(ana);
    const [first, second] = await Promise.all([bookAs(bob, booking('bob', 'b1')), bookAs(cy, booking('cy', 'c1'))]);
    expect([first.kind, second.kind].sort()).toEqual(['confirmed', 'taken']);
    const lost = first.kind === 'taken' ? first : second;
    expect(lost.kind === 'taken' && lost.alternatives.length).toBeGreaterThan(0);
    expect(lost.kind === 'taken' && lost.alternatives.some((a) => a.start_ms === SLOT.start_ms)).toBe(false);
    expect(ana.notes).toHaveLength(1);
    const winner: string = first.kind === 'confirmed' ? 'bob' : 'cy';
    expect([...shared.keys()].filter((k) => k.includes('|cal/private/'))).toEqual([`user:${winner}|cal/private/${winner === 'bob' ? 'b1' : 'c1'}`]);
  });

  it('refuses a booking made out for someone other than its caller', async () => {
    const relay = new IhttpRelay();
    const shared: Map<string, Uint8Array> = new Map();
    const [ana, bob] = (await Promise.all(['ana', 'bob'].map((n) => member(n, relay, shared)))) as [Member, Member];
    await anaOpensBookings(ana);
    const outcome = await bookAs(bob, booking('cy', 'forged'));
    expect(outcome).toEqual({ kind: 'failed', reason: 'ana refused it: a booking may only be made for its caller' });
  });

  it('leaves an offline host a request, which their next instance answers', async () => {
    const relay = new IhttpRelay();
    const shared: Map<string, Uint8Array> = new Map();
    const setup = await member('ana', relay, shared);
    await anaOpensBookings(setup);
    setup.endpoint.close();
    relay.offline('ana');
    const bob = await member('bob', relay, shared);
    const outcome = await bookAs(bob, booking('bob', 'b2'));
    expect(outcome.kind).toBe('requested');
    const ana = await member('ana', relay, shared);
    expect(await ana.host.answerRequests()).toBe(1);
    const ack = shared.get(`authored:n1:ana|${BOOKING_ACK_PREFIX}b2`);
    expect(ack === undefined ? null : engine.decodeBooking(ack).state).toBe('confirmed');
    expect(await ana.host.answerRequests()).toBe(0);
  });

  it('cancels a booking for its booker, saying who cancelled, and refuses anyone else', async () => {
    const relay = new IhttpRelay();
    const shared: Map<string, Uint8Array> = new Map();
    const [ana, bob, cy] = (await Promise.all(['ana', 'bob', 'cy'].map((n) => member(n, relay, shared)))) as [Member, Member, Member];
    await anaOpensBookings(ana);
    expect((await bookAs(bob, booking('bob', 'b3'))).kind).toBe('confirmed');
    expect(await cancelBooking(cy.endpoint.client, 'ana', 'b3', 'not mine')).toEqual({ ok: false, reason: 'ana refused it: only its booker or host may cancel a booking' });
    expect(await cancelBooking(bob.endpoint.client, 'ana', 'b3', 'clash')).toEqual({ ok: true });
    const event = shared.get('authored:n1:ana|cal/event/b3');
    expect(event === undefined ? null : engine.decodeEvent(event).status).toEqual({ cancelled: { by: 'bob', reason: 'clash' } });
  });

  it('moves a booking to a new time, cancelling the old one and moving the booker\'s copy', async () => {
    const relay = new IhttpRelay();
    const shared: Map<string, Uint8Array> = new Map();
    const [ana, bob] = (await Promise.all(['ana', 'bob'].map((n) => member(n, relay, shared)))) as [Member, Member];
    await anaOpensBookings(ana);
    expect((await bookAs(bob, booking('bob', 'b5'))).kind).toBe('confirmed');
    // An hour from the same start: it overlaps the old half hour, which the host must leave out.
    const later: Booking = { ...booking('bob', 'b6'), end_ms: utc('2024-07-16T14:00:00Z') };
    const moved = await bookAs(bob, later, 'b5');
    expect(moved.kind === 'confirmed' && moved.booking.state).toEqual({ rescheduled: { from: 'b5' } });
    const old = shared.get('authored:n1:ana|cal/event/b5');
    expect(old === undefined ? null : engine.decodeEvent(old).status).toEqual({ cancelled: { by: 'bob', reason: 'rescheduled' } });
    expect([...shared.keys()].filter((k) => k.startsWith('user:bob|cal/private/'))).toEqual(['user:bob|cal/private/b6']);
  });
});
