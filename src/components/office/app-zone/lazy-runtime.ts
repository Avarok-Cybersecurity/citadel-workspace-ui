/**
 * The runtime a page's zones mount through: the real sandbox host (citadel-apps/runtime/
 * page-runtime.ts), loaded the first time a zone has an app to run and never before, so a page
 * without one, and the landing page, carry none of it. A zone closed while the host loads
 * mounts nothing.
 */
import type { CloseReason } from '@/lib/citadel-apps/sdk/generated/CloseReason';
import type { AppZoneHandle, AppZoneMount, AppZoneRuntime } from './app-zone-environment';

type Loader = () => Promise<AppZoneRuntime>;

export function lazyRuntime(load: Loader): AppZoneRuntime {
  let loading: Promise<AppZoneRuntime> | null = null;
  return {
    mount: (host: HTMLElement, zone: AppZoneMount): AppZoneHandle => {
      let mounted: AppZoneHandle | null = null;
      let live: boolean = true;
      loading ??= load();
      loading.then((runtime: AppZoneRuntime): void => {
        if (live) mounted = runtime.mount(host, zone);
      }, (error: unknown): void => {
        // A chunk that failed to load is retried by the next zone that mounts.
        loading = null;
        if (live) host.textContent = 'This app could not be loaded. Reload the page to try again.';
        console.error('[apps] the app runtime did not load', error);
      });
      return {
        close: (reason: CloseReason): Promise<void> => {
          live = false;
          return mounted === null ? Promise.resolve() : mounted.close(reason);
        },
      };
    },
  };
}

export const pageZoneRuntime: AppZoneRuntime = lazyRuntime(() => import('@/lib/citadel-apps/runtime/page-runtime').then((m) => m.pageAppZoneRuntime));
