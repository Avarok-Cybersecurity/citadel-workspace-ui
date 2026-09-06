/**
 * Deleting a document must DELETE its LocalDB key.
 *
 * `deleteDocumentFromDB` used to write an empty array over the key — a
 * tombstone the backend cannot tell from data — where its twin
 * (`MessagePaginationStore`) issues a real `sendLocalDBDelete`. So deleted
 * keys accumulated forever, and a later read of one decoded `[]` to '' and
 * failed JSON.parse, which `loadDocumentFromDB` logged as "COULD NOT READ" —
 * a false read-failure alarm for a document that was deliberately removed.
 *
 * The fake backend below mirrors the real one's absence contract: a GET of a
 * missing key REJECTS with "Key not found" (see storage/absence.ts), it does
 * not resolve null. That contract is what makes the tombstone observable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredDocument } from '../types';

const db: Map<string, number[]> = new Map<string, number[]>();

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendLocalDBGet: async (_cid: bigint, key: string): Promise<{ value: number[] }> => {
      const value: number[] | undefined = db.get(key);
      if (value === undefined) throw new Error(`Key not found: ${key}`);
      return { value };
    },
    sendLocalDBSet: async (_cid: bigint, key: string, value: number[]): Promise<void> => {
      db.set(key, value);
    },
    sendLocalDBDelete: async (_cid: bigint, key: string): Promise<void> => {
      if (!db.has(key)) throw new Error(`Key not found: ${key}`);
      db.delete(key);
    },
  },
}));

const logged: unknown[][] = [];
vi.mock('@/lib/debug-config', () => ({ debugEnabled: false,
  debugLog: (...args: unknown[]): void => { logged.push(args); },
}));

const { saveDocumentToDB, loadDocumentFromDB, deleteDocumentFromDB } = await import('../persistence');
const { DOCUMENTS_KEY_PREFIX } = await import('../types');

const docRecord = (id: string): StoredDocument => ({
  metadata: { id, title: id, peerCid: '1', creatorCid: '2', createdAt: 1, updatedAt: 1, rootHash: 'h', revision: 0 },
  state: [],
  revisionChain: [],
} as unknown as StoredDocument);

beforeEach(() => {
  db.clear();
  logged.length = 0;
});

describe('deleteDocumentFromDB', () => {
  it('removes the key from LocalDB instead of tombstoning it', async () => {
    await saveDocumentToDB('doc-1', docRecord('doc-1'));
    expect(db.has(`${DOCUMENTS_KEY_PREFIX}_doc-1`)).toBe(true);

    await deleteDocumentFromDB('doc-1');

    // The defect left the key present, holding []. The key must be GONE.
    expect(db.has(`${DOCUMENTS_KEY_PREFIX}_doc-1`)).toBe(false);
  });

  it('a read of the deleted id is a genuine absence, not a COULD NOT READ alarm', async () => {
    await saveDocumentToDB('doc-2', docRecord('doc-2'));
    await deleteDocumentFromDB('doc-2');

    const loaded: StoredDocument | null = await loadDocumentFromDB('doc-2');
    expect(loaded).toBeNull();

    // With the tombstone, the read decoded [] to '' and JSON.parse threw —
    // logged as a read FAILURE. A deleted document is an absence, not one.
    const alarms: unknown[][] = logged.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('COULD NOT READ')));
    expect(alarms).toHaveLength(0);
  });

  it('deleting an already-absent key is a completed deletion, not an error', async () => {
    await expect(deleteDocumentFromDB('never-saved')).resolves.toBeUndefined();
  });

  // Opposite direction: deletion must not take other documents with it, and
  // a document that was NOT deleted must still round-trip. Without this, an
  // implementation that stores nothing (or deletes everything) passes above.
  it('a surviving document still loads after a sibling is deleted', async () => {
    await saveDocumentToDB('doc-a', docRecord('doc-a'));
    await saveDocumentToDB('doc-b', docRecord('doc-b'));

    await deleteDocumentFromDB('doc-a');

    const survivor: StoredDocument | null = await loadDocumentFromDB('doc-b');
    expect(survivor?.metadata.id).toBe('doc-b');
  });
});
