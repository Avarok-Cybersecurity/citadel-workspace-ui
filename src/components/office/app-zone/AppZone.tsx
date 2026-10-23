/**
 * `<AppZone app="com.acme.kanban" zone="board" height={480} />` in a page (registered in
 * mdxComponents.tsx). Its props are the author's and are checked; a zone name already used on the
 * page draws an inline error instead of a second instance. Without a runtime this draws only the
 * placeholder (AppZoneRequired.tsx) and never executes anything; with one (a page passes
 * lazy-runtime.ts), an active install's zone is handed to `runtime.mount` with a host-owned element,
 * and closed with the reason the zone stopped showing it (zone-close-reason.ts).
 */
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { Capability } from 'citadel-workspace-client-ts';
import type { AppLink } from '@/lib/citadel-apps/app-link';
import type { CloseReason } from '@/lib/citadel-apps/sdk/generated/CloseReason';
import { recordDisabledForMe } from '@/lib/citadel-apps/disabled-for-me';
import type { AppsResult } from '@/lib/workspace-service/apps-operations';
import { AppZoneContext, type AppZoneEnvironment, type AppZoneHandle, type AppZoneRuntime } from './app-zone-environment';
import { AppZoneRequired, type PlaceholderView } from './AppZoneRequired';
import { closeReasonFor, type RunningZone } from './zone-close-reason';
import { readZoneProps, zoneView, type ZoneFacts, type ZoneProps, type ZoneView } from './zone-state';
import { useZoneFacts } from './use-zone-facts';

interface AppZoneMdxProps {
  app?: unknown;
  zone?: unknown;
  height?: unknown;
  min?: unknown;
}

function ZoneError({ message }: { message: string }): JSX.Element {
  return <p role="alert" className="not-prose my-4 rounded-md border border-destructive/40 p-[12px] text-sm text-destructive-emphasis" data-testid="app-zone-error">{message}</p>;
}

interface RuntimeHostProps {
  runtime: AppZoneRuntime;
  view: Extract<ZoneView, { kind: 'ready' }>;
  /** Why the app that ran `running` closes: read from what the zone shows next (zone-close-reason.ts). */
  reasonFor: (running: RunningZone) => CloseReason;
  props: ZoneProps;
  env: AppZoneEnvironment;
  me: string;
}

function RuntimeHost({ runtime, view, reasonFor, props, env, me }: RuntimeHostProps): JSX.Element {
  const host: React.RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const toolbar: React.RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  // An instance holds the answers it started with, so a change of them starts it again. The key
  // carries the change (the array is new each render); the ref, set in the layout phase, carries
  // this commit's set into the passive effect below.
  const allowedKey: string = view.allowed.join(' ');
  const allowed: React.MutableRefObject<readonly Capability[]> = useRef<readonly Capability[]>(view.allowed);
  useLayoutEffect(() => {
    allowed.current = view.allowed;
  });
  useEffect(() => {
    if (host.current === null || toolbar.current === null) return undefined;
    const running: RunningZone = { install: view.install, allowed: allowed.current };
    const zone: AppZoneHandle = runtime.mount({ canvas: host.current, toolbar: toolbar.current }, { install: running.install, manifest: view.app.manifest, zoneId: props.zone, nodeId: env.nodeId, me, height: props.height });
    // A passive cleanup: it runs after the commit's layout effects, so the reason is this commit's.
    // close() never rejects (zone-runtime.ts reports a failure on a live page).
    return (): void => { void zone.close(reasonFor(running)); };
  }, [runtime, view.install, allowedKey, view.app.manifest, reasonFor, props.zone, props.height, env.nodeId, me]);
  return (
    <div className="not-prose my-4 w-full">
      <div ref={toolbar} data-testid="app-zone-toolbar-slot" />
      <div ref={host} data-testid="app-zone-host" className="w-full" style={{ height: `${props.height}px` }} />
    </div>
  );
}

function PlacedZone({ props, env }: { props: ZoneProps; env: AppZoneEnvironment }): JSX.Element {
  const facts: ZoneFacts = useZoneFacts(env, props.app);
  const view: ZoneView = zoneView(props, facts);
  // The view this commit shows, recorded in the layout phase: before any passive cleanup of the commit.
  const next: React.MutableRefObject<ZoneView> = useRef<ZoneView>(view);
  useLayoutEffect(() => {
    next.current = view;
  });
  const reasonFor: (running: RunningZone) => CloseReason = useCallback((running: RunningZone): CloseReason => closeReasonFor(running, next.current), []);
  // `ready` is only decided once `me` is known (zone-state.ts).
  if (view.kind === 'ready' && env.runtime !== null && env.me !== null) return <RuntimeHost runtime={env.runtime} view={view} reasonFor={reasonFor} props={props} env={env} me={env.me} />;
  const shown: PlaceholderView = view.kind === 'ready' ? { kind: 'ready-unmounted', name: view.app.manifest.name } : view;
  const link: AppLink = { appId: props.app, nodeId: env.nodeId, version: null, server: null };
  const enable = async (): Promise<void> => {
    if (view.kind !== 'disabled') return;
    const r: AppsResult<boolean> = await env.data.setDisabledForMe(view.install.id, false);
    if (r.ok) recordDisabledForMe(view.install.id, r.value);
  };
  return (
    <AppZoneRequired
      appId={props.app}
      floor={props.floor}
      height={props.height}
      view={shown}
      // The listing's icon only when the listing is visible to this person; the generic one otherwise.
      icon={typeof facts.listing === 'object' ? facts.listing.manifest.icon : null}
      onInstall={() => env.openLink(link)}
      onEnable={() => { void enable(); }}
      onCopyLink={() => env.copyText(env.linkUrl(link))}
      onOpenApps={() => env.openLink(link)}
    />
  );
}

export function AppZone({ app, zone, height, min }: AppZoneMdxProps): JSX.Element {
  const env: AppZoneEnvironment | null = useContext(AppZoneContext);
  const token: string = useId();
  const props: ZoneProps | string = readZoneProps(app, zone, height, min);
  const name: string | null = typeof props === 'string' ? null : props.zone;
  const claimed: boolean = env !== null && name !== null && env.claim(name, token);
  useEffect(() => {
    if (env === null || name === null) return undefined;
    // Held again after a remount; a name another zone holds is not ours to release.
    if (!env.claim(name, token)) return undefined;
    return (): void => env.release(name, token);
  }, [env, name, token]);

  if (typeof props === 'string') return <ZoneError message={`This app zone cannot be shown: ${props}.`} />;
  if (env === null) return <ZoneError message="This app zone can only be shown on a workspace page." />;
  if (!claimed) return <ZoneError message={`This page already has a zone called “${props.zone}”; each zone needs its own name.`} />;
  return <PlacedZone props={props} env={env} />;
}
