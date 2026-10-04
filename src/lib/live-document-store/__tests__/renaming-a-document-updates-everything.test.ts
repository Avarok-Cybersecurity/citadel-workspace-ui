/**
 * One rename, three places: the Yjs map (authority), the stored metadata and the
 * tab. Only the LocalDB seam is faked; the store, the title module and the event
 * emitter are the real ones.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Y from 'yjs';
import type { DocumentMetadata } from '../types';

const saved: Map<string, unknown> = new Map<string, unknown>();
vi.mock('../persistence', () => ({
  saveDocumentToDB: async (id: string, doc: unknown): Promise<void> => { saved.set(id, doc); },
  loadDocumentFromDB: async (id: string): Promise<{} | null> => saved.get(id) ?? null,
  saveIndexToDB: async (): Promise<undefined> => undefined,
  loadIndexFromDB: async (): Promise<never[]> => [],
  deleteDocumentFromDB: async (id: string): Promise<void> => { saved.delete(id); },
  decodeValue: (v: unknown): string => String(v),
}));

const { liveDocumentStore } = await import('../index');
const { eventEmitter } = await import('@/lib/event-emitter');
const { readDocTitle, observeDocTitle } = await import('../doc-title');
const { renameLiveDocument, registerMountedDoc, mirrorTitle, DOC_TITLE_CHANGED_EVENT } = await import('../rename');

const unsubs: Array<() => void> = [];
afterEach(() => { unsubs.splice(0).forEach((u) => u()); });

function listenForTitles(): Array<{ documentId: string; title: string }> {
  const seen: Array<{ documentId: string; title: string }> = [];
  const handler = (p?: { documentId: string; title: string }): void => { if (p) seen.push(p); };
  eventEmitter.on(DOC_TITLE_CHANGED_EVENT, handler);
  unsubs.push(() => eventEmitter.off(DOC_TITLE_CHANGED_EVENT, handler));
  return seen;
}

describe('renameLiveDocument', () => {
  it('rejects a blank or over-long title before touching anything', async () => {
    const meta: DocumentMetadata = await liveDocumentStore.createDocument('Old', 'p', 'c');
    await expect(renameLiveDocument(meta.id, '   ')).rejects.toThrow();
    await expect(renameLiveDocument(meta.id, 'z'.repeat(81))).rejects.toThrow();
    expect((await liveDocumentStore.getDocumentMetadata(meta.id))?.title).toBe('Old');
  });

  it('with the editor mounted: writes the live doc, which the observer mirrors', async () => {
    const meta: DocumentMetadata = await liveDocumentStore.createDocument('Old', 'p', 'c');
    const live: Y.Doc = new Y.Doc();
    unsubs.push(registerMountedDoc(meta.id, live));
    // What useDocumentTitle does for a mounted editor.
    unsubs.push(observeDocTitle(live, (t) => { void mirrorTitle(meta.id, t); }));
    const seen: Array<{ documentId: string; title: string }> = listenForTitles();

    await renameLiveDocument(meta.id, '  New name ');
    await vi.waitFor(async () => {
      expect((await liveDocumentStore.getDocumentMetadata(meta.id))?.title).toBe('New name');
    });
    expect(readDocTitle(live)).toBe('New name');
    expect(seen).toEqual([{ documentId: meta.id, title: 'New name' }]);
  });

  it('with the editor closed: renames the stored state, metadata and tab', async () => {
    const meta: DocumentMetadata = await liveDocumentStore.createDocument('Old', 'p', 'c');
    const seen: Array<{ documentId: string; title: string }> = listenForTitles();

    await renameLiveDocument(meta.id, 'Closed rename');

    expect((await liveDocumentStore.getDocumentMetadata(meta.id))?.title).toBe('Closed rename');
    const reloaded: Y.Doc | null = await liveDocumentStore.loadIntoYDoc(meta.id);
    expect(reloaded && readDocTitle(reloaded)).toBe('Closed rename');
    expect(seen).toEqual([{ documentId: meta.id, title: 'Closed rename' }]);
  });

  it('refuses a document this device does not have', async () => {
    await expect(renameLiveDocument('no-such-doc', 'Name')).rejects.toThrow(/not saved/);
  });
});
