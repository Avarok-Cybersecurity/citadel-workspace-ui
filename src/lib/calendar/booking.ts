/**
 * Booking a member (design §3.6.1): the booking the invitee's choice makes, and its offline path.
 * A booking request is written to the booker's own authored namespace on the node
 * (`cal/booking/<id>`, state `requested`), where the host's next mounted instance finds it and
 * answers in theirs (`cal/booking-ack/<id>`). The live claim on the host's instance (`POST /book`)
 * is tried first when it exists; this is what a booking falls back to when the host is not online.
 */
import type { BookingChoice, BookOutcome } from './booking-form';
import type { CalendarEngine } from './engine/calendar-engine';
import type { Booking } from './generated/Booking';
import { PortRefused, refusalCopy, type CalendarPorts } from './ports';

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
