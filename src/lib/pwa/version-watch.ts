import { isNewDeploy, readDeployedEntry, VERSION_MANIFEST_PATH } from './deployed-version';
import { offerDeployNotice } from './deploy-notice';
import { INTERVAL } from '@/lib/timeout-constants';
import { debugLog } from '@/lib/debug-config';

/** Everything the watch touches outside itself, so it runs under a test without a browser. */
export interface VersionWatchIO {
  readonly runningEntry: string;
  readonly origin: string;
  readonly intervalMs: number;
  /** The parsed manifest, or null when there is none to read. */
  fetchManifest: () => Promise<unknown>;
  isOnline: () => boolean;
  /** Calls back when the page is worth re-checking now: tab shown, back online. */
  onWake: (check: () => void) => () => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  onNewDeploy: () => void;
}

/** Start checking; returns the stop function. Reports a deploy once. */
export function startVersionWatch(io: VersionWatchIO): () => void {
  let reported: boolean = false;
  let inFlight: boolean = false;

  const check = (): void => {
    if (reported || inFlight || !io.isOnline()) return;
    inFlight = true;
    void io.fetchManifest()
      .then((body: unknown): void => {
        if (reported || !isNewDeploy(io.runningEntry, readDeployedEntry(body), io.origin)) return;
        reported = true;
        io.onNewDeploy();
      })
      .catch((error: unknown): void => { debugLog('PWA', 'Version check failed', error); })
      .finally((): void => { inFlight = false; });
  };

  const timer: unknown = io.setInterval(check, io.intervalMs);
  const stopWake: () => void = io.onWake(check);
  check();
  return (): void => {
    io.clearInterval(timer);
    stopWake();
  };
}

/**
 * What a detected deploy should do.
 *
 * With a service worker in control, a plain reload serves the OLD precached
 * build, so offering one would reload into the same page and the banner would
 * come straight back. There the worker is asked to fetch the new build, and its
 * own `waiting` offer raises the banner once that build is installed. Without a
 * worker, the next load comes from the network, so a reload is the whole fix.
 */
export interface DeployResponseIO {
  workerControlsPage: () => boolean;
  checkWorker: () => Promise<void>;
  reload: () => void;
}

export function respondToDeploy(io: DeployResponseIO): void {
  if (io.workerControlsPage()) {
    io.checkWorker().catch((error: unknown): void => { debugLog('PWA', 'Worker update check failed', error); });
    return;
  }
  offerDeployNotice({ reason: 'deployed', accept: io.reload });
}

/** The browser's side of both, used once from main.tsx. */
export function watchDeployedVersion(runningEntry: string): () => void {
  const container: ServiceWorkerContainer | undefined = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  return startVersionWatch({
    runningEntry,
    origin: window.location.origin,
    intervalMs: INTERVAL.DEPLOYED_VERSION_MS,
    fetchManifest: async (): Promise<unknown> => {
      const response: Response = await fetch(VERSION_MANIFEST_PATH, { cache: 'no-store' });
      if (!response.ok) return null;
      return response.json().catch((): null => null);
    },
    isOnline: (): boolean => navigator.onLine,
    onWake: (check: () => void): (() => void) => {
      const onVisible = (): void => { if (document.visibilityState === 'visible') check(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', check);
      return (): void => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', check);
      };
    },
    setInterval: (fn: () => void, ms: number): unknown => window.setInterval(fn, ms),
    clearInterval: (handle: unknown): void => window.clearInterval(handle as number),
    onNewDeploy: (): void => respondToDeploy({
      workerControlsPage: (): boolean => Boolean(container?.controller),
      checkWorker: async (): Promise<void> => { await (await container?.getRegistration())?.update(); },
      reload: (): void => window.location.reload(),
    }),
  });
}
