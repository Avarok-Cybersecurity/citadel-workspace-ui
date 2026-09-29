/**
 * Everything that waits on a P2P connect outlasts the SDK's own bound on it.
 *
 * Found by the SDK lane (2026-09-29): a failed hole punch falls back to relaying
 * through the server and still succeeds, inside the SDK's 60 s bound. The agent
 * and this app both gave up at 30 s, so on any network where punching fails the
 * connection was reported as a failure. Limit of this check: it compares against
 * the mirrored SDK_P2P_CONNECT_BOUND_MS, not the Rust constant itself.
 */
import { describe, it, expect } from 'vitest';
import { SDK_P2P_CONNECT_BOUND_MS, TIMEOUT } from '@/lib/timeout-constants';
import { WAIT_FOR_PEER_TIMEOUT_MS } from '@/lib/p2p-auto-connect-service/constants';

describe('waiting on a P2P connect', () => {
  it('the PeerConnect request outlasts the SDK bound', () => {
    expect(TIMEOUT.P2P_CONNECT_REQUEST_MS).toBeGreaterThan(SDK_P2P_CONNECT_BOUND_MS);
  });

  it('waitForPeerConnected outlasts it too', () => {
    expect(WAIT_FOR_PEER_TIMEOUT_MS).toBeGreaterThan(SDK_P2P_CONNECT_BOUND_MS);
  });
});
