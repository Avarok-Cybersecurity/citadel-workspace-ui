/**
 * Whether the agent hosts this browser's messaging (multi-window, agent 0.8.6+).
 *
 * An agent that does hosts each account's ILM and owns its conversation store
 * (citadel-workspace docs/plans/multi-window-sessions.md). It does so for a
 * connection that declares, with `ConnectionManagement::DeclareCapabilities
 * { agent_ilm: true }`, that it will run no ILM of its own. The answer,
 * `AgentCapabilities`, says whether it will.
 *
 * The agent says in its greeting -- the first message on every socket --
 * whether it can, so nothing waits on an agent that cannot: an older agent
 * does not answer a declaration at all, and its greeting has no `agent_ilm`.
 * An agent that offers is declared to and answers; one that offers and then
 * does not answer is broken, and the socket fails rather than guessing.
 *
 * The leader declares on its socket the moment the socket opens, BEFORE the
 * connection is reported up, so that no session is claimed on an undeclared
 * connection (the agent refuses that for a hosted account: "older page").
 * A follower has no socket; it asks the leader what its socket was told.
 */
import { TIMEOUT } from '../timeout-constants';
import { greetingSupervises } from '@/types/agent-supervisor';
import { createValueStore, type ValueStore } from '../value-store';
import type { InternalServiceRequest, InternalServiceResponse } from 'citadel-workspace-client-ts';

/** What the leader's socket offers to declare through. */
export interface DeclaringClient {
  sendDirectToInternalService(request: InternalServiceRequest): Promise<void>;
  nextResponse<T>(extract: (message: InternalServiceResponse) => T | undefined, timeoutMs: number): Promise<T>;
}

/** What the leader's agent said it does for this browser. */
export interface AgentCapabilities {
  agentIlm: boolean;
  /** The agent dials and heals peer links itself (types/agent-supervisor.ts). */
  supervisesP2p: boolean;
}

/** Set once by the websocket service: which tab this is, and how a follower asks the leader. */
export interface CapabilityRoute {
  isLeader: () => boolean;
  askLeader: () => Promise<AgentCapabilities>;
}

/** Whether the agent supervises peer links: null until the agent has said. */
export const supervision: ValueStore<boolean | null> = createValueStore<boolean | null>('agent-supervises-p2p', null);

/** Watches a new socket's first message, the agent's greeting, for what it offers. */
export interface Greeting {
  observe: (message: unknown) => void;
  offers: Promise<AgentCapabilities>;
}

let decided: Promise<AgentCapabilities> | null = null;
let route: CapabilityRoute | null = null;
let leaderWaiters: Array<(answer: Promise<AgentCapabilities>) => void> = [];

function inner(message: unknown, variant: string): Record<string, unknown> | undefined {
  const m: Record<string, unknown> = (message ?? {}) as Record<string, unknown>;
  const value: unknown = (m.Response as Record<string, unknown> | undefined)?.[variant] ?? m[variant];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function watchGreeting(): Greeting {
  let settle: (offers: AgentCapabilities) => void = (): void => undefined;
  const offers: Promise<AgentCapabilities> = new Promise<AgentCapabilities>((resolve) => { settle = resolve; });
  return {
    offers,
    observe: (message: unknown): void => {
      const greeting: Record<string, unknown> | undefined = inner(message, 'ServiceConnectionAccepted');
      if (greeting) settle({ agentIlm: greeting.agent_ilm === true, supervisesP2p: greetingSupervises(greeting) });
    },
  };
}

function declareRequest(requestId: string): InternalServiceRequest {
  return {
    ConnectionManagement: {
      request_id: requestId,
      management_command: { DeclareCapabilities: { capabilities: { agent_ilm: true } } },
    },
  };
}

/** `true` from an AgentCapabilities answering `requestId` that offers agent ILM. */
export function answeredWithAgentIlm(message: unknown, requestId: string): boolean | undefined {
  const answer: Record<string, unknown> | undefined = inner(message, 'AgentCapabilities');
  if (!answer || answer.request_id !== requestId) return undefined;
  return answer.agent_ilm === true;
}

function bounded<T>(promise: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => reject(new Error(what)), TIMEOUT.SESSION_MANAGEMENT_MS);
    promise.then((v: T) => { clearTimeout(timer); resolve(v); }, (e: unknown) => { clearTimeout(timer); reject(e); });
  });
}

async function declare(client: DeclaringClient, greeting: Greeting): Promise<AgentCapabilities> {
  const offers: AgentCapabilities = await bounded(greeting.offers, 'The Citadel agent did not greet this connection');
  supervision.set(offers.supervisesP2p);
  if (!offers.agentIlm) return offers;
  const requestId: string = crypto.randomUUID();
  const answer: Promise<boolean> = client.nextResponse(
    (message: InternalServiceResponse) => answeredWithAgentIlm(message, requestId),
    TIMEOUT.SESSION_MANAGEMENT_MS,
  );
  await client.sendDirectToInternalService(declareRequest(requestId));
  return { ...offers, agentIlm: await answer };
}

/** The leader's socket just opened: declare on it if the agent offers, and let every caller wait for the answer. */
export function declareOnLeaderSocket(client: DeclaringClient, greeting: Greeting): Promise<boolean> {
  const caps: Promise<AgentCapabilities> = declare(client, greeting);
  decided = caps;
  for (const wake of leaderWaiters) wake(caps);
  leaderWaiters = [];
  return caps.then((c: AgentCapabilities): boolean => c.agentIlm);
}

/**
 * The leader's socket failed to open, so it will not declare. Its waiting
 * callers hear that failure rather than wait on a declaration that cannot come;
 * nothing is remembered, so the next socket is asked afresh.
 */
export function leaderSocketFailedToOpen(error: unknown): void {
  const failed: Promise<AgentCapabilities> = Promise.reject(error instanceof Error ? error : new Error(String(error)));
  failed.catch((): void => undefined);
  for (const wake of leaderWaiters) wake(failed);
  leaderWaiters = [];
}

export function registerCapabilityRoute(r: CapabilityRoute): void {
  route = r;
}

function capabilities(): Promise<AgentCapabilities> {
  if (decided) return decided;
  // No websocket service in this context (a test, a page without one): no agent to host anything.
  if (!route) return Promise.resolve({ agentIlm: false, supervisesP2p: false });
  // The leader's own socket has not declared yet: its answer is the one.
  if (route.isLeader()) return new Promise<AgentCapabilities>((resolve, reject) => { leaderWaiters.push((a) => a.then(resolve, reject)); });
  const asked: Promise<AgentCapabilities> = route.askLeader().then(
    (caps: AgentCapabilities): AgentCapabilities => {
      supervision.set(caps.supervisesP2p);
      return caps;
    },
    (error: unknown): never => {
      if (decided === asked) decided = null; // asked again next time, not failed for good
      throw error;
    },
  );
  decided = asked;
  return asked;
}

/** Whether this browser's messaging goes through the agent. */
export function agentHostsConversations(): Promise<boolean> {
  return capabilities().then((c: AgentCapabilities): boolean => c.agentIlm);
}

/** Whether the agent dials and heals this browser's peer links; waits until the agent has said. */
export function agentSupervisesP2p(): Promise<boolean> {
  return capabilities().then((c: AgentCapabilities): boolean => c.supervisesP2p);
}

/** The socket this answer was for is gone; the next socket declares again. */
export function forgetCapabilities(): void {
  decided = null;
  supervision.set(null);
}
