/**
 * The Calendar's core in the page, typed (Calendar design 3.2). The glue's exports take and give
 * untyped values; this is the one place they get the core's generated types, and the one place a
 * refusal the core throws becomes a `CalendarRefusal`. The store and the views use this, never
 * the glue.
 */
import type { Availability } from '../generated/Availability';
import type { Booking } from '../generated/Booking';
import type { CalChange } from '../generated/CalChange';
import type { CivilDate } from '../generated/CivilDate';
import type { CivilDateTime } from '../generated/CivilDateTime';
import type { Event } from '../generated/Event';
import type { EventType } from '../generated/EventType';
import type { Expansion } from '../generated/Expansion';
import type { HostCount } from '../generated/HostCount';
import type { IcsFile } from '../generated/IcsFile';
import type { Imported } from '../generated/Imported';
import type { Interval } from '../generated/Interval';
import type { OriginRead } from '../generated/OriginRead';
import type { Projection } from '../generated/Projection';
import type { Reconciled } from '../generated/Reconciled';
import type { Recurrence } from '../generated/Recurrence';
import type { Refusal } from '../generated/Refusal';
import type { RefusalCode } from '../generated/RefusalCode';
import type { Resolution } from '../generated/Resolution';
import type { SlotRequest } from '../generated/SlotRequest';
import type { Strategy } from '../generated/Strategy';
import type { UpPull } from '../generated/UpPull';
import type { Weekday } from '../generated/Weekday';
import type { Write } from '../generated/Write';
import type { CalendarGlue } from './load-calendar-wasm';
import type { OffsetAt } from './intl-offsets';

/** A value the core refused, with the core's code for why. */
export class CalendarRefusal extends Error {
  readonly code: RefusalCode;
  readonly detail: string | null;
  constructor(refusal: Refusal) {
    super(refusal.detail === null ? refusal.code : `${refusal.code}: ${refusal.detail}`);
    this.name = 'CalendarRefusal';
    this.code = refusal.code;
    this.detail = refusal.detail;
  }
}

function isRefusal(thrown: unknown): thrown is Refusal {
  if (typeof thrown !== 'object' || thrown === null) return false;
  const fields: Record<string, unknown> = thrown as Record<string, unknown>;
  return typeof fields.code === 'string' && (fields.detail === null || typeof fields.detail === 'string');
}

/** Runs one glue call; the core's refusal is rethrown typed, anything else as it was. */
function call<T>(body: () => unknown): T {
  try {
    return body() as T;
  } catch (thrown: unknown) {
    if (isRefusal(thrown)) throw new CalendarRefusal(thrown);
    throw thrown;
  }
}

export class CalendarEngine {
  private readonly glue: CalendarGlue;
  private readonly zoned: InstanceType<CalendarGlue['CalendarEngine']>;

  /** Over an initialised glue and the page's time-zone database. */
  constructor(glue: CalendarGlue, offsetAt: OffsetAt) {
    this.glue = glue;
    this.zoned = new glue.CalendarEngine(offsetAt);
  }

  resolve(zone: string, local: CivilDateTime): Resolution {
    return call((): unknown => this.zoned.resolve(zone, local));
  }
  instantOf(zone: string, local: CivilDateTime): bigint {
    return call((): unknown => this.zoned.instantOf(zone, local));
  }
  civilOf(zone: string, utcMs: bigint): CivilDateTime {
    return call((): unknown => this.zoned.civilOf(zone, utcMs));
  }
  expand(recurrence: Recurrence, zone: string, fromMs: bigint, toMs: bigint): Expansion {
    return call((): unknown => this.zoned.expand(recurrence, zone, fromMs, toMs));
  }
  freeSlots(request: SlotRequest): Interval[] {
    return call((): unknown => this.zoned.freeSlots(request));
  }
  offers(request: SlotRequest, slot: Interval): boolean {
    return call((): unknown => this.zoned.offers(request, slot));
  }
  importIcs(text: string, floatingZone: string): Imported {
    return call((): unknown => this.zoned.importIcs(text, floatingZone));
  }
  addDays(date: CivilDate, days: number): CivilDate {
    return call((): unknown => this.glue.addDays(date, days));
  }
  /** The day clamped to the target month's length. */
  addMonths(date: CivilDate, months: number): CivilDate {
    return call((): unknown => this.glue.addMonths(date, months));
  }
  /** Monday to Sunday. */
  weekOf(date: CivilDate): CivilDate[] {
    return call((): unknown => this.glue.weekOf(date));
  }
  /** Whole Monday-first weeks from the week of the 1st to the week of the last day. */
  monthGrid(year: number, month: number): CivilDate[] {
    return call((): unknown => this.glue.monthGrid(year, month));
  }
  weekdayOf(date: CivilDate): Weekday {
    return call((): unknown => this.glue.weekdayOf(date));
  }
  rankHosts(strategy: Strategy, hosts: string[], free: string[], confirmed: HostCount[]): string[] {
    return call((): unknown => this.glue.rankHosts(strategy, hosts, free, confirmed));
  }
  collectiveSlots(perHost: Interval[][]): Interval[] {
    return call((): unknown => this.glue.collectiveSlots(perHost));
  }
  fanOutPlan(event: Event, subtree: string[]): Write[] {
    return call((): unknown => this.glue.fanOutPlan(event, subtree));
  }
  shownUpAt(event: Event, readerChain: string[]): boolean {
    return call((): unknown => this.glue.shownUpAt(event, readerChain));
  }
  upPullTargets(descendants: string[]): UpPull {
    return call((): unknown => this.glue.upPullTargets(descendants));
  }
  reconcile(projection: Projection, origin: OriginRead): Reconciled {
    return call((): unknown => this.glue.reconcile(projection, origin));
  }
  exportIcs(events: Event[]): IcsFile {
    return call((): unknown => this.glue.exportIcs(events));
  }
  encodeEvent(event: Event): Uint8Array {
    return call((): unknown => this.glue.encodeEvent(event));
  }
  decodeEvent(bytes: Uint8Array): Event {
    return call((): unknown => this.glue.decodeEvent(bytes));
  }
  encodeAvailability(value: Availability): Uint8Array {
    return call((): unknown => this.glue.encodeAvailability(value));
  }
  decodeAvailability(bytes: Uint8Array): Availability {
    return call((): unknown => this.glue.decodeAvailability(bytes));
  }
  encodeEventType(value: EventType): Uint8Array {
    return call((): unknown => this.glue.encodeEventType(value));
  }
  decodeEventType(bytes: Uint8Array): EventType {
    return call((): unknown => this.glue.decodeEventType(bytes));
  }
  encodeBooking(value: Booking): Uint8Array {
    return call((): unknown => this.glue.encodeBooking(value));
  }
  decodeBooking(bytes: Uint8Array): Booking {
    return call((): unknown => this.glue.decodeBooking(bytes));
  }
  encodeProjection(value: Projection): Uint8Array {
    return call((): unknown => this.glue.encodeProjection(value));
  }
  decodeProjection(bytes: Uint8Array): Projection {
    return call((): unknown => this.glue.decodeProjection(bytes));
  }
  encodeChange(change: CalChange): Uint8Array {
    return call((): unknown => this.glue.encodeChange(change));
  }
  decodeChange(bytes: Uint8Array): CalChange {
    return call((): unknown => this.glue.decodeChange(bytes));
  }
}
