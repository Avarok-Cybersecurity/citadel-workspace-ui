/**
 * A document that could not be READ is not a document that does not exist.
 *
 * `loadDocumentFromDB` caught every error and returned `null`. Its own comment
 * said why that was wrong -- "null is read upstream as 'this document does not
 * exist', which is a fine answer for an absent key and a wrong one for a read
 * that failed" -- and then returned null anyway.
 *
 * `adoptDocument` acts on that null: `if (await this.loadDocument(docId))
 * return;` and otherwise writes a fresh revision-0 document. So one routine 5s
 * LocalDB timeout replaced a real document with an empty one, permanently, and
 * reported nothing.
 *
 * `isGenuinelyAbsent` was written for exactly this, and its doc names the same
 * failure in the message store. It was already applied correctly fifty lines
 * below in this same file, in `deleteDocumentFromDB`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendLocalDBGet = vi.fn();
vi.mock('@/lib/websocket-service', () => ({
  websocketService: {
    sendLocalDBGet: (...a: unknown[]) => sendLocalDBGet(...a),
    sendLocalDBSet: vi.fn(),
    sendLocalDBDelete: vi.fn(),
  },
}));

let loadDocumentFromDB: (id: string) => Promise<unknown>;

beforeEach(async () => {
  vi.resetModules();
  sendLocalDBGet.mockReset();
  ({ loadDocumentFromDB } = await import('../persistence'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a read failure is not an absent document', () => {
  it('throws when the read failed, so nothing overwrites the stored document', async () => {
    // The defect: a timeout is not "no such key".
    sendLocalDBGet.mockRejectedValue(new Error('Request timed out after 5000ms'));

    await expect(loadDocumentFromDB('doc-1')).rejects.toThrow(/timed out/i);
  });

  it('still reports null when the key is genuinely absent', async () => {
    // The control. Without it the fix could throw on everything, and a first
    // run could never create a document at all -- which no assertion about
    // timeouts would notice.
    sendLocalDBGet.mockRejectedValue(new Error('Key not found'));

    await expect(loadDocumentFromDB('doc-1')).resolves.toBeNull();
  });

  it('reports null for an empty response, which is also genuine absence', async () => {
    sendLocalDBGet.mockResolvedValue(null);

    await expect(loadDocumentFromDB('doc-1')).resolves.toBeNull();
  });
});
