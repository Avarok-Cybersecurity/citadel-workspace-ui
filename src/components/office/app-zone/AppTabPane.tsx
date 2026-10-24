/**
 * An app tab's panel: the tab analogue of a placed zone. It reads the same facts a zone does
 * (the app's listing and the installs that cover this person on this node) through the page's
 * zone environment, and draws the same placeholder, worded for a tab, until the app can run.
 * Removing a tab never uninstalls anything; a tab whose app is not installed here says so and
 * offers what this person can do about it.
 */
import { useContext } from 'react';
import type { AppLink } from '@/lib/citadel-apps/app-link';
import { recordDisabledForMe } from '@/lib/citadel-apps/disabled-for-me';
import type { AppsResult } from '@/lib/workspace-service/apps-operations';
import { AppZoneContext, type AppZoneEnvironment } from './app-zone-environment';
import { AppZoneRequired, type PlaceholderView } from './AppZoneRequired';
import { zoneView, type ZoneFacts, type ZoneProps, type ZoneView } from './zone-state';
import { useZoneFacts } from './use-zone-facts';

/** The placeholder's height in a tab: the panel fills the pane, the placeholder sits at its top. */
const PLACEHOLDER_HEIGHT: number = 240;

interface AppTabPaneProps {
  appId: string;
  /** The tab's name among the node's tabs (`Surface::NodeTab.tab_id`). */
  tabId: string;
}

function PlacedTab({ appId, tabId, env }: AppTabPaneProps & { env: AppZoneEnvironment }): JSX.Element {
  const facts: ZoneFacts = useZoneFacts(env, appId);
  const props: ZoneProps = { app: appId, zone: tabId, height: PLACEHOLDER_HEIGHT, floor: null };
  const view: ZoneView = zoneView(props, facts);
  const shown: PlaceholderView = view.kind !== 'ready' ? view : { kind: 'ready-unmounted', name: view.app.manifest.name };
  const link: AppLink = { appId, nodeId: env.nodeId, version: null, server: null };
  const enable = async (): Promise<void> => {
    if (view.kind !== 'disabled') return;
    const r: AppsResult<boolean> = await env.data.setDisabledForMe(view.install.id, false);
    if (r.ok) recordDisabledForMe(view.install.id, r.value);
  };
  return (
    <div className="mx-auto w-full max-w-3xl px-[16px] py-[8px]" data-testid="app-tab-pane" data-app-id={appId}>
      <AppZoneRequired
        placement="tab"
        appId={appId}
        floor={null}
        height={PLACEHOLDER_HEIGHT}
        view={shown}
        icon={typeof facts.listing === 'object' ? facts.listing.manifest.icon : null}
        onInstall={() => env.openLink(link)}
        onEnable={() => { void enable(); }}
        onCopyLink={() => env.copyText(env.linkUrl(link))}
        onOpenApps={() => env.openLink(link)}
      />
    </div>
  );
}

export function AppTabPane({ appId, tabId }: AppTabPaneProps): JSX.Element {
  const env: AppZoneEnvironment | null = useContext(AppZoneContext);
  if (env === null) {
    return <p role="alert" className="m-[16px] text-sm text-destructive-emphasis">This tab can only be shown on a workspace page.</p>;
  }
  return <PlacedTab appId={appId} tabId={tabId} env={env} />;
}
