/**
 * What an app zone on a page is given: the page and the person, the apps data it reads, and the
 * seam the runtime stream mounts its canvas through. One per rendered page (AppZonePage.tsx), so
 * the page's zones share their requests and the page can refuse a zone name used twice.
 */
import { createContext } from 'react';
import type { AppInstall, AppManifest } from 'citadel-workspace-client-ts';
import type { AppLink } from '@/lib/citadel-apps/app-link';
import type { ListedApp } from '@/lib/citadel-apps/listing-model';
import type { Tri } from '@/lib/citadel-apps/scope-options';
import type { AppsResult } from '@/lib/workspace-service/apps-operations';

/** One zone the runtime is asked to run. */
export interface AppZoneMount {
  install: AppInstall;
  manifest: AppManifest;
  zoneId: string;
  nodeId: string;
  /** Who the app acts for on this page (`acting_username`). */
  me: string;
  /** The author's height in px, at most 2000; the app may ask to change it (`ui.request_height`). */
  height: number;
}

/**
 * The runtime's seam (design 2.3): mount the app for `zone` into `host`, a host-owned element of
 * the zone's height, and return how to stop it. The app paints only its own canvas inside it:
 * never page DOM, never HTML from the app. A page passes lazy-runtime.ts; null (tests) shows
 * the placeholder and executes nothing.
 */
export interface AppZoneRuntime {
  mount: (host: HTMLElement, zone: AppZoneMount) => () => void;
}

/** The apps data a page's zones read, each request made once per page. */
export interface ZoneDataPort {
  listing: (appId: string) => Promise<AppsResult<ListedApp>>;
  installs: () => Promise<AppsResult<AppInstall[]>>;
  setDisabledForMe: (installId: string, disabled: boolean) => Promise<AppsResult<boolean>>;
}

export interface AppZoneEnvironment {
  nodeId: string;
  /** Null until this tab knows who is signed in; the zone waits for it. */
  me: string | null;
  ancestors: readonly string[];
  /** Whether this person may install apps for themselves (`AppInstall`). */
  mayInstall: Tri;
  data: ZoneDataPort;
  runtime: AppZoneRuntime | null;
  /** Open the marketplace on an app, as its link would. */
  openLink: (link: AppLink) => void;
  /** The shareable link for an app, to copy for an admin. */
  linkUrl: (link: AppLink) => string;
  copyText: (text: string) => Promise<void>;
  /** Claim a zone name on this page for one zone; false when another zone holds it. */
  claim: (zoneName: string, token: string) => boolean;
  release: (zoneName: string, token: string) => void;
}

export const AppZoneContext: React.Context<AppZoneEnvironment | null> = createContext<AppZoneEnvironment | null>(null);

/** One page's zone names: a name is held by the first zone to claim it until that zone lets go. */
export function zoneClaims(): Pick<AppZoneEnvironment, 'claim' | 'release'> {
  const holders: Map<string, string> = new Map();
  return {
    claim: (name: string, token: string): boolean => {
      const holder: string | undefined = holders.get(name);
      if (holder !== undefined && holder !== token) return false;
      holders.set(name, token);
      return true;
    },
    release: (name: string, token: string): void => { if (holders.get(name) === token) holders.delete(name); },
  };
}
