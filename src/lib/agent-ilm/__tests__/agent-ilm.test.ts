/**
 * Who runs an account's ILM, and how a message reaches the agent's.
 *
 * Real: requestResponse, the event bus it listens on, and every decision in agent-ilm.ts.
 * Faked: the agent at the other end of the socket, which answers on the bus exactly as the
 * WebSocket delivers answers, and the WASM marks -- the two edges a unit test has no process for.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { eventEmitter } from '@/lib/event-emitter';
import { adoptAgentIlm, sendViaAgentIlm, type AgentIlmIO } from '../agent-ilm';

type Request = Record<string, Record<string, unknown>>;
type Answer = (request: Request) => Record<string, unknown> | null;

interface FakeAgent {
  io: AgentIlmIO;
  sent: string[];
  marks: string[];
}

function fakeAgent(answer: Answer, markRefused: boolean = false): FakeAgent {
  const sent: string[] = [];
  const marks: string[] = [];
  let n: number = 0;
  const io: AgentIlmIO = {
    newRequestId: (): string => `r${(n += 1)}`,
    sendRequest: async (request: unknown): Promise<void> => {
      const req: Request = request as Request;
      sent.push(Object.keys(req)[0]);
      const reply: Record<string, unknown> | null = answer(req);
      if (reply) queueMicrotask((): void => eventEmitter.emit('websocket-message', reply));
    },
    markAgentHosted: async (cid: bigint): Promise<void> => {
      if (markRefused) throw new Error('this browser already runs this account\'s ILM');
      marks.push(`mark ${cid}`);
      sent.push(`mark ${cid}`);
    },
    unmarkAgentHosted: async (cid: bigint): Promise<void> => {
      marks.push(`unmark ${cid}`);
      sent.push(`unmark ${cid}`);
    },
  };
  return { io, sent, marks };
}

const id = (req: Request): string => Object.values(req)[0].request_id as string;

/** An agent that offers (or not), and answers opt-ins and sends as told. */
function agent(opts: { offer: unknown; enable?: string | null; send?: (attempt: number) => string | null }): Answer {
  let sends: number = 0;
  return (req: Request): Record<string, unknown> | null => {
    if (req.GetSessions) {
      const body: Record<string, unknown> = { cid: 0n, sessions: [], request_id: id(req) };
      if (opts.offer !== 'absent') body.agent_ilm = opts.offer;
      return { GetSessionsResponse: body };
    }
    if (req.EnableAgentIlm) {
      return opts.enable
        ? { EnableAgentIlmFailure: { cid: 7n, message: opts.enable, request_id: id(req) } }
        : { EnableAgentIlmSuccess: { cid: 7n, already_hosted: false, request_id: id(req) } };
    }
    if (req.SendReliable) {
      const refusal: string | null = opts.send ? opts.send((sends += 1)) : null;
      return refusal
        ? { SendReliableFailure: { cid: 7n, peer_cid: 9n, message: refusal, request_id: id(req) } }
        : { SendReliableSuccess: { cid: 7n, peer_cid: 9n, request_id: id(req) } };
    }
    return null;
  };
}

describe('who runs the ILM', () => {
  beforeEach(() => { eventEmitter.removeAllListeners?.('websocket-message'); });

  it('stays in the browser with an agent that offers nothing, and asks nothing more', async () => {
    for (const offer of ['absent', undefined, null]) {
      const a: FakeAgent = fakeAgent(agent({ offer }));
      expect(await adoptAgentIlm(a.io, 7n)).toBe('browser');
      expect(a.sent).toEqual(['GetSessions']);
      expect(a.marks).toEqual([]);
    }
  });

  it('marks the account BEFORE opting in, then lets the agent run it', async () => {
    const a: FakeAgent = fakeAgent(agent({ offer: { hosted: [] } }));
    expect(await adoptAgentIlm(a.io, 7n)).toBe('agent');
    // One timeline: the mark lands between the fresh GetSessions and the opt-in.
    expect(a.sent).toEqual(['GetSessions', 'mark 7', 'EnableAgentIlm']);
    expect(a.marks).toEqual(['mark 7']);
  });

  it('keeps a browser ILM that is already running, and never opts in over it', async () => {
    const a: FakeAgent = fakeAgent(agent({ offer: { hosted: [] } }), true);
    expect(await adoptAgentIlm(a.io, 7n)).toBe('browser');
    expect(a.sent).toEqual(['GetSessions']);
  });

  it('unmarks and fails visibly when the agent refuses the opt-in', async () => {
    const a: FakeAgent = fakeAgent(agent({ offer: { hosted: [] }, enable: 'An opt-in for this account is still starting; retry' }));
    await expect(adoptAgentIlm(a.io, 7n)).rejects.toThrow(/still starting/);
    expect(a.sent).toEqual(['GetSessions', 'mark 7', 'EnableAgentIlm', 'unmark 7']);
  });
});

describe('a message through the agent\'s ILM', () => {
  const body: Uint8Array = new Uint8Array([1, 2, 3]);

  it('is queued with one SendReliable', async () => {
    const a: FakeAgent = fakeAgent(agent({ offer: { hosted: [7n] } }));
    await sendViaAgentIlm(a.io, 7n, 9n, body, 'Standard');
    expect(a.sent).toEqual(['SendReliable']);
  });

  it('opts in again and resends once after the agent lost the hosted ILM', async () => {
    const lost = (attempt: number): string | null =>
      attempt === 1 ? 'This session has not opted in to agent-hosted ILM' : null;
    const a: FakeAgent = fakeAgent(agent({ offer: { hosted: [] }, send: lost }));
    await sendViaAgentIlm(a.io, 7n, 9n, body, 'Standard');
    // The WASM mark survives an agent restart (it is this browser's state), so only the opt-in repeats.
    expect(a.sent).toEqual(['SendReliable', 'EnableAgentIlm', 'SendReliable']);
  });

  it('surfaces any other refusal without opting in', async () => {
    const a: FakeAgent = fakeAgent(agent({ offer: { hosted: [] }, send: (): string => 'Agent-hosted ILM refused it: storage error' }));
    await expect(sendViaAgentIlm(a.io, 7n, 9n, body, 'Standard')).rejects.toThrow(/storage error/);
    expect(a.sent).toEqual(['SendReliable']);
  });
});
