/**
 * Everything an app can reach, as interfaces the page injects (SBIO): the dispatcher is pure over
 * these, tests pass fakes, and the real transports (agent KV, kernel AppsRequest::Call, agent
 * AppFetch, the P2P ihttp envelope) are later streams. A port that is not injected answers
 * `{refused: {unavailable: <port>}}`; nothing here has a default implementation.
 *
 * Every call method takes the call's decoded CBOR arguments and answers a PortAnswer. The
 * arguments are a CBOR map, typed loosely on purpose until `citadel-app-sdk-types` exports the
 * HostCall shapes (ts-rs); each port validates the fields it reads and answers `{refused:
 * {policy: "bad_arguments"}}` for a shape it does not accept. Identity, scope and storage
 * namespace are NEVER read from the arguments: the port binds them from the install record.
 */
import type { CborMap } from './cbor';
import type { IhttpFrame, IhttpPeer } from './ihttp-types';

/** Why a call was not carried out (R4.6 `Refused`), serde externally tagged, snake_case. */
export type Refused =
  | 'ungranted'
  | { readonly unavailable: string }
  | { readonly limit: string }
  | { readonly policy: string }
  | { readonly remote: number };

export type PortAnswer = { readonly ok: unknown } | { readonly refused: Refused };

/** A port may answer at once (the canvas, the log) or later (anything crossing a thread or a socket). */
export type PortReply = PortAnswer | Promise<PortAnswer>;

export type PortCall = (args: CborMap) => PortReply;

/** storage.user / scope / node / local KV; `args.backend` names which. */
export interface StoragePort {
  readonly get: PortCall;
  readonly set: PortCall;
  readonly setMany: PortCall;
  readonly delete: PortCall;
  readonly list: PortCall;
}

export interface BlobPort {
  readonly put: PortCall;
  readonly get: PortCall;
  readonly delete: PortCall;
}

/** Egress from the member's own machine via the local agent's AppFetch; absent without an agent. */
export interface HostNetPort {
  readonly fetch: PortCall;
}

/** Egress from the workspace server (kernel EgressFetcher), metered as bytes_in. */
export interface ServerNetPort {
  readonly fetch: PortCall;
}

/** One inbound internal-HTTP frame, with the caller the session (never the app) vouches for. */
export interface InboundIhttpFrame {
  readonly from: IhttpPeer;
  readonly frame: IhttpFrame;
}

export interface IhttpPort {
  /** AppsRequest::AdvertiseService (and the ILM IHTTP flag) for these routes. */
  readonly advertise: PortCall;
  /** A frame back to a caller on a stream this instance serves (the router admitted it first). */
  readonly respond: (peer: IhttpPeer, frame: IhttpFrame) => PortReply;
  /** A client frame to an InternalHttpServer: `{to: Address, frame}`; the kernel/session re-checks `to`. */
  readonly call: PortCall;
  /** Inbound frames for this instance's install; returns the unsubscribe. */
  readonly onFrame: (listener: (inbound: InboundIhttpFrame) => void) => () => void;
}

export interface NodesPort {
  readonly read: PortCall;
  readonly children: PortCall;
  readonly create: PortCall;
  readonly rename: PortCall;
  readonly move: PortCall;
}

export interface MdPort {
  readonly replaceRegion: PortCall;
  readonly append: PortCall;
}

export interface FilesPort {
  readonly read: PortCall;
  readonly list: PortCall;
  readonly write: PortCall;
}

export interface ChatPort {
  readonly read: PortCall;
  readonly send: PortCall;
}

export interface MembersPort {
  readonly list: PortCall;
  readonly presence: PortCall;
}

/** Host-mediated; the port requires a live user gesture and refuses `{policy: "no_gesture"}`. */
export interface ClipboardPort {
  readonly read: PortCall;
  readonly write: PortCall;
}

export interface NotifyPort {
  readonly toast: PortCall;
}

/** Internal links only: the dispatcher classifies the href first and hands over a router path. */
export interface NavigatePort {
  readonly currentUrl: () => string;
  readonly open: (routerPath: string) => PortReply;
}

/** Host-rendered chrome from data (strings become text nodes, badged with the app's name). */
export interface UiPort {
  readonly setToolbar: PortCall;
  readonly openMenu: PortCall;
  readonly dialog: PortCall;
  readonly toast: PortCall;
  readonly requestHeight: PortCall;
}

/** The instance's OffscreenCanvas, drawn in the worker. */
export interface CanvasPort {
  readonly draw: PortCall;
  readonly size: PortCall;
}

export interface EventsPort {
  readonly setInterest: PortCall;
}

/** The CRDT relay; first-party key only (the install grant decides, not this port). */
export interface DocumentsPort {
  readonly relay: PortCall;
}

export interface LogPort {
  readonly write: PortCall;
}

export interface HostPorts {
  readonly storage?: StoragePort;
  readonly blob?: BlobPort;
  readonly hostNet?: HostNetPort;
  readonly serverNet?: ServerNetPort;
  readonly ihttp?: IhttpPort;
  readonly nodes?: NodesPort;
  readonly md?: MdPort;
  readonly files?: FilesPort;
  readonly chat?: ChatPort;
  readonly members?: MembersPort;
  readonly clipboard?: ClipboardPort;
  readonly notify?: NotifyPort;
  readonly navigate?: NavigatePort;
  readonly ui?: UiPort;
  readonly canvas?: CanvasPort;
  readonly events?: EventsPort;
  readonly documents?: DocumentsPort;
  readonly log?: LogPort;
}

export type PortKey = keyof HostPorts;
