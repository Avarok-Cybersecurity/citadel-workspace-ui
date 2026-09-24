/**
 * The agent's notifications about its connection to a workspace server.
 *
 * These mirror the agent's `InternalServiceResponse` variants of the same names
 * (citadel-internal-service), which the generated `citadel-workspace-client-ts`
 * bindings do not carry yet. When they do, the interfaces below are replaced by
 * the generated ones and the guards keep their signatures. This is the one place
 * the UI spells them.
 *
 * All three name the session in `cid`: the recipient, like MessageNotification,
 * so they are routed to the tab that owns the session (routing-rules.ts). Their
 * `request_id` is always null: they answer no request. A failure is followed by
 * a DisconnectNotification for the session.
 */
export interface ServerConnectionLost {
  cid: bigint;
  /** Whether the agent is retrying. False means it has given up already. */
  reconnecting: boolean;
  request_id: string | null;
}

export interface ServerReconnected {
  cid: bigint;
  request_id: string | null;
}

export interface ServerReconnectFailed {
  cid: bigint;
  reason: string;
  request_id: string | null;
}

export const AGENT_RECONNECT_NOTIFICATIONS: readonly ['ServerConnectionLost', 'ServerReconnected', 'ServerReconnectFailed'] =
  ['ServerConnectionLost', 'ServerReconnected', 'ServerReconnectFailed'] as const;

export type AgentReconnectNotification = (typeof AGENT_RECONNECT_NOTIFICATIONS)[number];

export type AgentReconnectEvent =
  | { kind: 'lost'; cid: bigint; reconnecting: boolean }
  | { kind: 'reconnected'; cid: bigint }
  | { kind: 'failed'; cid: bigint; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The notification's body under `name`, whether or not the wire wrapped it in `Response`. */
function bodyOf(message: unknown, name: AgentReconnectNotification): (Record<string, unknown> & { cid: bigint; request_id: string | null }) | null {
  const unwrapped: unknown = isRecord(message) && isRecord(message.Response) ? message.Response : message;
  if (!isRecord(unwrapped)) return null;
  const body: unknown = unwrapped[name];
  if (!isRecord(body)) return null;
  const cid: unknown = body.cid;
  const requestId: unknown = body.request_id;
  const requestIdOk: boolean = requestId === null || typeof requestId === 'string';
  return typeof cid === 'bigint' && requestIdOk ? { ...body, cid, request_id: requestId as string | null } : null;
}

export function readServerConnectionLost(message: unknown): ServerConnectionLost | null {
  const body: (Record<string, unknown> & { cid: bigint; request_id: string | null }) | null = bodyOf(message, 'ServerConnectionLost');
  const reconnecting: unknown = body?.reconnecting;
  return body && typeof reconnecting === 'boolean' ? { cid: body.cid, reconnecting, request_id: body.request_id } : null;
}

export function readServerReconnected(message: unknown): ServerReconnected | null {
  const body: (Record<string, unknown> & { cid: bigint; request_id: string | null }) | null = bodyOf(message, 'ServerReconnected');
  return body ? { cid: body.cid, request_id: body.request_id } : null;
}

export function readServerReconnectFailed(message: unknown): ServerReconnectFailed | null {
  const body: (Record<string, unknown> & { cid: bigint; request_id: string | null }) | null = bodyOf(message, 'ServerReconnectFailed');
  const reason: unknown = body?.reason;
  return body && typeof reason === 'string' ? { cid: body.cid, reason, request_id: body.request_id } : null;
}

/** One of the three, read into a single shape, or null for anything else. */
export function readAgentReconnectEvent(message: unknown): AgentReconnectEvent | null {
  const lost: ServerConnectionLost | null = readServerConnectionLost(message);
  if (lost) return { kind: 'lost', cid: lost.cid, reconnecting: lost.reconnecting };
  const back: ServerReconnected | null = readServerReconnected(message);
  if (back) return { kind: 'reconnected', cid: back.cid };
  const failed: ServerReconnectFailed | null = readServerReconnectFailed(message);
  return failed ? { kind: 'failed', cid: failed.cid, reason: failed.reason } : null;
}
