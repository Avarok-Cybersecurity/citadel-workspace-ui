/**
 * Every PeerConnect carries the initiating session's relay servers when its
 * workspace server has granted some, and carries no `turn` field when it has
 * not.
 *
 * `openP2PConnection` is the only place a PeerConnect is built. Auto-connect
 * calls it in two orientations — `(ours, peer)` when this session initiates,
 * and `(peer, ours)` when the leader initiates on behalf of the other session
 * in the same browser — so both are pinned, each fetching for its own `cid`.
 *
 * Only the two transports are fakes: the workspace answer (`IceServersPort`)
 * and the agent socket (`sendMessage`). The cache, the helper that attaches
 * `turn`, and the request builder are production code.
 */
import { describe, it, expect } from 'vitest';
import { P2POperations } from '../p2p-operations';
import { eventEmitter } from '@/lib/event-emitter';
import { IceServersCache, turnSourceFrom, type IceServersPort } from '@/lib/ice-servers';

const OURS: bigint = 7001n;
const PEER: bigint = 7002n;
const EXPIRES_AT_S: number = Math.floor(Date.now() / 1000) + 3600;

type Sent = Record<string, Record<string, unknown>>;

function grant(forCid: bigint): Record<string, unknown> {
  return {
    IceServers: {
      ice_servers: [{ urls: ['turn:turn.example:3478'], username: `u-${forCid}`, credential: 'pw' }],
      expires_at: EXPIRES_AT_S,
    },
  };
}

interface Rig {
  ops: P2POperations;
  sent: Sent[];
  asked: bigint[];
}

function rig(answer: (cid: bigint) => unknown): Rig {
  const sent: Sent[] = [];
  const asked: bigint[] = [];
  const port: IceServersPort = {
    request: async (cid: bigint): Promise<unknown> => { asked.push(cid); return answer(cid); },
  };
  const ops: P2POperations = new P2POperations({
    init: async (): Promise<void> => {},
    sendMessage: async (message: unknown): Promise<void> => {
      const body: Sent = message as Sent;
      sent.push(body);
      const req: Record<string, unknown> | undefined = body.PeerConnect;
      if (req) {
        queueMicrotask((): void => {
          eventEmitter.emit('websocket-message', {
            PeerConnectSuccess: { cid: req.cid, peer_cid: req.peer_cid, request_id: req.request_id, path: 'direct' },
          });
        });
      }
    },
    isLeader: (): boolean => true,
    turnFor: turnSourceFrom(new IceServersCache(port, Date.now)),
  });
  return { ops, sent, asked };
}

function peerConnectOf(r: Rig): Record<string, unknown> {
  const body: Record<string, unknown> | undefined = r.sent.find((s: Sent): boolean => 'PeerConnect' in s)?.PeerConnect;
  if (!body) throw new Error('no PeerConnect was sent');
  return body;
}

describe('PeerConnect and the relay', () => {
  it.each([
    ['this session initiating', OURS, PEER],
    ['the leader initiating for the other session', PEER, OURS],
  ])('includes turn when %s', async (_label: string, initiator: bigint, target: bigint) => {
    const r: Rig = rig(grant);
    await r.ops.openP2PConnection(initiator, target);

    expect(r.asked).toEqual([initiator]);
    expect(peerConnectOf(r).turn).toEqual({
      policy: 'fallback',
      ice_servers: [{ urls: ['turn:turn.example:3478'], username: `u-${initiator}`, credential: 'pw' }],
      expires_at: BigInt(EXPIRES_AT_S),
    });
  });

  it.each([
    ['Unavailable', { IceServersUnavailable: { reason: 'no relay configured' } }],
    ['Error', { Error: 'Permission denied: Guest' }],
  ])('has no turn field at all after %s', async (_label: string, answer: unknown) => {
    const r: Rig = rig((): unknown => answer);
    await r.ops.openP2PConnection(OURS, PEER);

    const body: Record<string, unknown> = peerConnectOf(r);
    expect('turn' in body).toBe(false);
    expect(body.peer_cid).toBe(PEER);
  });
});
