/**
 * The pane's side of booking (design §3.6.1): this instance answers bookings for its member
 * (booking-host.ts) on the planes the install holds, answers the requests left while they were
 * away once it is listening, and gives the booking page a client to claim with. Until the
 * endpoint is up, or when the install may not call (`ihttp.call` for the relay, `ihttp.p2p.call`),
 * the client is null, and a booking is left as a request.
 */
import { useEffect, useMemo, useState } from 'react';
import type { IhttpClient } from '@/lib/citadel-apps/glue-sdk/ihttp-client';
import type { IhttpEndpoint } from '@/lib/citadel-apps/glue-sdk/ihttp-endpoint';
import type { Capability } from '@/lib/citadel-apps/host/capabilities';
import { BookingHost, serveBookings } from '@/lib/calendar/booking-host';
import type { CalendarEngine } from '@/lib/calendar/engine/calendar-engine';
import type { CalendarPorts } from '@/lib/calendar/ports';

export interface Bookings {
  readonly client: IhttpClient | null;
  /** This instance's host side, for the host's own cancellations. */
  readonly host: BookingHost;
}

export function useBookings(ports: CalendarPorts, engine: CalendarEngine, node: string, me: string, held: ReadonlySet<Capability>): Bookings {
  const [client, setClient] = useState<IhttpClient | null>(null);
  const host: BookingHost = useMemo(() => new BookingHost({ ports, engine, node, me, nowMs: (): bigint => BigInt(Date.now()) }), [ports, engine, node, me]);
  const relay: boolean = held.has('ihttp.serve');
  const p2p: boolean = held.has('ihttp.p2p.serve');
  const calls: boolean = held.has('ihttp.call') || held.has('ihttp.p2p.call');
  useEffect(() => {
    let live: boolean = true;
    let endpoint: IhttpEndpoint | null = null;
    serveBookings(ports, host, relay || p2p ? { relay, p2p } : null).then(async (ep: IhttpEndpoint): Promise<void> => {
      if (!live) {
        ep.close();
        return;
      }
      endpoint = ep;
      if (calls) setClient(ep.client);
      await host.answerRequests();
    }).catch((e: unknown): void => { console.error('[calendar] bookings could not be served', e); });
    return (): void => {
      live = false;
      endpoint?.close();
      setClient(null);
    };
  }, [ports, host, relay, p2p, calls]);
  return { client, host };
}
