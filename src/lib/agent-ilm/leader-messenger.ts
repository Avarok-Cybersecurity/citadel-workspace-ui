/**
 * The leader tab's messenger calls, with the agent-hosted ILM decided in ONE place.
 *
 * Two paths reach the WASM client's messenger: this tab's own calls (MessengerOperations) and
 * follower tabs' calls proxied to the leader (leader-proxy-handlers). Both come through here, so
 * a follower cannot open a browser ILM for an account the agent hosts.
 *
 * "Agent-hosted" is read live from the WASM client's mark, which is authoritative and is rebuilt
 * (empty) when the socket is. Only a "browser" decision is remembered, so the frequent ensure
 * polls do not each send a GetSessions; it is forgotten when the socket drops, because the next
 * agent may offer.
 */
import type { InternalServiceRequest, WorkspaceClient } from 'citadel-workspace-client-ts';
import { eventEmitter } from '@/lib/event-emitter';
// The two singletons from their own modules, not the package index: leader-proxy-handlers in that
// package imports this file, and going through the index would make it a cycle.
import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { instanceInboundRouter } from '@/lib/multi-instance/instance-inbound-router';
import { adoptAgentIlm, sendViaAgentIlm, type AgentIlmIO, type IlmHost, type SecurityLevelName } from './agent-ilm';

const inBrowser: Set<bigint> = new Set<bigint>();
const deciding: Map<bigint, Promise<IlmHost>> = new Map<bigint, Promise<IlmHost>>();
eventEmitter.on('websocket-disconnected', (): void => {
  inBrowser.clear();
});

function ioFor(client: WorkspaceClient): AgentIlmIO {
  return {
    // The answer comes back to THIS tab whatever session it names (see send-request.ts).
    sendRequest: async (request: unknown, requestId?: string): Promise<void> => {
      if (requestId !== undefined) instanceInboundRouter.registerPendingRequest(requestId, instanceManager.instanceId);
      await client.sendDirectToInternalService(request as InternalServiceRequest);
    },
    markAgentHosted: (cid: bigint): Promise<void> => client.markAgentHosted(cid),
    unmarkAgentHosted: (cid: bigint): Promise<void> => client.unmarkAgentHosted(cid),
    newRequestId: (): string => crypto.randomUUID(),
  };
}

/** Who runs `cid`'s ILM, deciding (once at a time) if this socket has not yet. */
async function hostFor(client: WorkspaceClient, cid: bigint): Promise<IlmHost> {
  if (await client.isAgentHosted(cid)) return 'agent';
  if (inBrowser.has(cid)) return 'browser';
  const pending: Promise<IlmHost> | undefined = deciding.get(cid);
  if (pending) return pending;
  const decision: Promise<IlmHost> = adoptAgentIlm(ioFor(client), cid).finally((): void => {
    deciding.delete(cid);
  });
  deciding.set(cid, decision);
  const host: IlmHost = await decision;
  if (host === 'browser') inBrowser.add(cid);
  return host;
}

export async function openMessengerOnLeader(client: WorkspaceClient, cid: bigint): Promise<void> {
  if ((await hostFor(client, cid)) === 'agent') return;
  await client.openMessengerFor(cid.toString());
}

/** True when a browser ILM was just opened; an agent-hosted account never opens one. */
export async function ensureMessengerOnLeader(client: WorkspaceClient, cid: bigint): Promise<boolean> {
  if ((await hostFor(client, cid)) === 'agent') return false;
  return client.ensureMessengerOpen(cid.toString());
}

export async function sendReliableOnLeader(
  client: WorkspaceClient,
  localCid: bigint,
  peerCid: bigint,
  message: Uint8Array,
  securityLevel: SecurityLevelName | undefined,
): Promise<void> {
  if (await client.isAgentHosted(localCid)) {
    // Standard when unspecified: the WASM client's parse_security_level default, which the
    // browser-ILM path below applies to the same argument.
    await sendViaAgentIlm(ioFor(client), localCid, peerCid, message, securityLevel ?? 'Standard');
    return;
  }
  await client.sendP2PMessageReliable(localCid.toString(), peerCid.toString(), message, securityLevel);
}
