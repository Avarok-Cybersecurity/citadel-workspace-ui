/**
 * A page's zones' apps data over the apps transport: the installs once, each app's listing once,
 * and every request one after another. The protocol has no request id and a refusal answers
 * whichever request is waiting, so two zones' requests in flight together could swap refusals.
 */
import type { AppInstall, AppListing } from 'citadel-workspace-client-ts';
import { getListing, listInstalls, setDisabledForMe, type AppsResult, type AppsTransport } from '@/lib/workspace-service/apps-operations';
import { listedApps, type ListedApp } from '@/lib/citadel-apps/listing-model';
import { readAppsAnswer, type AppsAnswer } from '@/lib/citadel-apps/wire/apps-answer';
import type { ZoneDataPort } from './app-zone-environment';

export function zoneDataFrom(transport: AppsTransport): ZoneDataPort {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next: Promise<T> = queue.then(work, work);
    queue = next;
    return next;
  };
  let installs: Promise<AppsResult<AppInstall[]>> | null = null;
  const listings: Map<string, Promise<AppsResult<ListedApp>>> = new Map();

  const readListing = async (appId: string): Promise<AppsResult<ListedApp>> => {
    const r: AppsResult<AppListing> = await getListing(transport, appId);
    if (!r.ok) return r;
    const [app] = listedApps([r.value]);
    return app === undefined ? { ok: false, refusal: 'Unavailable' } : { ok: true, value: app };
  };

  return {
    installs: (): Promise<AppsResult<AppInstall[]>> => {
      installs ??= serial(() => listInstalls(transport));
      return installs;
    },
    listing: (appId: string): Promise<AppsResult<ListedApp>> => {
      const held: Promise<AppsResult<ListedApp>> | undefined = listings.get(appId);
      if (held !== undefined) return held;
      const asked: Promise<AppsResult<ListedApp>> = serial(() => readListing(appId));
      listings.set(appId, asked);
      return asked;
    },
    setDisabledForMe: (installId: string, disabled: boolean): Promise<AppsResult<boolean>> => serial(() => setDisabledForMe(transport, installId, disabled)),
  };
}

const CHANGES_INSTALLS: ReadonlySet<AppsAnswer['kind']> = new Set(['installed', 'updated', 'consented', 'uninstalled']);

/** Whether an apps answer (`workspace:apps`) changed what is installed, so a page's zones read again. */
export function changesInstalls(answer: unknown): boolean {
  return CHANGES_INSTALLS.has(readAppsAnswer(answer).kind);
}
