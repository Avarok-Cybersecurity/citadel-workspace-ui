/**
 * The app-zone runtime (design 2.3): for a zone whose install is active and covers this person,
 * fetch and verify the release, start the instance in its own worker with the ports bound to its
 * install, hand it the canvas, forward input, and stop everything when the zone goes. Every
 * dependency is passed in (SBIO); app-zone-runtime-page.ts composes the page's.
 */
import type { AppZoneMount, AppZoneRuntime } from '@/components/office/app-zone/app-zone-environment';
import type { AppsTransport } from '@/lib/workspace-service/apps-operations';
import type { DispatchClock } from '../host/dispatch';
import { launchAppInstance, type AppInstance, type InstanceState, type Launch } from '../host/instance';
import type { InstanceSlots } from '../host/instance-slots';
import type { HostPolicy } from '../host/limits';
import type { HostChannel } from '../host/worker-protocol';
import type { ArtifactVerifierPort } from '../host/verify-artifact';
import { hostPortsFor, type BoundPorts, type PortWorld } from './host-ports';
import { loadRelease, type LoadedRelease } from './release-loader';
import { stoppedCopy, failureCopy } from './zone-copy';
import { scopeKeyOf, zoneContext } from './zone-context';
import { zoneInput, type FrameLoop, type ZoneInput } from './zone-input';
import { zoneSurface, type ZoneSurface } from './zone-surface';

export interface ZoneRuntimeDeps {
  readonly transport: AppsTransport;
  readonly verifier: ArtifactVerifierPort;
  readonly policy: HostPolicy;
  readonly slots: InstanceSlots;
  readonly clock: DispatchClock;
  readonly spawn: () => HostChannel;
  readonly frames: FrameLoop;
  /** The canvas's bitmap for the worker (`transferControlToOffscreen` on a page). */
  readonly offscreen: (canvas: HTMLCanvasElement) => OffscreenCanvas;
  /** The world the ports are bound in, read once per mount (the session may change between). */
  readonly portWorld: () => Promise<Omit<PortWorld, 'policy'>>;
  readonly pageUrl: () => string;
  readonly locale: () => string;
  readonly dpr: () => number;
  readonly theme: () => Readonly<Record<string, string>>;
}

export function createAppZoneRuntime(deps: ZoneRuntimeDeps): AppZoneRuntime {
  return {
    mount: (host: HTMLElement, zone: AppZoneMount): (() => void) => {
      const name: string = zone.manifest.name;
      const dpr: number = deps.dpr();
      const width: number = Math.max(1, Math.round(host.getBoundingClientRect().width));
      const surface: ZoneSurface = zoneSurface(host, name, { width, height: zone.height, dpr });
      const input: ZoneInput = zoneInput(deps.frames);
      let live: boolean = true;
      let instance: AppInstance | null = null;
      let bound: BoundPorts | null = null;
      let detach: (() => void) | null = null;

      const start = async (): Promise<void> => {
        const loaded: LoadedRelease = await loadRelease(deps.transport, zone.install, deps.verifier, deps.policy);
        if (!live) return;
        if (!loaded.ok) {
          surface.show({ kind: 'stopped', why: failureCopy(name, loaded.failure) });
          return;
        }
        const world: PortWorld = { ...(await deps.portWorld()), policy: deps.policy };
        const scopeKey: string = await scopeKeyOf(zone.install.scope, world.sha256Hex);
        if (!live) return;
        bound = hostPortsFor(zone.install, scopeKey, input.port, world);
        const launch: Launch = launchAppInstance({
          appId: zone.install.app_id, module: loaded.module, granted: new Set(zone.install.granted), memory: loaded.memory,
          context: zoneContext({ install: zone.install, zoneId: zone.zoneId, nodeId: zone.nodeId, actingUsername: zone.me, width, height: zone.height, dpr, locale: deps.locale(), theme: deps.theme() }),
          pageUrl: deps.pageUrl(), policy: deps.policy, ports: bound.ports, clock: deps.clock, slots: deps.slots, spawn: deps.spawn,
        });
        if (!launch.ok) {
          surface.show({ kind: 'stopped', why: `This page is already running as many apps as it can, so ${name} was not started.` });
          return;
        }
        const running: AppInstance = launch.instance;
        instance = running;
        running.attachCanvas(deps.offscreen(surface.canvas), dpr);
        running.onState((state: InstanceState): void => {
          if (state === 'running') {
            surface.show({ kind: 'running' });
            detach = input.attach(surface.canvas, (e) => running.postEvent(e), (dt: number) => running.frame(dt));
            return;
          }
          detach?.();
          detach = null;
          const why: string | null = stoppedCopy(name, state);
          if (why !== null) surface.show({ kind: 'stopped', why });
        });
      };
      start().catch((error: unknown): void => {
        if (live) surface.show({ kind: 'stopped', why: `${name} could not be started.` });
        console.error('[apps] starting an app zone failed', error);
      });

      return (): void => {
        live = false;
        detach?.();
        instance?.terminate();
        bound?.stop();
        surface.dispose();
      };
    },
  };
}
