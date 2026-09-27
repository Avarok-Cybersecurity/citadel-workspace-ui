/**
 * The side that shared a P2P live document is its creator, on both sides.
 *
 * The creator is the authority when the two copies diverge (ack-checker, sync-handlers). The
 * recipient used to record itself as the creator, in the store and in the provider, so both
 * sides claimed authority and neither deferred.
 *
 * Real: the tabs hook. Stubbed: the store's adopt, which writes IndexedDB (I/O).
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { liveDocumentStore } from '@/lib/live-document-store';
import { useP2PTabs } from '../useP2PTabs';

const SELF: bigint = 7n;
const PEER: bigint = 42n;
let adopt: MockInstance<typeof liveDocumentStore.adoptDocument>;
beforeEach(() => { adopt = vi.spyOn(liveDocumentStore, 'adoptDocument').mockResolvedValue(undefined); });

describe('opening a P2P live document', () => {
  it("records the peer as creator of a document the peer shared", () => {
    const { result } = renderHook(() => useP2PTabs({ peerCid: PEER, currentUserCid: SELF }));
    act(() => { result.current.handleOpenDocument('d1', 'Plan', false); });
    expect(result.current.activeTab?.creatorCid).toBe(PEER);
    expect(adopt).toHaveBeenCalledWith('d1', 'Plan', PEER.toString(), PEER.toString());
  });

  it('records this side as creator of a document it shared', () => {
    const { result } = renderHook(() => useP2PTabs({ peerCid: PEER, currentUserCid: SELF }));
    act(() => { result.current.handleOpenDocument('d2', 'Mine', true); });
    expect(result.current.activeTab?.creatorCid).toBe(SELF);
    expect(adopt).toHaveBeenCalledWith('d2', 'Mine', PEER.toString(), SELF.toString());
  });
});
