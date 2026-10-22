/**
 * Internal HTTP over the workspace server's relay (R4.4): serving advertises the routes
 * (`AdvertiseService`, again every minute while mounted), a client frame and a response frame go
 * out as `IhttpSend`, and frames the server relays to this install arrive pushed as
 * `AppsResponse::IhttpFrame`, stamped with who sent them by the server, never by an app. Frames
 * are CBOR of the wire's `IhttpFrame` (citadel-ihttp-types) both ways, translated from and to
 * the app's shapes by host/ihttp-wire.ts, so there is no textual HTTP to smuggle through.
 *
 * The P2P path (the agent's `IhttpSend` to a peer CID) is preferred by the design and not used
 * here yet; every frame is `via: relay`.
 */
import type { IhttpAddress } from 'citadel-workspace-client-ts';
import type { AppsResult } from '@/lib/workspace-service/apps-operations';
import { readAppsAnswer, type AppsAnswer } from '../wire/apps-answer';
import { decodeCbor, encodeCbor, type Decoded } from '../host/cbor';
import { fromWireFrame, toWireFrame } from '../host/ihttp-wire';
import type { IhttpPort, InboundIhttpFrame, PortAnswer } from '../host/ports';
import type { Address } from '../sdk/generated/Address';
import type { Caller } from '../sdk/generated/Caller';
import type { IhttpFrame } from '../sdk/generated/IhttpFrame';
import type { Route } from '../sdk/generated/Route';
import { refusedFor } from './kernel-call-ports';

/** An advertisement lives this long; it is renewed every ADVERTISE_EVERY_MS while mounted. */
export const ADVERTISE_TTL_MS: number = 90_000;
export const ADVERTISE_EVERY_MS: number = 60_000;

export interface RelayDeps {
  readonly installId: string;
  readonly send: (to: IhttpAddress, frame: Uint8Array) => Promise<AppsResult<null>>;
  readonly advertise: (routesDigest: string, untilMs: bigint) => Promise<AppsResult<bigint>>;
  /** Every apps answer the server pushes to this tab (`workspace:apps`); returns the unsubscribe. */
  readonly pushes: (listener: (answer: unknown) => void) => () => void;
  readonly sha256Hex: (bytes: Uint8Array) => Promise<string>;
  readonly nowMs: () => number;
  readonly every: (ms: number, fire: () => void) => () => void;
}

export const addressFor = (to: Address): IhttpAddress =>
  ('user' in to ? { User: { app_id: to.user.app_id, username: to.user.username } } : { Scope: { app_id: to.scope.app_id, scope_key: to.scope.scope_key } });

/**
 * The one definition of `routes_digest` on the page (the kernel's is kernel/apps/ihttp_routes.rs):
 * lowercase hex sha256 of the routes as a manifest writes them (`METHOD /path`), sorted, one per
 * line. The kernel takes an advertisement only for the table the installer consented to.
 */
export function routesDigest(routes: readonly Route[], sha256Hex: (bytes: Uint8Array) => Promise<string>): Promise<string> {
  const lines: string[] = routes.map((r: Route) => `${r.method} ${r.path}`).sort();
  return sha256Hex(new TextEncoder().encode(lines.join('\n')));
}

const wire = (frame: IhttpFrame): Uint8Array => encodeCbor(toWireFrame(frame));

const sent = (r: AppsResult<unknown>): PortAnswer<null> => (r.ok ? { ok: null } : { refused: refusedFor(r.refusal) });

export function relayIhttpPort(d: RelayDeps): IhttpPort & { readonly stop: () => void } {
  let renew: (() => void) | null = null;
  const advertise = async (digest: string): Promise<PortAnswer<null>> => sent(await d.advertise(digest, BigInt(d.nowMs() + ADVERTISE_TTL_MS)));
  return {
    IhttpServe: async ({ routes }): Promise<PortAnswer<null>> => {
      const digest: string = await routesDigest(routes, d.sha256Hex);
      renew?.();
      const first: PortAnswer<null> = await advertise(digest);
      // A renewal that fails is retried at the next tick; the app learns of trouble from its callers.
      if ('ok' in first) renew = d.every(ADVERTISE_EVERY_MS, (): void => { void advertise(digest); });
      return first;
    },
    IhttpCall: async ({ to, frame }): Promise<PortAnswer<null>> => sent(await d.send(addressFor(to), wire(frame))),
    respond: async (peer: Caller, frame: IhttpFrame): Promise<PortAnswer<null>> =>
      sent(await d.send({ User: { app_id: peer.app_id, username: peer.username } }, wire(frame))),
    onFrame: (listener: (inbound: InboundIhttpFrame) => void): (() => void) => d.pushes((payload: unknown): void => {
      const answer: AppsAnswer = readAppsAnswer(payload);
      if (answer.kind !== 'ihttp-frame' || answer.toInstallId !== d.installId) return;
      const decoded: Decoded = decodeCbor(Uint8Array.from(answer.frame));
      const frame: IhttpFrame | null = decoded.ok ? fromWireFrame(decoded.value) : null;
      if (frame === null) return;
      const from: Caller = { username: answer.from.username, cid: answer.from.cid, app_id: answer.from.app_id, install_id: answer.from.install_id, via: 'relay' };
      listener({ from, frame });
    }),
    stop: (): void => {
      renew?.();
      renew = null;
    },
  };
}
