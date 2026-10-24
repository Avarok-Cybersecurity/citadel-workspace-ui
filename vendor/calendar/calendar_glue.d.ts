/* tslint:disable */
/* eslint-disable */

/**
 * The core's zoned questions, bound to the page's offsets.
 */
export class CalendarEngine {
    free(): void;
    [Symbol.dispose](): void;
    civilOf(zone: any, utc_ms: any): any;
    /**
     * The occurrences of a recurrence, its wall times in `zone`, that overlap `[fromMs, toMs)`.
     */
    expand(recurrence: any, zone: any, from_ms: any, to_ms: any): any;
    freeSlots(request: any): any;
    /**
     * The VEVENTs of an ICS file as drafts, floating times read in `floating`.
     */
    importIcs(text: string, floating: any): any;
    instantOf(zone: any, local: any): any;
    /**
     * `offset_at(zone: string, utcMs: number): number | null`, seconds east of UTC.
     */
    constructor(offset_at: Function);
    /**
     * Whether the request offers `slot`: what a host's instance asks before it claims.
     */
    offers(request: any, slot: any): any;
    resolve(zone: any, local: any): any;
}

export function addDays(date: any, days: number): any;

export function addMonths(date: any, months: number): any;

export function collectiveSlots(per_host: any): any;

export function decodeAvailability(bytes: Uint8Array): any;

export function decodeBooking(bytes: Uint8Array): any;

export function decodeChange(bytes: Uint8Array): any;

export function decodeEvent(bytes: Uint8Array): any;

export function decodeEventType(bytes: Uint8Array): any;

export function decodeProjection(bytes: Uint8Array): any;

export function encodeAvailability(value: any): Uint8Array;

export function encodeBooking(value: any): Uint8Array;

/**
 * A `cal` topic message: `{ node, key }` and nothing else.
 */
export function encodeChange(change: any): Uint8Array;

/**
 * An event's stored bytes: versioned CBOR, refused past `EVENT_MAX_BYTES`.
 */
export function encodeEvent(event: any): Uint8Array;

export function encodeEventType(value: any): Uint8Array;

export function encodeProjection(value: any): Uint8Array;

export function exportIcs(events: any): any;

export function fanOutPlan(event: any, subtree: any): any;

export function monthGrid(year: number, month: number): any;

/**
 * The free hosts, in the order a booking tries them.
 */
export function rankHosts(strategy: any, hosts: any, free: any, confirmed: any): any;

/**
 * What a reader does with a projection, given what it can read of its origin.
 */
export function reconcile(projection: any, origin: any): any;

export function shownUpAt(event: any, reader_chain: any): any;

export function upPullTargets(descendants: any): any;

export function weekOf(date: any): any;

export function weekdayOf(date: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_calendarengine_free: (a: number, b: number) => void;
    readonly addDays: (a: number, b: number, c: number) => void;
    readonly addMonths: (a: number, b: number, c: number) => void;
    readonly calendarengine_civilOf: (a: number, b: number, c: number, d: number) => void;
    readonly calendarengine_expand: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly calendarengine_freeSlots: (a: number, b: number, c: number) => void;
    readonly calendarengine_importIcs: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly calendarengine_instantOf: (a: number, b: number, c: number, d: number) => void;
    readonly calendarengine_new: (a: number) => number;
    readonly calendarengine_offers: (a: number, b: number, c: number, d: number) => void;
    readonly calendarengine_resolve: (a: number, b: number, c: number, d: number) => void;
    readonly collectiveSlots: (a: number, b: number) => void;
    readonly decodeAvailability: (a: number, b: number, c: number) => void;
    readonly decodeBooking: (a: number, b: number, c: number) => void;
    readonly decodeChange: (a: number, b: number, c: number) => void;
    readonly decodeEvent: (a: number, b: number, c: number) => void;
    readonly decodeEventType: (a: number, b: number, c: number) => void;
    readonly decodeProjection: (a: number, b: number, c: number) => void;
    readonly encodeAvailability: (a: number, b: number) => void;
    readonly encodeBooking: (a: number, b: number) => void;
    readonly encodeChange: (a: number, b: number) => void;
    readonly encodeEvent: (a: number, b: number) => void;
    readonly encodeEventType: (a: number, b: number) => void;
    readonly encodeProjection: (a: number, b: number) => void;
    readonly exportIcs: (a: number, b: number) => void;
    readonly fanOutPlan: (a: number, b: number, c: number) => void;
    readonly monthGrid: (a: number, b: number, c: number) => void;
    readonly rankHosts: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly reconcile: (a: number, b: number, c: number) => void;
    readonly shownUpAt: (a: number, b: number, c: number) => void;
    readonly upPullTargets: (a: number, b: number) => void;
    readonly weekOf: (a: number, b: number) => void;
    readonly weekdayOf: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
