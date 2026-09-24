import { VERSION_MANIFEST_PATH } from './deployed-version';
import { respondToDeploy, startVersionWatch } from './version-watch';
import { INTERVAL } from '@/lib/timeout-constants';

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
