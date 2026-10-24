/**
 * The host's side of booking (design §3.6.1 steps 3-5), in the host's mounted instance: `/book`,
 * `/book/:id/cancel` and `/book/:id/reschedule`, and the requests left while the host was away.
 * Claims run one at a time, each against the host's page and events read fresh, so the second of
 * two racing bookers is told the time is taken and offered others.
 *
 * What the host writes is its own: the booking's event (busy-only) and its acknowledgement
 * (`cal/booking-ack/<id>`), both in the host's authored namespace on the node.
 */
import { ihttpEndpoint, type IhttpEndpoint } from '@/lib/citadel-apps/glue-sdk/ihttp-endpoint';
import type { IhttpMessage } from '@/lib/citadel-apps/glue-sdk/ihttp-io';
import type { ServeOn } from '@/lib/citadel-apps/sdk/generated/ServeOn';
import type { IhttpRequest } from '@/lib/citadel-apps/glue-sdk/ihttp-server';
import { BOOKING_ACK_PREFIX, BOOKING_PREFIX } from './booking';
import { decideClaim, type ClaimVerdict } from './booking-claim';
import { busyOf, readBookingPage } from './booking-pages';
import { BOOKING_ROUTES, decodeCancel, encodeAlternatives, encodeReason, routeOf } from './booking-wire';
import type { CalendarEngine } from './engine/calendar-engine';
import type { Booking } from './generated/Booking';
import type { Event } from './generated/Event';
import type { CalendarPorts, CalendarStore } from './ports';
import { EVENT_PREFIX, readSource } from './read-sources';
import type { CalendarEntry } from './store';

export interface HostDeps {
  readonly ports: CalendarPorts;
  readonly engine: CalendarEngine;
  readonly node: string;
  readonly me: string;
  readonly nowMs: () => bigint;
}

const reply = (status: number, body: Uint8Array = new Uint8Array()): IhttpMessage => ({ status, body });
const refuse = (status: number, reason: string): IhttpMessage => reply(status, encodeReason(reason));

export class BookingHost {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly mine: CalendarStore;

  constructor(private readonly d: HostDeps) {
    this.mine = { kind: 'authored', node: d.node, author: d.me };
  }

  /** One claim, cancel or reschedule at a time, in arrival order: the serializer the design names. */
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const turn: Promise<T> = this.queue.then(work);
    this.queue = turn.catch((): void => {});
    return turn;
  }

  readonly handle = (request: IhttpRequest): Promise<IhttpMessage> => this.serialized(() => this.route(request));

  /** The host cancels one of their own bookings, from their calendar. */
  readonly cancelAsHost = (id: string, reason: string | null): Promise<IhttpMessage> => this.serialized(() => this.cancel(id, this.d.me, reason, 'cancelled'));

  private async route(request: IhttpRequest): Promise<IhttpMessage> {
    const route = routeOf(request.path);
    if (request.method !== 'POST' || route === null) return refuse(404, 'no such route');
    if (route.kind === 'cancel') {
      const body = decodeCancel(request.body);
      return body === null ? refuse(400, 'not a cancellation') : this.cancel(route.id, request.caller.username, body.reason, 'cancelled');
    }
    let booking: Booking;
    try {
      booking = this.d.engine.decodeBooking(request.body);
    } catch {
      return refuse(400, 'not a booking');
    }
    if (route.kind === 'book') return this.claim(booking, request.caller.username, null);
    return this.claim({ ...booking, state: { rescheduled: { from: route.id } } }, request.caller.username, route.id);
  }

  /** The host's events now, the one being rescheduled left out. */
  private async entries(except: string | null): Promise<CalendarEntry[]> {
    const { ports, engine, node } = this.d;
    const read = await Promise.all([readSource(ports, engine, 'authored', node), readSource(ports, engine, 'node', node)]);
    return read.flatMap((r) => r.entries).filter((e: CalendarEntry) => e.source === 'inherited' || e.event.id !== except);
  }

  async decide(booking: Booking, caller: string, except: string | null): Promise<ClaimVerdict> {
    const { ports, engine, node, me } = this.d;
    const [page, entries] = await Promise.all([readBookingPage(ports, engine, node, me), this.entries(except)]);
    const busy = (fromMs: bigint, toMs: bigint, zone: string) => busyOf(entries, me, zone, { fromMs, toMs }, engine);
    return decideClaim({ booking, caller, host: me, node, page, busy, nowMs: this.d.nowMs() }, engine);
  }

  private async claim(booking: Booking, caller: string, rescheduling: string | null): Promise<IhttpMessage> {
    if (rescheduling !== null) {
      const old: Booking | null = await this.ack(rescheduling);
      if (old === null) return refuse(404, 'no such booking');
      if (!this.mayChange(old, caller)) return refuse(403, 'only its booker or host may change a booking');
    }
    const verdict: ClaimVerdict = await this.decide(booking, caller, rescheduling);
    if (verdict.kind === 'refused') return refuse(verdict.status, verdict.reason);
    if (verdict.kind === 'taken') return reply(409, encodeAlternatives(verdict.alternatives));
    await this.confirm(verdict.booking, verdict.event);
    if (rescheduling !== null) await this.cancel(rescheduling, caller, null, 'rescheduled');
    return reply(201, this.d.engine.encodeBooking(verdict.booking));
  }

  private async confirm(booking: Booking, event: Event): Promise<void> {
    const { ports, engine } = this.d;
    await ports.storage.setMany(this.mine, [
      { key: `${EVENT_PREFIX}${booking.id}`, value: engine.encodeEvent(event) },
      { key: `${BOOKING_ACK_PREFIX}${booking.id}`, value: engine.encodeBooking(booking) },
    ]);
    // The booking is made once it is written; telling the host is not part of it, so a refused
    // notification (an install without `notifications`) is reported, never the booking failed.
    await ports.notify('New booking', event.title).catch((e: unknown): void => { console.error('[calendar] the host was not notified of a booking', e); });
  }

  private async ack(id: string): Promise<Booking | null> {
    const bytes: Uint8Array | null = await this.d.ports.storage.get(this.mine, `${BOOKING_ACK_PREFIX}${id}`);
    return bytes === null ? null : this.d.engine.decodeBooking(bytes);
  }

  private mayChange(booking: Booking, who: string): boolean {
    return who === booking.host || ('member' in booking.booker && booking.booker.member.username === who);
  }

  private async cancel(id: string, by: string, reason: string | null, why: 'cancelled' | 'rescheduled'): Promise<IhttpMessage> {
    const { ports, engine } = this.d;
    const booking: Booking | null = await this.ack(id);
    if (booking === null) return refuse(404, 'no such booking');
    if (!this.mayChange(booking, by)) return refuse(403, 'only its booker or host may cancel a booking');
    const bytes: Uint8Array | null = await ports.storage.get(this.mine, `${EVENT_PREFIX}${id}`);
    const said: string | null = why === 'rescheduled' ? 'rescheduled' : reason;
    const cancelled: Booking = { ...booking, state: { cancelled: { by, reason: said } } };
    const writes = [{ key: `${BOOKING_ACK_PREFIX}${id}`, value: engine.encodeBooking(cancelled) }];
    if (bytes !== null) {
      const event: Event = engine.decodeEvent(bytes);
      writes.push({ key: `${EVENT_PREFIX}${id}`, value: engine.encodeEvent({ ...event, status: { cancelled: { by, reason: said } }, rev: event.rev + 1, updated_ms: this.d.nowMs() }) });
    }
    await ports.storage.setMany(this.mine, writes);
    return reply(200, engine.encodeBooking(cancelled));
  }

  /**
   * The requests members left while the host was away (`cal/booking/<id>` in each booker's
   * namespace), each not yet answered: decided as a live claim would be, the namespace's author
   * (which the kernel stamps) standing for the caller, and answered in an ack. Returns how many.
   */
  async answerRequests(): Promise<number> {
    const { ports, engine, node, me } = this.d;
    const keys = await ports.storage.authoredKeys(node, BOOKING_PREFIX);
    let answered: number = 0;
    for (const k of keys) {
      const id: string = k.key.slice(BOOKING_PREFIX.length);
      if ((await this.ack(id)) !== null) continue;
      const bytes: Uint8Array | null = await ports.storage.get({ kind: 'authored', node, author: k.author }, k.key);
      if (bytes === null) continue;
      const booking: Booking = engine.decodeBooking(bytes);
      if (booking.host !== me) continue;
      const answer: IhttpMessage = await this.serialized(() => this.claim(booking, k.author, null));
      if (answer.status !== 201) await ports.storage.set(this.mine, `${BOOKING_ACK_PREFIX}${id}`, engine.encodeBooking({ ...booking, state: 'declined' }));
      answered += 1;
    }
    return answered;
  }
}

/**
 * This instance's iHTTP, answering bookings with `host`: listening first, so no frame is missed,
 * then advertising the routes on the planes the install holds. With neither plane held it serves
 * nothing, and bookers leave requests (`answerRequests` answers them).
 */
export async function serveBookings(ports: CalendarPorts, host: BookingHost, on: ServeOn | null): Promise<IhttpEndpoint> {
  const endpoint: IhttpEndpoint = ihttpEndpoint(ports.ihttp, host.handle);
  if (on !== null) await ports.ihttp.serve(BOOKING_ROUTES, on);
  return endpoint;
}
