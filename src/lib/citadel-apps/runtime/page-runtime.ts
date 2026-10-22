/**
 * The page's app-zone runtime: createAppZoneRuntime with this tab's real dependencies. Loaded
 * lazily, with the first zone that has an app to run (app-zone/lazy-runtime.ts), so the sandbox
 * host and its worker never reach the landing page or a page without an app.
 *
 * Unwired, stated rather than defaulted: the ML-DSA-65 check (verifier.ts, so every load is
 * refused as unchecked until the wasm client exports it), and theme tokens beyond the few below.
 */
import { eventEmitter } from '@/lib/event-emitter';
import { websocketService } from '@/lib/websocket-service';
import { agentCapabilities, type AgentCapabilities } from '@/lib/agent-conversations/capabilities';
import { getCurrentCid } from '@/lib/p2p/current-cid';
import { sessionAppsTransport } from '../apps-api';
import { InstanceSlots } from '../host/instance-slots';
import { STANDARD_HOST_POLICY, validateHostPolicy, type HostPolicy } from '../host/limits';
import type { DispatchClock } from '../host/dispatch';
import type { LogPort } from '../host/ports';
import { spawnAppWorker } from '../host/spawn-app-worker';
import type { ArtifactVerifierPort } from '../host/verify-artifact';
import type { AppZoneRuntime } from '@/components/office/app-zone/app-zone-environment';
import type { AgentLink } from './agent-link';
import type { PortWorld } from './host-ports';
import { noAppSignatureCheck, pageArtifactVerifier } from './verifier';
import { animationFrames } from './zone-input';
import { createAppZoneRuntime } from './zone-runtime';

const policy: HostPolicy = validateHostPolicy(STANDARD_HOST_POLICY);
const verifier: ArtifactVerifierPort = pageArtifactVerifier(crypto.subtle, noAppSignatureCheck);

const clock: DispatchClock = {
  now: (): number => performance.now(),
  after: (ms: number, fire: () => void): (() => void) => {
    const id: ReturnType<typeof setTimeout> = setTimeout(fire, ms);
    return (): void => clearTimeout(id);
  },
};

const agent: AgentLink = {
  send: (request: Record<string, unknown>): Promise<void> => websocketService.sendMessage(request),
  listen: (handler: (message: unknown) => void): (() => void) => eventEmitter.on('websocket-message', handler),
  newRequestId: (): string => crypto.randomUUID(),
};

const log: LogPort = {
  LogWrite: ({ level, message }) => {
    console.info(`[app ${level}] ${message}`);
    return { ok: null };
  },
};

/** The session the agent ports act for: only when the agent says it serves apps and someone is signed in. */
async function agentSession(): Promise<{ readonly cid: bigint } | null> {
  const caps: AgentCapabilities | null = await agentCapabilities().catch((): null => null);
  if (caps === null || !caps.servesApps) return null;
  const cid: bigint | null = await getCurrentCid();
  return cid === null ? null : { cid };
}

const THEME_TOKENS: readonly string[] = ['background', 'foreground', 'primary', 'primary-foreground', 'muted', 'muted-foreground', 'border', 'destructive'];

function theme(): Readonly<Record<string, string>> {
  const style: CSSStyleDeclaration = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    const value: string = style.getPropertyValue(`--${token}`).trim();
    if (value !== '') out[token] = `hsl(${value})`;
  }
  return out;
}

export const pageAppZoneRuntime: AppZoneRuntime = createAppZoneRuntime({
  transport: sessionAppsTransport, verifier, policy, clock,
  slots: new InstanceSlots(policy.maxLiveInstancesPerPage),
  spawn: spawnAppWorker,
  frames: animationFrames,
  offscreen: (canvas: HTMLCanvasElement): OffscreenCanvas => canvas.transferControlToOffscreen(),
  portWorld: async (): Promise<Omit<PortWorld, 'policy'>> => ({
    transport: sessionAppsTransport, agent, agentSession: await agentSession(), log,
    pushes: (listener: (answer: unknown) => void): (() => void) => eventEmitter.on('workspace:apps', (event: { answer: unknown } | undefined): void => {
      if (event !== undefined) listener(event.answer);
    }),
    sha256Hex: verifier.sha256Hex,
    nowMs: (): number => Date.now(),
    every: (ms: number, fire: () => void): (() => void) => {
      const id: ReturnType<typeof setInterval> = setInterval(fire, ms);
      return (): void => clearInterval(id);
    },
  }),
  pageUrl: (): string => window.location.href,
  locale: (): string => navigator.language,
  dpr: (): number => window.devicePixelRatio,
  theme,
});
