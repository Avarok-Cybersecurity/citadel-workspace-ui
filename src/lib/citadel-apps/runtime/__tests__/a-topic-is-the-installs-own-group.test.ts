/**
 * The topic port: the first member to open a topic creates its group and claims it with the
 * kernel, a later one joins the claimed group, a lost claim race leaves the loser's group, the
 * owner admits a joiner only on the kernel's word, and a message reaches the app stamped by the
 * kernel. Every group id and create request is recorded for the chat pipeline before the agent
 * answers. The agent is an in-memory AgentLink (it answers each request with its Success) and
 * the kernel two injected functions; the port, its rules and the codec are the production ones.
 */
import { describe, expect, it } from 'vitest';
import type { TopicArrival } from '../../host/ports';
import type { PeerAuthorization } from '../../member-consent-types';
import type { AgentLink } from '../agent-link';
import { PeerAuthority } from '../peer-authority';
import { encodeTopicMessage } from '../topic-model';
import { topicPort, type OwnedTopicPort } from '../topic-port';

const ME: bigint = 100n;
const SUCCESS: Readonly<Record<string, string>> = {
  GroupCreateAppTopic: 'GroupCreateSuccess', GroupRequestJoin: 'GroupRequestJoinSuccess', GroupLeave: 'GroupLeaveSuccess',
  GroupMessage: 'GroupMessageSuccess', GroupRespondRequest: 'GroupRespondRequestSuccess',
};

interface World {
  port: OwnedTopicPort;
  sent: Record<string, Record<string, unknown>>[];
  recorded: string[];
  arrivals: TopicArrival[];
  push: (m: Record<string, unknown>) => Promise<void>;
  refusedSeen: string[];
  listening: () => number;
  variants: () => string[];
}

// Test defaults: a member admits, nobody races the claim, and the server refuses nothing, unless a case says so.
function world(claimed: string | null, admit: boolean = true, raced: string | null = null, refusal: Record<string, unknown> | null = null): World {
  const handlers: Set<(m: unknown) => void> = new Set();
  const sent: Record<string, Record<string, unknown>>[] = [];
  const recorded: string[] = [];
  let n: number = 0;
  let kernel: string | null = claimed;
  const agent: AgentLink = {
    newRequestId: () => `req-${++n}`,
    listen: (h) => { handlers.add(h); return () => handlers.delete(h); },
    send: async (request: Record<string, unknown>) => {
      const [variant, body] = Object.entries(request)[0] as [string, Record<string, unknown>];
      expect(recorded.length > 0 || variant !== 'GroupCreateAppTopic').toBe(true);
      sent.push({ [variant]: body });
      const answer: Record<string, unknown> = { cid: ME, request_id: body.request_id, group_key: variant === 'GroupCreateAppTopic' ? { cid: ME, mgid: 7n } : body.group_key };
      const reply: Record<string, unknown> | null = variant === 'GroupMessage' && refusal !== null
        ? { GroupMessageRefusedNotification: { cid: ME, group_key: body.group_key, refusal, request_id: null } }
        : null;
      // The send is accepted, then the server refuses it on its own, naming no request (as the agent does).
      queueMicrotask(() => handlers.forEach((h) => h({ [SUCCESS[variant]]: answer })));
      if (reply !== null) queueMicrotask(() => handlers.forEach((h) => h(reply)));
    },
  };
  const ask = async (peerCid: bigint): Promise<PeerAuthorization> =>
    (admit ? { ok: true, peer: { username: 'alice', cid: peerCid, app_id: 'a', install_id: 'i' }, untilMs: 60_000n } : { ok: false });
  const arrivals: TopicArrival[] = [];
  const refusedSeen: string[] = [];
  const port: OwnedTopicPort = topicPort({
    cid: ME, agent, topics: ['pool'], limits: { max_msg_bytes: 64, max_msgs_per_s: 2 }, nowMs: () => 0, timeoutMs: 1000,
    authority: new PeerAuthority(ask, () => 0, 30),
    topicGroup: async (_t: string, claim: string | null) => { if (claim !== null && raced !== null) kernel = raced; if (kernel === null && claim !== null) kernel = claim; return kernel; },
    record: { group: (id: string) => recorded.push(`group ${id}`), request: (id: string) => recorded.push(`request ${id}`) },
    refused: (topic: string, limit: string) => refusedSeen.push(`${topic} ${limit}`),
  });
  port.onEvent((a: TopicArrival) => arrivals.push(a));
  const push = async (m: Record<string, unknown>): Promise<void> => { handlers.forEach((h) => h(m)); await new Promise<void>((r) => setTimeout(r, 0)); };
  return { port, sent, recorded, arrivals, push, refusedSeen, listening: (): number => handlers.size, variants: (): string[] => sent.map((s) => Object.keys(s)[0]) };
}

describe('a topic is the install’s own group', () => {
  it('the first member creates and claims it, recording both before the agent answers', async () => {
    const w: World = world(null);
    expect(await w.port.TopicOpen({ name: 'pool' })).toEqual({ ok: { name: 'pool', members: [] } });
    expect(w.variants()).toEqual(['GroupCreateAppTopic']);
    expect(w.sent[0]).toMatchObject({ GroupCreateAppTopic: { cid: ME, max_msg_bytes: 64, max_msgs_per_s: 2 } });
    expect(w.recorded).toEqual(['request req-1', `group ${ME}:7`]);
  });

  it('a later member joins the claimed group', async () => {
    const w: World = world('5:9');
    expect(await w.port.TopicOpen({ name: 'pool' })).toMatchObject({ ok: { name: 'pool' } });
    expect(w.variants()).toEqual(['GroupRequestJoin']);
    expect(w.recorded).toEqual(['group 5:9']);
  });

  it('a lost claim race leaves our group and joins the winner’s', async () => {
    const w: World = world(null, true, '6:1');
    expect(await w.port.TopicOpen({ name: 'pool' })).toMatchObject({ ok: { name: 'pool' } });
    expect(w.variants()).toEqual(['GroupCreateAppTopic', 'GroupLeave', 'GroupRequestJoin']);
    expect(w.sent[1]).toMatchObject({ GroupLeave: { group_key: { cid: ME, mgid: 7n } } });
    expect(w.sent[2]).toMatchObject({ GroupRequestJoin: { group_key: { cid: 6n, mgid: 1n } } });
  });

  it('a name not granted opens nothing', async () => {
    const w: World = world(null);
    expect(await w.port.TopicOpen({ name: 'chat' })).toEqual({ refused: { policy: 'unknown_topic' } });
    expect(w.sent).toEqual([]);
  });

  it('publishes in its envelope, under the limits, only once open', async () => {
    const w: World = world('5:9');
    expect(await w.port.TopicPublish({ name: 'pool', body: new Uint8Array(1) })).toEqual({ refused: { policy: 'topic_not_open' } });
    await w.port.TopicOpen({ name: 'pool' });
    expect(await w.port.TopicPublish({ name: 'pool', body: new Uint8Array(65) })).toEqual({ refused: { limit: 'topic_bytes' } });
    expect(await w.port.TopicPublish({ name: 'pool', body: new Uint8Array([1]) })).toEqual({ ok: null });
    expect(w.variants()).toEqual(['GroupRequestJoin', 'GroupMessage']);
  });

  it('the server’s refusal of a message, which names no request, is reported as the topic limit it names', async () => {
    const seen: string[][] = [];
    for (const refusal of [{ TooLarge: { bytes: 70n, max_bytes: 64 } }, { RateLimited: { max_per_second: 2 } }, null]) {
      const w: World = world('5:9', true, null, refusal);
      await w.port.TopicOpen({ name: 'pool' });
      expect(await w.port.TopicPublish({ name: 'pool', body: new Uint8Array([1]) })).toEqual({ ok: null });
      await new Promise<void>((r) => setTimeout(r, 0));
      seen.push(w.refusedSeen);
    }
    expect(seen).toEqual([['pool topic_bytes'], ['pool topic_rate'], []]);
  });

  it('a refusal for another session or another group is not this topic’s (control: closed, it listens to nothing)', async () => {
    const w: World = world('5:9');
    await w.port.TopicOpen({ name: 'pool' });
    await w.push({ GroupMessageRefusedNotification: { cid: 999n, group_key: { cid: 5n, mgid: 9n }, refusal: { RateLimited: { max_per_second: 2 } }, request_id: null } });
    await w.push({ GroupMessageRefusedNotification: { cid: ME, group_key: { cid: 5n, mgid: 1n }, refusal: { RateLimited: { max_per_second: 2 } }, request_id: null } });
    expect(w.refusedSeen).toEqual([]);
    await w.push({ GroupMessageRefusedNotification: { cid: ME, group_key: { cid: 5n, mgid: 9n }, refusal: { RateLimited: { max_per_second: 2 } }, request_id: null } });
    expect(w.refusedSeen).toEqual(['pool topic_rate']);
    w.port.closeAll();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(w.listening()).toBe(0);
    await w.push({ GroupMessageRefusedNotification: { cid: ME, group_key: { cid: 5n, mgid: 9n }, refusal: { RateLimited: { max_per_second: 2 } }, request_id: null } });
    expect(w.refusedSeen).toEqual(['pool topic_rate']);
  });

  it('a member’s message reaches the app stamped by the kernel; a refused sender is dropped', async () => {
    for (const admit of [true, false]) {
      const w: World = world('5:9', admit);
      await w.port.TopicOpen({ name: 'pool' });
      await w.push({ GroupMessageNotification: { cid: ME, peer_cid: 8n, group_key: { cid: 5n, mgid: 9n }, message: Array.from(encodeTopicMessage('pool', new Uint8Array([4]))), request_id: null } });
      expect(w.arrivals).toEqual([admit
        ? { name: 'pool', event: { message: { from: { username: 'alice', cid: 8n, app_id: 'a', install_id: 'i', via: 'group' }, body: new Uint8Array([4]) } } }
        : { name: 'pool', event: { dropped: { from: '8' } } }]);
    }
  });

  it('the owner admits a joiner only on the kernel’s word', async () => {
    for (const admit of [true, false]) {
      const w: World = world(null, admit);
      await w.port.TopicOpen({ name: 'pool' });
      await w.push({ GroupJoinRequestNotification: { cid: ME, peer_cid: 8n, group_key: { cid: ME, mgid: 7n }, request_id: null } });
      expect(w.sent.at(-1)).toMatchObject({ GroupRespondRequest: { peer_cid: 8n, response: admit } });
    }
  });
});
