/**
 * The ports one running instance gets, bound to its install: server-side storage, blobs, files and
 * egress over `AppsRequest::Call`; `storage.local` and host egress through the local agent, only
 * when this tab's agent says it serves apps (`apps` in its greeting) and a session is signed in;
 * internal HTTP over the server relay; the events port; the page log. A port left out answers
 * `{refused: {unavailable: <port>}}` (host/ports.ts), which is what "not here" means to an app.
 */
import type { AppInstall } from 'citadel-workspace-client-ts';
import type { AppsTransport } from '@/lib/workspace-service/apps-operations';
import { advertiseService, callHost, ihttpSend } from '@/lib/workspace-service/apps-runtime-operations';
import type { EventsPort, HostPorts, LogPort } from '../host/ports';
import type { HostPolicy } from '../host/limits';
import type { AgentLink } from './agent-link';
import { agentKvPort, splitStorage } from './agent-kv-port';
import { agentFetchPort } from './agent-fetch-port';
import { relayIhttpPort } from './ihttp-relay-port';
import { serverBlob, serverFiles, serverNet, serverStorage, type HostCaller } from './kernel-call-ports';

export interface PortWorld {
  readonly transport: AppsTransport;
  readonly agent: AgentLink;
  /** This tab's session CID and whether its agent serves apps; null when either is not so. */
  readonly agentSession: { readonly cid: bigint } | null;
  readonly pushes: (listener: (answer: unknown) => void) => () => void;
  readonly sha256Hex: (bytes: Uint8Array) => Promise<string>;
  readonly nowMs: () => number;
  readonly every: (ms: number, fire: () => void) => () => void;
  readonly log: LogPort;
  readonly policy: HostPolicy;
}

export interface BoundPorts {
  readonly ports: HostPorts;
  readonly stop: () => void;
}

export function hostPortsFor(install: AppInstall, scopeKey: string, events: EventsPort, w: PortWorld): BoundPorts {
  const call: HostCaller = (bytes: Uint8Array) => callHost(w.transport, install.id, bytes);
  const session: { readonly cid: bigint } | null = w.agentSession;
  const local = session === null ? null : agentKvPort(w.agent, { cid: session.cid, appId: install.app_id, scopeKey, timeoutMs: w.policy.portTimeoutMs });
  const hostNet = session === null ? null : agentFetchPort(w.agent, {
    cid: session.cid, appId: install.app_id, installId: install.id, timeoutMs: w.policy.hostNetTimeoutMs,
    grant: { hosts: install.details.host_network_hosts, private: install.granted.includes('net.host.private') },
  });
  const ihttp = relayIhttpPort({
    installId: install.id, pushes: w.pushes, sha256Hex: w.sha256Hex, nowMs: w.nowMs, every: w.every,
    send: (to, frame) => ihttpSend(w.transport, install.id, to, frame),
    advertise: (digest, untilMs) => advertiseService(w.transport, install.id, digest, untilMs),
  });
  const ports: HostPorts = {
    storage: splitStorage(serverStorage(call), local), blob: serverBlob(call), storeFiles: serverFiles(call),
    serverNet: serverNet(call), ihttp, events, log: w.log, ...(hostNet === null ? {} : { hostNet }),
  };
  return {
    ports,
    stop: (): void => {
      ihttp.stop();
      hostNet?.closeAll();
    },
  };
}
