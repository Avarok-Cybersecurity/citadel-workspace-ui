/**
 * A document that could not be READ must never be treated as one that does not
 * exist.
 *
 * `sendLocalDBGet` rejects for BOTH "no such key" and "the request timed out
 * after 5s" / "the socket is down". `loadDocumentFromDB` caught every rejection
 * and returned `null` either way — under a comment that said, in as many words,
 * "reporting it as missing, which it may not be".
 *
 * `adoptDocument` acts on exactly that difference. It is documented as
 * idempotent so any open path may call it freely, and it decides by
 * `if (await this.loadDocument(docId)) return;`. A null answer therefore means
 * "not stored yet", and it writes a FRESH EMPTY document over the key — losing
 * the content and the entire revision chain. With a peer online the CRDT refills
 * the text and the history is still gone; alone or offline, the document is
 * blank.
 *
 * The distinction was already drawn in the same file, twenty lines below, by
 * `deleteDocumentFromDB`: "A key already absent is a deletion already done ...
 * Real failures must surface." The fix existed next to the defect and had not
 * been applied to it.
 *
 * Both directions are asserted at both levels. Without the absence cases, a
 * loader that rethrew everything would satisfy the failure cases and break the
 * ordinary "this document is new" path that adopt exists for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- level 1: the loader itself, against a real LocalDB shape ----

const dbGet: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendLocalDBGet: dbGet,
    sendLocalDBSet: vi.fn(async () => undefined),
    sendLocalDBDelete: vi.fn(async () => undefined),
  },
}));

const { loadDocumentFromDB } = await import('../persistence');

describe('reading a stored document', () => {
  beforeEach(() => {
    dbGet.mockReset();
  });

  it('rethrows a read that FAILED, rather than calling it absent', async () => {
    // The message the agent actually sends when a LocalDB request times out.
    dbGet.mockRejectedValue(new Error('LocalDB request timed out after 5000ms'));

    await expect(loadDocumentFromDB('doc-1')).rejects.toThrow(/timed out/);
  });

  it('still answers null for a key that genuinely is not there', async () => {
    // The control. A loader that rethrew everything would pass the test above
    // and make every first-open of a new document throw.
    dbGet.mockRejectedValue(new Error('Key not found'));

    await expect(loadDocumentFromDB('doc-1')).resolves.toBeNull();
  });

  it('still answers null for an empty response, which is how absence arrives', async () => {
    dbGet.mockResolvedValue(null);

    await expect(loadDocumentFromDB('doc-1')).resolves.toBeNull();
  });
});
