/**
 * Waiting for a permissions load to land, without leaking a listener.
 *
 * `off('user:permissions:loaded', handler)` was called only on the success
 * path. A fetch that timed out therefore left its listener on the global
 * emitter for the life of the tab — one per timed-out fetch, each holding its
 * closure and its `reject` alive, and each still running on every subsequent
 * permissions load for as long as the tab was open.
 *
 * Extracted because the lifetime is the whole substance: the handler has to be
 * declared before the timeout so the timeout can remove it, which reads as a
 * mistake inline and is the point here.
 */

import { eventEmitter } from '@/lib/event-emitter';
import { TIMEOUT } from '@/lib/timeout-constants';
import type { DomainPermissions } from './types';

export function awaitPermissionsLoaded(
  domainId: string,
  readCache: () => DomainPermissions | undefined,
): Promise<DomainPermissions> {
  return new Promise<DomainPermissions>((resolve, reject) => {
    // The timeout closes over `handler`, which is declared below it. That is
    // safe and not a hoisting trick: the callback body does not evaluate the
    // binding until the timer fires, and by then the const is initialised. The
    // order matters the other way round -- the timeout must be able to remove
    // the handler, which is the whole fix.
    const timeout = setTimeout(() => {
      eventEmitter.off('user:permissions:loaded', handler);
      reject(new Error('Permission fetch timeout'));
    }, TIMEOUT.PERMISSION_FETCH_MS);

    const handler = (payload: { domainId: string }) => {
      if (payload.domainId !== domainId) return;

      clearTimeout(timeout);
      eventEmitter.off('user:permissions:loaded', handler);

      const cached = readCache();
      if (cached) {
        resolve(cached);
      } else {
        // The event fired for this domain and the cache is still empty, which
        // means the handler that fills it did not. Rejecting says so; resolving
        // with an empty set would hand the caller "no permissions" as a fact.
        reject(new Error('Permissions not found in cache after load'));
      }
    };

    eventEmitter.on('user:permissions:loaded', handler);
  });
}
