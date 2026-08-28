/**
 * A peer who RECEIVES a shared live document must be able to save their edits.
 *
 * `updateDocumentState` returned early when the cache had no entry — resolving
 * successfully while writing nothing. And only the CREATOR ever had an entry:
 * `createDocument` is called from the create path, while the recipient's open
 * path builds a tab and no store record.
 *
 * So every peer who received a shared document lost everything they typed the
 * moment the tab closed, with no error anywhere. The unmount flush — added
 * specifically "so closing the tab does not drop the last edits" — was the same
 * no-op, because it called the same early-returning function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const saved = new Map<string, unknown>();
vi.mock('../persistence', () => ({
  saveDocumentToDB: async (id: string, doc: unknown) => {
    saved.set(id, doc);
  },
  loadDocumentFromDB: async (id: string) => saved.get(id) ?? null,
  saveIndexToDB: async () => undefined,
  loadIndexFromDB: async () => [],
  deleteDocumentFromDB: async (id: string) => {
    saved.delete(id);
  },
  decodeValue: (v: unknown) => String(v),
}));

const { LiveDocumentStore } = await import('../service');

/**
 * The store is a singleton with a private constructor. Reaching past that in a
 * test is deliberate and narrow: these assert on persistence behaviour, and a
 * shared instance would carry one test's cache into the next.
 */
type Store = ReturnType<typeof LiveDocumentStore.getInstance>;
const freshStore = (): Store =>
  new (LiveDocumentStore as unknown as { new (): Store })();

const DOC_ID = 'shared-doc-1';

function editedDoc(text: string): Y.Doc {
  const doc = new Y.Doc();
  doc.getText('content').insert(0, text);
  return doc;
}

describe('a live document received from a peer', () => {
  beforeEach(() => saved.clear());

  it("persists the recipient's edits once adopted", async () => {
    const store = freshStore();

    // The recipient's path: it knows the id and title from the chat message.
    await store.adoptDocument(DOC_ID, 'Design notes', '42', '7');
    await store.updateDocumentState(DOC_ID, editedDoc('my contribution'));

    expect(saved.has(DOC_ID), "the recipient's edits were not written").toBe(true);
  });

  it('keeps the id it was given, so both sides edit the same document', async () => {
    const store = freshStore();

    await store.adoptDocument(DOC_ID, 'Design notes', '42', '7');

    // createDocument mints a NEW id, which would make this a second, unrelated
    // document the peer never sees.
    expect([...saved.keys()]).toEqual([DOC_ID]);
  });

  it('is idempotent, so an open path can call it without checking', async () => {
    const store = freshStore();

    await store.adoptDocument(DOC_ID, 'Design notes', '42', '7');
    await store.updateDocumentState(DOC_ID, editedDoc('first'));
    const afterEdit: number = (saved.get(DOC_ID) as { state: number[] }).state.length;

    await store.adoptDocument(DOC_ID, 'Design notes', '42', '7');

    // A second adopt must not reset the document to empty.
    expect((saved.get(DOC_ID) as { state: number[] }).state.length).toBe(afterEdit);
  });

  it('THROWS rather than silently writing nothing for an untracked document', async () => {
    const store = freshStore();

    // The original bug's shape: no record, and it resolved anyway.
    await expect(
      store.updateDocumentState('never-adopted', editedDoc('lost work'))
    ).rejects.toThrow(/not tracked locally/);
  });

  it('is adopted by the path that OPENS a received document', () => {
    // The store fix is inert unless something calls adoptDocument. Only the
    // creator's path ever called createDocument, and removing the adoption
    // from the open path failed none of the tests above — they assert on the
    // store, one layer below where the decision is made.
    const openPath: string = readFileSync(
      join(process.cwd(), 'src/components/p2p/hooks/useP2PTabs.ts'),
      'utf8'
    );
    const handler: string = openPath.slice(
      openPath.indexOf('const handleOpenDocument'),
      openPath.indexOf('const handleCreateDocument')
    );

    expect(handler, 'the open path must adopt, or a recipient still cannot save').toMatch(
      /adoptDocument\(/
    );
  });
});
