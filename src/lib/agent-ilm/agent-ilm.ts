/**
 * Agent-hosted ILM, the browser's side (docs/plans/multi-browser-cid.md, phase 2c).
 *
 * An agent run with `--multi-subscriber` can run an account's reliable-messaging layer (ILM)
 * itself. It says so in `GetSessionsResponse.agent_ilm`; an older agent, or one without the
 * setting, leaves it absent, and everything here then answers "browser" and changes nothing.
 *
 * Two ILMs for one account corrupt each other, so the order is fixed:
 *   1. a FRESH GetSessions -- never a remembered offer: after a reload the agent may already host
 *      this account, and a browser ILM started then would be the second;
 *   2. mark the CID agent-hosted in the WASM client, which refuses while a browser ILM runs and
 *      from then on never opens one;
 *   3. EnableAgentIlm; on refusal, unmark, so the ordinary open proceeds.
 *
 * I/O arrives through `AgentIlmIO`, so the decisions are tested against the real
 * request/response matcher with no socket.
 */
import { requestResponse } from '@/lib/websocket/request-response';
import { TIMEOUT } from '@/lib/timeout-constants';

export type SecurityLevelName = 'Standard' | 'Reinforced' | 'High' | 'Extreme';

export interface AgentIlmIO {
  sendRequest: (request: unknown, requestId?: string) => Promise<void>;
  markAgentHosted: (cid: bigint) => Promise<void>;
  unmarkAgentHosted: (cid: bigint) => Promise<void>;
  newRequestId: () => string;
}

export type IlmHost = 'agent' | 'browser';

/** A refusal whose cause is the agent having lost the hosted ILM, i.e. it restarted. */
const NOT_OPTED_IN: RegExp = /has not opted in/i;

/** The `variant` answer to `requestId`, if `message` is one. */
function answerTo(message: Record<string, unknown>, variant: string, requestId: string): Record<string, unknown> | undefined {
  const answer: unknown = message[variant];
  if (typeof answer !== 'object' || answer === null) return undefined;
  return (answer as Record<string, unknown>).request_id === requestId ? (answer as Record<string, unknown>) : undefined;
}

/** Whether this agent offers agent-hosted ILM, from a GetSessions sent now. */
export async function agentOffersIlm(io: AgentIlmIO): Promise<boolean> {
  const requestId: string = io.newRequestId();
  return requestResponse<boolean>({
    request: { GetSessions: { request_id: requestId } },
    requestId,
    sendRequest: io.sendRequest,
    timeoutMs: TIMEOUT.SESSION_MANAGEMENT_MS,
    operationName: 'GetSessions',
    matcher: {
      // `agent_ilm` is absent from an older agent and `undefined` for a WASM `None`; only an
      // object is an offer.
      matchSuccess: (m: Record<string, unknown>): boolean | undefined => {
        const answer: Record<string, unknown> | undefined = answerTo(m, 'GetSessionsResponse', requestId);
        return answer === undefined ? undefined : typeof answer.agent_ilm === 'object' && answer.agent_ilm !== null;
      },
      matchFailure: (): string | undefined => undefined,
    },
  });
}

async function enable(io: AgentIlmIO, cid: bigint): Promise<void> {
  const requestId: string = io.newRequestId();
  await requestResponse<true>({
    request: { EnableAgentIlm: { request_id: requestId, cid } },
    requestId,
    sendRequest: io.sendRequest,
    timeoutMs: TIMEOUT.AGENT_ILM_MS,
    operationName: 'EnableAgentIlm',
    matcher: {
      matchSuccess: (m: Record<string, unknown>): true | undefined =>
        answerTo(m, 'EnableAgentIlmSuccess', requestId) ? true : undefined,
      matchFailure: (m: Record<string, unknown>): string | undefined =>
        answerTo(m, 'EnableAgentIlmFailure', requestId)?.message as string | undefined,
    },
  });
}

/**
 * Decide who runs `cid`'s ILM, opting in when the agent offers. 'browser' for an agent that does
 * not offer, or when this browser already runs its own ILM for `cid`.
 *
 * A refused opt-in unmarks and THROWS rather than falling back: some refusals ("still starting")
 * mean the agent is about to host this account, and a browser ILM then would be the second. The
 * caller's open fails visibly and the next ensure tries again.
 */
export async function adoptAgentIlm(io: AgentIlmIO, cid: bigint): Promise<IlmHost> {
  if (!(await agentOffersIlm(io))) return 'browser';
  try {
    await io.markAgentHosted(cid);
  } catch {
    // This browser already runs (or is opening) its own ILM for this account: keep it.
    return 'browser';
  }
  try {
    await enable(io, cid);
    return 'agent';
  } catch (refused) {
    await io.unmarkAgentHosted(cid);
    throw refused;
  }
}

function sendReliable(io: AgentIlmIO, cid: bigint, peerCid: bigint, message: Uint8Array, level: SecurityLevelName): Promise<true> {
  const requestId: string = io.newRequestId();
  return requestResponse<true>({
    request: {
      SendReliable: { request_id: requestId, cid, peer_cid: peerCid, message: Array.from(message), security_level: level },
    },
    requestId,
    sendRequest: io.sendRequest,
    timeoutMs: TIMEOUT.AGENT_ILM_MS,
    operationName: 'SendReliable',
    matcher: {
      matchSuccess: (m: Record<string, unknown>): true | undefined =>
        answerTo(m, 'SendReliableSuccess', requestId) ? true : undefined,
      matchFailure: (m: Record<string, unknown>): string | undefined =>
        answerTo(m, 'SendReliableFailure', requestId)?.message as string | undefined,
    },
  });
}

/**
 * Queue `message` in the agent's ILM. If the agent has lost the hosted ILM (it restarted, and its
 * opt-ins with it), opt in again and send once more; any other refusal is the caller's.
 */
export async function sendViaAgentIlm(
  io: AgentIlmIO, cid: bigint, peerCid: bigint, message: Uint8Array, level: SecurityLevelName,
): Promise<void> {
  try {
    await sendReliable(io, cid, peerCid, message, level);
  } catch (refused) {
    if (!(refused instanceof Error) || !NOT_OPTED_IN.test(refused.message)) throw refused;
    await enable(io, cid);
    await sendReliable(io, cid, peerCid, message, level);
  }
}
