/**
 * The app-zone runtime (design 2.3): for a zone whose install is active and covers this person,
 * fetch and verify the release, start the instance in its own worker with the ports bound to its
 * install, hand it the canvas, forward input while it runs, suspend it while the zone or the page
 * is out of sight (zone-presence.ts), tell it the zone's new size, and close it gracefully when
 * the zone goes or the page does (zone-close.ts). The app's toolbar is host buttons above the
 * canvas (ui-port.ts); a press reaches the app as `ui_action` only while it runs. Every dependency is passed in (SBIO);
 * page-runtime.ts composes the page's.
 */
import type { AppZoneHandle, AppZoneMount, AppZoneRuntime, ZoneHost } from '@/components/office/app-zone/app-zone-environment';
import type { AppsTransport } from '@/lib/workspace-service/apps-operations';
import type { DispatchClock } from '../host/dispatch';
import { launchAppInstance, type AppInstance, type InstanceState, type Launch } from '../host/instance';
import type { InstanceSlots } from '../host/instance-slots';
import { instanceLimits, type HostPolicy } from '../host/limits';
import type { TopicArrival } from '../host/ports';
import type { HostChannel } from '../host/worker-protocol';
import type { ArtifactVerifierPort } from '../host/verify-artifact';
import type { CloseReason } from '../sdk/generated/CloseReason';
import type { SuspendReason } from '../sdk/generated/SuspendReason';
import { hostPortsFor, type BoundPorts, type PortWorld } from './host-ports';
import { InstallPlaneRegistry } from './install-plane-registry';
import { loadRelease, type LoadedRelease } from './release-loader';
import { closeZone, type ZoneCloseDeps } from './zone-close';
import { stoppedCopy, failureCopy } from './zone-copy';
import { scopeKeyOf, zoneContext } from './zone-context';
import { zoneInput, type FrameLoop, type ZoneInput } from './zone-input';
import { ZonePresence } from './zone-presence';
import { zoneSurface, type ZoneSurface } from './zone-surface';
import { zoneToolbar, type ZoneToolbar } from './zone-toolbar';
import { zoneUiPort } from './ui-port';
import type { PageLife, ZoneWatchers } from './zone-watchers';

export interface ZoneRuntimeDeps extends ZoneCloseDeps {
  readonly transport: AppsTransport;
  readonly verifier: ArtifactVerifierPort;
  readonly policy: HostPolicy;
  readonly slots: InstanceSlots;
  readonly clock: DispatchClock;
  readonly spawn: () => HostChannel;
  readonly frames: FrameLoop;
  readonly watch: ZoneWatchers;
  /** A fresh name for one running instance: 1 to 64 of `[A-Za-z0-9_-]` (its advertisement's key). */
  readonly newInstanceId: () => string;
  /** The canvas's bitmap for the worker (`transferControlToOffscreen` on a page). */
  readonly offscreen: (canvas: HTMLCanvasElement) => OffscreenCanvas;
  /** The world the ports are bound in, read once per mount (the session may change between). */
  readonly portWorld: () => Promise<Omit<PortWorld, 'policy'>>;
  readonly pageUrl: () => string;
  readonly locale: () => string;
  readonly dpr: () => number;
  readonly theme: () => Readonly<Record<string, string>>;
}

function mountZone(slots: ZoneHost, zone: AppZoneMount, deps: ZoneRuntimeDeps, planes: InstallPlaneRegistry): AppZoneHandle {
  const host: HTMLElement = slots.canvas;
  const name: string = zone.manifest.name;
  const dpr: number = deps.dpr();
  let width: number = Math.max(1, Math.round(host.getBoundingClientRect().width));
  const surface: ZoneSurface = zoneSurface(host, name, { width, height: zone.height, dpr });
  const input: ZoneInput = zoneInput(deps.frames);
  const presence: ZonePresence = new ZonePresence();
  let closing: Promise<void> | null = null;
  let leaving: boolean = false;
  let instance: AppInstance | null = null;
  let bound: BoundPorts | null = null;
  let detach: (() => void) | null = null;
  const toolbar: ZoneToolbar = zoneToolbar(host.ownerDocument, name, (id: string): void => {
    if (closing === null && instance?.state === 'running') instance.postEvent({ ui_action: { id } });
  });
  slots.toolbar.append(toolbar.element);

  const stopInput = (): void => {
    detach?.();
    detach = null;
  };
  /** Runs or suspends the started instance as the zone's presence says; input flows only while it runs. */
  const sync = (): void => {
    const running: AppInstance | null = instance;
    if (closing !== null || running === null || running.state !== 'running') return;
    const want: SuspendReason | null = presence.reason;
    if (want !== null) {
      stopInput();
      if (running.lifecycle === 'running' && !running.suspend(want)) deps.report(`[apps] ${name} could not be suspended`, running.lifecycle);
      return;
    }
    if (running.lifecycle === 'suspended' && !running.resume()) deps.report(`[apps] ${name} could not be resumed`, running.lifecycle);
    if (running.lifecycle === 'running' && detach === null) {
      detach = input.attach(surface.canvas, (e) => running.postEvent(e), (dt: number) => running.frame(dt));
    }
  };

  const watching: (() => void)[] = [];
  const close = (reason: CloseReason): Promise<void> => {
    closing ??= closeZone({
      ids: { appId: zone.install.app_id, installId: zone.install.id, zoneId: zone.zoneId },
      instance, bound, disposeSurface: surface.dispose, leaving: (): boolean => leaving,
      quiesce: (): void => {
        for (const stop of watching.splice(0)) stop();
        stopInput();
        toolbar.dispose();
      },
    }, reason, deps).catch((error: unknown): void => {
      if (!leaving) deps.report(`[apps] closing ${name}'s zone failed`, error);
    });
    return closing;
  };

  watching.push(
    deps.watch.inView(host, (inView: boolean): void => { presence.inView = inView; sync(); }),
    deps.watch.pageVisible((visible: boolean): void => { presence.pageVisible = visible; sync(); }),
    deps.watch.width(host, (w: number): void => {
      const next: number = Math.max(1, Math.round(w));
      if (next === width) return;
      width = next;
      instance?.resize(width, zone.height, dpr);
    }),
    deps.watch.pageLife((life: PageLife): void => {
      if (life === 'leaving') {
        leaving = true;
        void close('host_shutdown');
        return;
      }
      presence.kept = life === 'kept';
      sync();
    }),
  );

  const start = async (): Promise<void> => {
    const loaded: LoadedRelease = await loadRelease(deps.transport, zone.install, deps.verifier, deps.policy);
    if (closing !== null) return;
    if (!loaded.ok) {
      surface.show({ kind: 'stopped', why: failureCopy(name, loaded.failure) });
      return;
    }
    const world: PortWorld = { ...(await deps.portWorld()), policy: deps.policy };
    const scopeKey: string = await scopeKeyOf(zone.install.scope, world.sha256Hex);
    if (closing !== null) return;
    bound = hostPortsFor(zone.install, loaded.manifest.limits, deps.newInstanceId(), scopeKey, { events: input.port, ui: zoneUiPort(toolbar) }, planes.attach(zone.install.id, zone.install.app_id), world);
    const closeGraceMs: number = loaded.manifest.limits.close_grace_ms;
    const launch: Launch = launchAppInstance({
      appId: zone.install.app_id, module: loaded.module, granted: bound.held, memory: loaded.memory, closeGraceMs,
      context: zoneContext({ install: zone.install, zoneId: zone.zoneId, nodeId: zone.nodeId, actingUsername: zone.me, width, height: zone.height, dpr, closeGraceMs, locale: deps.locale(), theme: deps.theme() }),
      pageUrl: deps.pageUrl(), policy: deps.policy, limits: instanceLimits(loaded.manifest.limits), ports: bound.ports, clock: deps.clock, slots: deps.slots, spawn: deps.spawn,
    });
    if (!launch.ok) {
      surface.show({ kind: 'stopped', why: `This page is already running as many apps as it can, so ${name} was not started.` });
      return;
    }
    const running: AppInstance = launch.instance;
    instance = running;
    // A topic's arrivals reach the app as AppEvent `topic` while it runs; the watch ends with the zone.
    const offTopic: (() => void) | undefined = bound.ports.topic?.onEvent((a: TopicArrival): void => {
      if (closing === null && running.state === 'running') running.postEvent({ topic: { name: a.name, event: a.event } });
    });
    if (offTopic !== undefined) watching.push(offTopic);
    running.attachCanvas(deps.offscreen(surface.canvas), dpr);
    running.onState((state: InstanceState): void => {
      if (state === 'running') {
        surface.show({ kind: 'running' });
        if (running.start()) sync();
        else deps.report(`[apps] ${name} could not be started`, running.lifecycle);
        return;
      }
      stopInput();
      toolbar.dispose();
      const why: string | null = stoppedCopy(name, state);
      if (why !== null) surface.show({ kind: 'stopped', why });
    });
  };
  start().catch((error: unknown): void => {
    if (closing === null) surface.show({ kind: 'stopped', why: `${name} could not be started.` });
    if (!leaving) deps.report('[apps] starting an app zone failed', error);
  });

  return { close };
}

/** One runtime per page, so one plane registry: every instance of an install here shares it. */
export function createAppZoneRuntime(deps: ZoneRuntimeDeps): AppZoneRuntime {
  const planes: InstallPlaneRegistry = new InstallPlaneRegistry();
  return { mount: (host: ZoneHost, zone: AppZoneMount): AppZoneHandle => mountZone(host, zone, deps, planes) };
}
