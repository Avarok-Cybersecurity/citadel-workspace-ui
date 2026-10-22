/**
 * The shipped app zone on a bare page: AppZone in the office's prose column, mounted through the
 * real runtime (zone-runtime.ts) with the real app worker, OffscreenCanvas and the SDK's real
 * `hello-canvas` fixture, which subscribes to pointer events, asks for frames and paints a blue
 * card inset 10 CSS px. Not part of the app: serve.mjs builds it on its own.
 *
 * Stood in, because a page has no workspace server here: the server's release and artifact
 * answers (from the fixture's bytes, through the production reader), and the ML-DSA-65 check,
 * which the wasm client does not export yet (a SHA-256 stand-in over the same message fields).
 *
 * - `?mode=ok`: a release that verifies.
 * - `?mode=bad-signature`: the same release under a signature that does not.
 * - `?mode=unchecked`: this build's own verifier (noAppSignatureCheck).
 */
import { createRoot } from 'react-dom/client';
import '@/index.css';
import type { AppInstall, AppListing, AppsRequest } from 'citadel-workspace-client-ts';
import helloCanvasUrl from '../../../../apps/sdk-fixtures/wasm/hello-canvas.wasm?url';
import manifestCases from '../../../../apps/catalogue/fixtures/manifest-cases.json';
import { AppZone } from '@/components/office/app-zone/AppZone';
import { AppZoneContext, zoneClaims, type AppZoneEnvironment } from '@/components/office/app-zone/app-zone-environment';
import { listedApps } from '@/lib/citadel-apps/listing-model';
import { readAppsAnswer, type AppsAnswer } from '@/lib/citadel-apps/wire/apps-answer';
import type { AppsTransport } from '@/lib/workspace-service/apps-operations';
import { InstanceSlots } from '@/lib/citadel-apps/host/instance-slots';
import { STANDARD_HOST_POLICY } from '@/lib/citadel-apps/host/limits';
import { spawnAppWorker } from '@/lib/citadel-apps/host/spawn-app-worker';
import { createAppZoneRuntime } from '@/lib/citadel-apps/runtime/zone-runtime';
import { animationFrames } from '@/lib/citadel-apps/runtime/zone-input';
import { noAppSignatureCheck, pageArtifactVerifier, type AppSignatureCheck } from '@/lib/citadel-apps/runtime/verifier';

const mode: string = new URLSearchParams(window.location.search).get('mode') ?? 'ok';
const APP_ID: string = 'com.acme.kanban';
const VERSION: string = '1.4.0';
const hex = (b: ArrayBuffer): string => Array.from(new Uint8Array(b), (x: number) => x.toString(16).padStart(2, '0')).join('');
const sha = async (b: Uint8Array): Promise<string> => hex(await crypto.subtle.digest('SHA-256', new Uint8Array(b)));
const standIn = async (key: string, m: string, w: string): Promise<string> => sha(new TextEncoder().encode(`${key}|${APP_ID}|${VERSION}|${m}|${w}`));

const standInCheck: AppSignatureCheck = async (i) => hex(i.signature.slice().buffer) === await standIn(i.publicKeyHex, i.manifestSha256Hex, i.wasmSha256Hex);

async function start(): Promise<void> {
  const wasm: Uint8Array = new Uint8Array(await (await fetch(helloCanvasUrl)).arrayBuffer());
  const m: Record<string, unknown> = structuredClone((manifestCases as { base: Record<string, unknown> }).base);
  m.capabilities = ['canvas', 'events', 'log'].map((cap: string) => ({ cap, why: `Needs ${cap}`, optional: false }));
  m.artifact = { ...(m.artifact as Record<string, unknown>), sha256: await sha(wasm), bytes: wasm.byteLength };
  const manifestBytes: Uint8Array = new TextEncoder().encode(JSON.stringify(m));
  const key: string = (m.publisher as { mldsa65_public_key: string }).mldsa65_public_key;
  const [mHash, wHash] = [await sha(manifestBytes), await sha(wasm)];
  const signature: string = mode === 'bad-signature' ? 'ab'.repeat(32) : await standIn(key, mHash, wHash);
  const listing: AppListing = { source: { Global: { catalogue_version: 1n } }, manifest_bytes: Array.from(manifestBytes), signature };
  const install: AppInstall = {
    id: 'inst-h', app_id: APP_ID, version: VERSION, manifest_sha256: mHash, artifact_sha256: wHash, pinned_publisher_key: key,
    scope: 'Workspace', granted: ['canvas', 'events', 'log'],
    details: { host_network_hosts: [], server_network_hosts: [], ihttp_routes: [], ihttp_call_targets: [] },
    installed_by: 'alice', installed_at_ms: 1n, state: 'Active', previous: null, injected_header_into: [], source: { Global: { catalogue_version: 1n } },
  };
  const CHUNK: number = 64 * 1024;
  const server: AppsTransport = {
    request: async (r: AppsRequest, isOurs: (a: AppsAnswer) => boolean): Promise<AppsAnswer> => {
      const raw: unknown = typeof r === 'object' && 'GetRelease' in r ? { Release: { install_id: install.id, current: listing, waiting_on: null } }
        : typeof r === 'object' && 'FetchArtifact' in r
          ? { ArtifactChunk: { ...r.FetchArtifact, total_chunks: Math.ceil(wasm.byteLength / CHUNK), bytes: Array.from(wasm.slice(r.FetchArtifact.index * CHUNK, (r.FetchArtifact.index + 1) * CHUNK)) } }
          : { Refused: 'ServerFeatureUnavailable' };
      const a: AppsAnswer = readAppsAnswer(raw);
      if (!isOurs(a)) throw new Error(`the harness answer ${a.kind} was not taken`);
      return a;
    },
  };
  const verifier = pageArtifactVerifier(crypto.subtle, mode === 'unchecked' ? noAppSignatureCheck : standInCheck);
  const runtime = createAppZoneRuntime({
    transport: server, verifier, policy: STANDARD_HOST_POLICY, slots: new InstanceSlots(8),
    clock: { now: () => performance.now(), after: (ms: number, fire: () => void) => { const id: number = window.setTimeout(fire, ms); return () => window.clearTimeout(id); } },
    spawn: spawnAppWorker, frames: animationFrames, offscreen: (c: HTMLCanvasElement) => c.transferControlToOffscreen(),
    portWorld: async () => ({
      transport: server, agent: { send: async () => undefined, listen: () => () => undefined, newRequestId: () => crypto.randomUUID() }, agentSession: null,
      log: { LogWrite: () => ({ ok: null }) }, pushes: () => () => undefined, sha256Hex: verifier.sha256Hex, nowMs: () => Date.now(), every: () => () => undefined,
    }),
    pageUrl: () => window.location.href, locale: () => 'en', dpr: () => window.devicePixelRatio, theme: () => ({}),
  });
  const env: AppZoneEnvironment = {
    nodeId: 'n-1', me: 'alice', ancestors: [], mayInstall: 'yes', runtime,
    data: { listing: async () => ({ ok: true, value: listedApps([listing])[0] }), installs: async () => ({ ok: true, value: [install] }), setDisabledForMe: async (_i: string, d: boolean) => ({ ok: true, value: d }) },
    openLink: () => undefined, linkUrl: () => '', copyText: async () => undefined, ...zoneClaims(),
  };
  const root: HTMLElement | null = document.getElementById('root');
  if (root === null) throw new Error('the harness page has no #root');
  createRoot(root).render(
    <div className="px-6 lg:px-10 pt-8 pb-4 prose dark:prose-invert prose-sm md:prose-base lg:prose-lg max-w-4xl">
      <h1>Board</h1>
      <AppZoneContext.Provider value={env}><AppZone app={APP_ID} zone="board" height={240} /></AppZoneContext.Provider>
    </div>,
  );
}

void start();
