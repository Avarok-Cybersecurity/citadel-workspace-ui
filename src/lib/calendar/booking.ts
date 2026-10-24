/**
 * Booking a member (design §3.6.1), the booker's side: the booking the invitee's choice makes,
 * claimed live on the host's instance (`POST /book`, booking-host.ts), which answers 201 with the
 * confirmed booking or 409 with other times. When no instance of the host is online (the relay's
 * `no_host`, or any plane unavailable), the booking is left as a request in the booker's own
 * authored namespace on the node (`cal/booking/<id>`), which the host's next instance answers in
 * theirs (`cal/booking-ack/<id>`). A confirmed booking is kept in the booker's own calendar too.
 */
import { IhttpCancelled, type IhttpClient, type IhttpResponse } from '@/lib/citadel-apps/glue-sdk/ihttp-client';
import { CALENDAR_APP_ID } from './app-id';
import type { BookingChoice, BookOutcome } from './booking-form';
import { BOOK_PATH, cancelPath, decodeAlternatives, decodeReason, encodeCancel, reschedulePath } from './booking-wire';
import type { CalendarEngine } from './engine/calendar-engine';
import type { Booking } from './generated/Booking';
import type { Event } from './generated/Event';
import { PortRefused, refusalCopy, type CalendarPorts } from './ports';
import { PRIVATE_PREFIX } from './read-sources';

export const BOOKING_PREFIX: string = 'cal/booking/';
export const BOOKING_ACK_PREFIX: string = 'cal/booking-ack/';

export interface BookingContext {
  readonly id: string;
  readonly node: string;
  readonly host: string;
  readonly me: string;
}

/** The booking a choice makes: on the host's page on this node (its slug is the node's id). */
export function bookingOf(choice: BookingChoice, ctx: BookingContext): Booking {
  return {
    id: ctx.id, page: { member: { username: ctx.host, slug: ctx.node } }, type_id: choice.type.id, host: ctx.host,
    booker: { member: { username: ctx.me } }, start_ms: choice.slot.start_ms, end_ms: choice.slot.end_ms,
    zone: choice.zone, answers: choice.answers, state: 'requested',
  };
}

export async function requestBooking(ports: CalendarPorts, engine: CalendarEngine, booking: Booking, node: string, me: string): Promise<BookOutcome> {
  try {
    await ports.storage.set({ kind: 'authored', node, author: me }, `${BOOKING_PREFIX}${booking.id}`, engine.encodeBooking(booking));
    return { kind: 'requested', booking };
  } catch (e: unknown) {
    if (e instanceof PortRefused) return { kind: 'failed', reason: refusalCopy(e.refused) };
    throw e;
  }
}

export interface BookerDeps {
  readonly ports: CalendarPorts;
  readonly engine: CalendarEngine;
  readonly client: IhttpClient;
  readonly node: string;
  readonly me: string;
  /** The booker's own copy's title: "Intro call with Ana". */
  readonly title: string;
  readonly nowMs: bigint;
}

const hostAddress = (host: string) => ({ user: { app_id: CALENDAR_APP_ID, username: host } });

/** What the host answered when it was not a booking, in words. */
function answered(host: string, r: IhttpResponse): string {
  const reason: string | null = decodeReason(r.body);
  return reason === null ? `${host} answered ${r.status}` : `${host} refused it: ${reason}`;
}

function ownCopy(booking: Booking, d: BookerDeps): Event {
  return {
    id: booking.id, rev: 1, origin_node: d.node, author: d.me, title: d.title, body: null, kind: { booking: { booking_id: booking.id } },
    status: 'confirmed', when: { once: { start_ms: booking.start_ms, end_ms: booking.end_ms } }, zone: booking.zone, location: 'in_app',
    hosts: [booking.host], invitees: [{ member: { username: d.me } }], visibility: 'private', propagate: { down: false, up_to: null },
    reminders: [], notes_doc: null, source: null, created_ms: d.nowMs, updated_ms: d.nowMs,
  };
}

/** Books `booking`; with `replacing`, moves that booking of the same host to this one instead. */
export async function book(d: BookerDeps, booking: Booking, replacing: string | null): Promise<BookOutcome> {
  let r: IhttpResponse;
  try {
    const path: string = replacing === null ? BOOK_PATH : reschedulePath(replacing);
    r = await d.client.request(hostAddress(booking.host), 'prefer_p2p_then_relay', 'POST', path, d.engine.encodeBooking(booking));
  } catch (e: unknown) {
    const unavailable: boolean = e instanceof PortRefused && typeof e.refused === 'object' && 'unavailable' in e.refused;
    if (unavailable && replacing === null) return requestBooking(d.ports, d.engine, booking, d.node, d.me);
    if (e instanceof PortRefused) return { kind: 'failed', reason: refusalCopy(e.refused) };
    if (e instanceof IhttpCancelled) return { kind: 'failed', reason: `the booking was cut off (${e.reason})` };
    throw e;
  }
  if (r.from.username !== booking.host) return { kind: 'failed', reason: `${r.from.username} answered for ${booking.host}` };
  if (r.status === 409) return { kind: 'taken', alternatives: decodeAlternatives(r.body) ?? [] };
  if (r.status !== 201) return { kind: 'failed', reason: answered(booking.host, r) };
  const confirmed: Booking = d.engine.decodeBooking(r.body);
  await d.ports.storage.set({ kind: 'user' }, `${PRIVATE_PREFIX}${confirmed.id}`, d.engine.encodeEvent(ownCopy(confirmed, d)));
  if (replacing !== null) await d.ports.storage.remove({ kind: 'user' }, `${PRIVATE_PREFIX}${replacing}`);
  return { kind: 'confirmed', booking: confirmed };
}

/** Cancels booking `id` with `host`, saying why; the host records who cancelled from the session. */
export async function cancelBooking(client: IhttpClient, host: string, id: string, reason: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const r: IhttpResponse = await client.request(hostAddress(host), 'prefer_p2p_then_relay', 'POST', cancelPath(id), encodeCancel(reason));
    return r.status === 200 ? { ok: true } : { ok: false, reason: answered(host, r) };
  } catch (e: unknown) {
    if (e instanceof PortRefused) return { ok: false, reason: refusalCopy(e.refused) };
    if (e instanceof IhttpCancelled) return { ok: false, reason: `the cancellation was cut off (${e.reason})` };
    throw e;
  }
}

/** What the reader is to a booking event: its host (their event) or its booker (their own copy). */
export type BookingRole = { readonly kind: 'host'; readonly id: string } | { readonly kind: 'booker'; readonly id: string; readonly host: string };

export function bookingRole(event: Event, me: string): BookingRole | null {
  if (typeof event.kind !== 'object' || event.status !== 'confirmed' || event.author !== me) return null;
  const id: string = event.kind.booking.booking_id;
  if (event.hosts.includes(me)) return { kind: 'host', id };
  const host: string | undefined = event.hosts[0];
  return event.visibility === 'private' && host !== undefined ? { kind: 'booker', id, host } : null;
}

/** The booker cancels with the host, then marks their own copy cancelled. */
export async function cancelAsBooker(d: Pick<BookerDeps, 'ports' | 'engine' | 'client' | 'me' | 'nowMs'>, own: Event, host: string, id: string, reason: string | null): Promise<string | null> {
  const done = await cancelBooking(d.client, host, id, reason);
  if (!done.ok) return done.reason;
  const cancelled: Event = { ...own, status: { cancelled: { by: d.me, reason } }, rev: own.rev + 1, updated_ms: d.nowMs };
  await d.ports.storage.set({ kind: 'user' }, `${PRIVATE_PREFIX}${own.id}`, d.engine.encodeEvent(cancelled));
  return null;
}
