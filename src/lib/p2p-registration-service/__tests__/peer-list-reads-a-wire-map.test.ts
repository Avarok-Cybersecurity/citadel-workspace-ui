/**
 * `listAllPeers` read a Rust HashMap with `Object.values`.
 *
 * `serde_wasm_bindgen` serialises a HashMap as a JS **Map**, so
 * `Object.values(...)` yields `[]` — no error, no warning, just an empty result
 * that reads as "there are no peers". This is the service behind the Direct
 * Messages peer list, and its 30-second poll then CLEARS the peer map and
 * repopulates it from that empty answer, discarding peers learned from
 * registration events along the way.
 *
 * Two surfaces therefore disagreed about whether anyone existed: the discovery
 * modal, whose fetcher was fixed, found people; the DM sidebar, fed by this,
 * showed zero.
 *
 * `wire-map.ts` documents this exact class, and `parsePeersResponse` fifty lines
 * below in the same file already handled the Map shape. The normalizer existed,
 * the neighbouring function used it, and it was never applied here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ response: {} as Record<string, unknown> }));

vi.mock('@/lib/websocket-service', () => ({
  websocketService: { sendMessage: vi.fn(() => Promise.resolve()) },
}));
vi.mock('@/lib/broadcast-channel-service', () => ({
  broadcastChannelService: { registerRequest: vi.fn(), clearRequest: vi.fn() },
}));
// `getCurrentCid` resolves through these; without them it falls back to real
// IndexedDB, which jsdom does not have.
vi.mock('@/lib/multi-instance', () => ({ instanceManager: { cid: 1n } }));
vi.mock('../tab-context', () => ({ getSelectedUser: () => Promise.resolve({ selectedCid: 1n }) }));
vi.mock('../connection', () => ({
  connectionManager: {
    getConnectionInfo: () => ({ cid: 1n }),
    getTabSelectedSession: () => Promise.resolve({ cid: 1n }),
  },
}));

async function callListAllPeers() {
  vi.resetModules();
  const { listAllPeers } = await import('../discovery');
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const promise = listAllPeers(pending as never);
  // Settle whatever request was registered with the response under test.
  await Promise.resolve();
  for (const [, entry] of pending) entry.resolve(h.response);
  return promise;
}

beforeEach(() => {
  h.response = {};
});

describe('listAllPeers', () => {
  it('reads peers out of a Map, which is what the wire actually sends', async () => {
    h.response = {
      peer_information: new Map([
        ['42', { cid: '42', username: 'alice' }],
        ['43', { cid: '43', username: 'bob' }],
      ]),
    };

    const peers = await callListAllPeers();

    // `Object.values` on this returns [] — an empty peer list reported as fact.
    expect(peers.map((p) => (p as { username: string }).username)).toEqual(['alice', 'bob']);
  });

  it('still reads a plain object, which JSON-parsed payloads really are', async () => {
    h.response = { peer_information: { '42': { cid: '42', username: 'alice' } } };

    const peers = await callListAllPeers();

    expect(peers).toHaveLength(1);
  });

  it('returns nothing when there genuinely are no peers', async () => {
    h.response = { peer_information: new Map() };
    expect(await callListAllPeers()).toEqual([]);
  });

  it('returns nothing when the field is absent, without throwing', async () => {
    h.response = {};
    expect(await callListAllPeers()).toEqual([]);
  });
});
