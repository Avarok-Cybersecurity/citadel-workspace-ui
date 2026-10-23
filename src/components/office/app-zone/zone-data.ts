/**
 * A page's zones' apps data over the apps transport: the installs once, each app's listing once.
 * The transport is serial (serialAppsTransport), so two zones' requests never swap answers.
 */
import type { AppInstall, AppListing } from 'citadel-workspace-client-ts';
import { getListing, listInstalls, setDisabledForMe, type AppsResult, type AppsTransport, type InstallsView } from '@/lib/workspace-service/apps-operations';
import { adoptDisabledForMe } from '@/lib/citadel-apps/disabled-for-me';
import { adoptPeerForMe } from '@/lib/citadel-apps/peer-for-me';
import { listedApps, type ListedApp } from '@/lib/citadel-apps/listing-model';
import { readAppsAnswer, type AppsAnswer } from '@/lib/citadel-apps/wire/apps-answer';
import type { ZoneDataPort } from './app-zone-environment';

export function zoneDataFrom(transport: AppsTransport): ZoneDataPort {
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
      installs ??= listInstalls(transport).then((r: AppsResult<InstallsView>): AppsResult<AppInstall[]> => {
        if (!r.ok) return r;
        adoptDisabledForMe(r.value.disabledForMe);
        adoptPeerForMe(r.value.peerForMe);
        return { ok: true, value: r.value.installs };
      });
      return installs;
    },
    listing: (appId: string): Promise<AppsResult<ListedApp>> => {
      const held: Promise<AppsResult<ListedApp>> | undefined = listings.get(appId);
      if (held !== undefined) return held;
      const asked: Promise<AppsResult<ListedApp>> = readListing(appId);
      listings.set(appId, asked);
      return asked;
    },
    setDisabledForMe: (installId: string, disabled: boolean): Promise<AppsResult<boolean>> => setDisabledForMe(transport, installId, disabled),
  };
}

const CHANGES_INSTALLS: ReadonlySet<AppsAnswer['kind']> = new Set(['installed', 'updated', 'consented', 'uninstalled']);

/** Whether an apps answer (`workspace:apps`) changed what is installed, so a page's zones read again. */
export function changesInstalls(answer: unknown): boolean {
  return CHANGES_INSTALLS.has(readAppsAnswer(answer).kind);
}
