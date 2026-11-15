/**
 * A group type's seats (design §3.6.3), decided by the host's instance at claim: a slot of a group
 * type stays bookable while it has seats left, so the bookings already in that very slot of that
 * type do not make the host busy for the next booker until the last seat is taken.
 */
import type { CalendarEngine } from './engine/calendar-engine';
import type { Booking } from './generated/Booking';
import type { EventType } from './generated/EventType';

const live = (b: Booking): boolean => b.state === 'confirmed' || (typeof b.state === 'object' && 'rescheduled' in b.state);

/**
 * The ids of the host's bookings that share `booking`'s seat-limited slot and still leave a seat:
 * the events the claim's busy check leaves out. Empty for any other kind, or when the slot is full.
 */
export function sharedSeats(type: EventType, booking: Booking, acks: readonly Booking[], engine: Pick<CalendarEngine, 'team'>): string[] {
  if (typeof type.kind !== 'object' || !('group' in type.kind)) return [];
  const same: Booking[] = acks.filter((b: Booking) => b.id !== booking.id && live(b) && b.type_id === booking.type_id
    && b.start_ms === booking.start_ms && b.end_ms === booking.end_ms);
  return engine.team.seatsLeft(type.kind.group.seats, same.length) > 0 ? same.map((b: Booking) => b.id) : [];
}
