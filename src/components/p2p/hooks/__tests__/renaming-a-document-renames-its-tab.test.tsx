/**
 * A rename, from this user or from a peer, retitles the document's tab.
 *
 * Mocked: the P2P messenger (network I/O) and LocalDB persistence (storage I/O).
 * The tabs hook, the store, the rename path and the event emitter are production code.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Y from 'yjs';

const saved: Map<string, unknown> = new Map<string, unknown>();
vi.mock('@/lib/live-document-store/persistence', () => ({
  saveDocumentToDB: async (id: string, doc: unknown): Promise<void> => { saved.set(id, doc); },
  loadDocumentFromDB: async (id: string): Promise<{} | null> => saved.get(id) ?? null,
  saveIndexToDB: async (): Promise<undefined> => undefined,
  loadIndexFromDB: async (): Promise<never[]> => [],
  deleteDocumentFromDB: async (id: string): Promise<void> => { saved.delete(id); },
  decodeValue: (v: unknown): string => String(v),
}));
const sendMessage: ReturnType<typeof vi.fn> = vi.fn(async () => undefined);
vi.mock('@/lib/p2p', () => ({
  P2PMessengerManager: { getInstance: (): { sendMessage: typeof sendMessage } => ({ sendMessage }) },
}));

const { useP2PTabs } = await import('../useP2PTabs');
const { observeDocTitle, writeDocTitle } = await import('@/lib/live-document-store/doc-title');
const { registerMountedDoc, mirrorTitle } = await import('@/lib/live-document-store/rename');

async function openedDoc(): Promise<{ result: { current: ReturnType<typeof useP2PTabs> }; docId: string }> {
  const hook = renderHook(() => useP2PTabs({ peerCid: 7n, currentUserCid: 9n }));
  await act(async () => { await hook.result.current.handleCreateDocument('Draft', ''); });
  const docId: string = hook.result.current.tabs[1].documentId ?? '';
  return { result: hook.result, docId };
}

describe('the document tab title', () => {
  it('starts as the title the document was created with', async () => {
    const { result } = await openedDoc();
    expect(result.current.tabs.map((t) => t.title)).toEqual(['Messages', 'Draft']);
  });

  it('follows a rename made from the tab', async () => {
    const { result, docId } = await openedDoc();
    await act(async () => { await result.current.handleRenameDocument(docId, '  Launch plan ') });
    await waitFor(() => expect(result.current.tabs[1].title).toBe('Launch plan'));
    expect(result.current.tabs[0].title).toBe('Messages');
  });

  it('follows a rename a PEER made inside the shared Y.Doc', async () => {
    const { result, docId } = await openedDoc();
    const mine: Y.Doc = new Y.Doc();
    const peer: Y.Doc = new Y.Doc();
    const stop: Array<() => void> = [
      registerMountedDoc(docId, mine),
      observeDocTitle(mine, (t) => { void mirrorTitle(docId, t); }),
    ];
    mine.on('update', (u: Uint8Array, o: unknown) => { if (o !== 'peer') Y.applyUpdate(peer, u, 'mine'); });
    peer.on('update', (u: Uint8Array, o: unknown) => { if (o !== 'mine') Y.applyUpdate(mine, u, 'peer'); });

    act(() => { writeDocTitle(peer, 'Peer renamed'); });
    await waitFor(() => expect(result.current.tabs[1].title).toBe('Peer renamed'));
    stop.forEach((s) => s());
  });

  it('keeps the old title when the new one is invalid', async () => {
    const { result, docId } = await openedDoc();
    await expect(result.current.handleRenameDocument(docId, '   ')).rejects.toThrow();
    expect(result.current.tabs[1].title).toBe('Draft');
  });
});
