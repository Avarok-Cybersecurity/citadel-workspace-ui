/**
 * `<AppZone app="com.acme.kanban" zone="board" height={480} />` in a page (registered in
 * mdxComponents.tsx). Its props are the author's and are checked; a zone name already used on the
 * page draws an inline error instead of a second instance. Without a runtime this draws only the
 * placeholder (AppZoneRequired.tsx) and never executes anything; with one (a page passes
 * lazy-runtime.ts), an active install's zone is handed to `runtime.mount` with a host-owned element,
 * and closed with the reason the zone stopped showing it (zone-close-reason.ts).
 */
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { usePeerAnswering } from '@/lib/citadel-apps/peer-answering';
import type { AppInstall } from 'citadel-workspace-client-ts';
import type { AppLink } from '@/lib/citadel-apps/app-link';
import type { CloseReason } from '@/lib/citadel-apps/sdk/generated/CloseReason';
import { recordDisabledForMe } from '@/lib/citadel-apps/disabled-for-me';
import type { AppsResult } from '@/lib/workspace-service/apps-operations';
import { AppZoneContext, type AppZoneEnvironment, type AppZoneHandle, type AppZoneRuntime } from './app-zone-environment';
import { AppZoneRequired, type PlaceholderView } from './AppZoneRequired';
import { closeReasonFor } from './zone-close-reason';
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
  reasonFor: (running: AppInstall) => CloseReason;
  props: ZoneProps;
  env: AppZoneEnvironment;
  me: string;
}

function RuntimeHost({ runtime, view, reasonFor, props, env, me }: RuntimeHostProps): JSX.Element {
  const host: React.RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const toolbar: React.RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  // The previous instance's close, settled once it let go of what it held with the agent
  // (zone-close.ts): the next one (another release) starts only after it, so it never joins a
  // topic the last one is still leaving.
  const closed: React.MutableRefObject<Promise<void>> = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const canvas: HTMLDivElement | null = host.current;
    const bar: HTMLDivElement | null = toolbar.current;
    if (canvas === null || bar === null) return undefined;
    const running: AppInstall = view.install;
    let live: boolean = true;
    let zone: AppZoneHandle | null = null;
    void closed.current.then((): void => {
      if (live) zone = runtime.mount({ canvas, toolbar: bar }, { install: running, manifest: view.app.manifest, zoneId: props.zone, nodeId: env.nodeId, me, height: props.height });
    });
    // A passive cleanup: it runs after the commit's layout effects, so the reason is this commit's.
    // close() never rejects (zone-runtime.ts reports a failure on a live page). One never mounted
    // (still waiting on the last close) has nothing to close, and the last close is still the wait.
    return (): void => {
      live = false;
      if (zone !== null) closed.current = zone.close(reasonFor(running));
    };
  }, [runtime, view.install, view.app.manifest, reasonFor, props.zone, props.height, env.nodeId, me]);
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
  const reasonFor: (running: AppInstall) => CloseReason = useCallback((running: AppInstall): CloseReason => closeReasonFor(running, next.current), []);
  // An app holds the answers it started with (runtime/peer-ports.ts), and each plane is its own
  // write: one started while its member still has the answers open would hold only the first. So
  // it waits for the panel to close -- but only to start: a running app is never stopped for it.
  // Restarting one would leave and rejoin its topics, and the SDK keeps a left group's state, so the
  // rejoin never reopens the channel and every publish after it is refused.
  const answering: ReadonlySet<string> = usePeerAnswering();
  const started: React.MutableRefObject<string | null> = useRef<string | null>(null);
  const waiting: boolean = view.kind === 'ready' && answering.has(view.install.id) && started.current !== view.install.id;
  useLayoutEffect(() => {
    if (view.kind !== 'ready') started.current = null;
    else if (!waiting) started.current = view.install.id;
  });
  // `ready` is only decided once `me` is known (zone-state.ts).
  if (view.kind === 'ready' && !waiting && env.runtime !== null && env.me !== null) return <RuntimeHost runtime={env.runtime} view={view} reasonFor={reasonFor} props={props} env={env} me={env.me} />;
  const shown: PlaceholderView = view.kind !== 'ready' ? view : { kind: waiting ? 'needs-answer' : 'ready-unmounted', name: view.app.manifest.name };
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
