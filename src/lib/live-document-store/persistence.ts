/**
 * Live Document Store - Persistence
 *
 * LocalDB read/write helpers for documents and the document index.
 */

import { websocketService } from '@/lib/websocket-service';
import { stringToBytes } from '@/lib/utils/encoding-utils';

import { DOCUMENTS_KEY_PREFIX, DOCUMENTS_INDEX_KEY , type StoredDocument } from './types';
import { isGenuinelyAbsent } from '@/lib/storage/absence';
import { readDocumentIndex, readStoredDocument } from './stored-reads';

export { decodeValue } from './stored-reads';

/**
 * Load a single document from LocalDB by its ID.
 *
 * A failed read is rethrown, not reported as absence (stored-reads.ts). `null` is read
 * upstream as "this document does not exist", and `adoptDocument` treats null as "not stored
 * yet" and writes a FRESH EMPTY document over the key, so one timed-out read on reopening a
 * document once replaced its content and its whole revision chain.
 */
export function loadDocumentFromDB(docId: string): Promise<StoredDocument | null> {
  return readStoredDocument(websocketService, docId);
}

/**
 * Save a single document to LocalDB.
 */
export async function saveDocumentToDB(docId: string, doc: StoredDocument): Promise<void> {
  const key: string = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
  const valueStr: string = JSON.stringify(doc);
  const valueBytes: number[] = stringToBytes(valueStr);

  await websocketService.sendLocalDBSet(0n, key, valueBytes);
}

/**
 * Load the document index (list of document IDs) from LocalDB.
 *
 * Its result decides what the index gets OVERWRITTEN with: an empty return for a failed read
 * would leave the caller's cache empty, and the next createDocument would write an index of
 * exactly one id over the real one. stored-reads.ts rethrows anything but absence.
 */
export function loadIndexFromDB(): Promise<string[]> {
  return readDocumentIndex(websocketService);
}

/**
 * Save the document index to LocalDB.
 */
export async function saveIndexToDB(docIds: string[]): Promise<void> {
  const valueStr: string = JSON.stringify(docIds);
  const valueBytes: number[] = stringToBytes(valueStr);
  await websocketService.sendLocalDBSet(0n, DOCUMENTS_INDEX_KEY, valueBytes);
}

/**
 * Delete a document from LocalDB.
 *
 * A real delete, as MessagePaginationStore issues. This used to WRITE an
 * empty array over the key instead -- a tombstone the backend cannot tell
 * from data. Deleted keys therefore accumulated forever, and a later read of
 * one decoded `[]` to '' and failed JSON.parse, logging the "COULD NOT READ"
 * false alarm above for a document that was deliberately removed.
 */
export async function deleteDocumentFromDB(docId: string): Promise<void> {
  const key: string = `${DOCUMENTS_KEY_PREFIX}_${docId}`;
  try {
    await websocketService.sendLocalDBDelete(0n, key);
  } catch (error) {
    // A key already absent is a deletion already done; the tombstone this
    // replaces never surfaced that case either. Real failures must surface.
    if (!isGenuinelyAbsent(error)) throw error;
  }
}
